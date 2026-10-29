// Les garde-fous de l'IA — **le seul endroit** où se trouvent les seuils qui
// bornent un usage de l'IA (15/10/2026, point 79 de la feuille de route ;
// réduits à l'essentiel le 22/10/2026).
//
// Principe posé par Sylvain : la seule limite d'un usage est la **taille de la
// demande, en signes** (« signes par demande », réglage d'instance, back-office
// → server/reglagesIa.js), avec les demandes par heure et les signes par mois.
// Il restait vingt-neuf autres seuils, presque tous des plafonds que le modèle
// respecte de lui-même ou que le fournisseur impose avec une erreur claire :
// avec peu d'usages et des abonnements aux limites dures, vingt ont été
// supprimés (tailles de passage, de commentaire et de note, nombres d'éléments
// par appel, plafonds de lecture, de recherche et de plan, taille de
// l'historique de Margo, réponses simultanées…). Ne restent que ce qui évite
// une boucle coûteuse ou un blocage par le fournisseur :
//
//   - `modele`      : une limite que le modèle impose (ce qu'il peut produire en
//                     une fois) ;
//   - `emballement` : un verrou contre une boucle ou un client emballé, placé
//                     bien au-dessus de tout usage normal, qui ne se déclenche
//                     que si quelque chose tourne mal.
//
// Serveur (ai, dialogue, mcp, agentTexte, connecteur, routes) lit
// `garde('identifiant')`. Les valeurs se règlent dans le back-office
// (#/admin/ia, « Garde-fous »), pour toute l'instance, et se rétablissent une à
// une. La documentation est produite depuis cette liste :
// `node tools/garde-fous-doc.mjs`.
//
// Ce que ce fichier ne contient pas, volontairement : les limites de sécurité
// (essais de secret d'une invitation, inscriptions, contact…), qui ne sont pas
// des usages de l'IA, la taille d'un corps de requête de l'interface
// (`CORPS_JSON_OCTETS_MAX`, garde de transport), et les valeurs par défaut de
// pagination (40 blocs lus par défaut, 20 résultats de recherche par défaut),
// qui ne limitent rien.

import { ErreurHttp } from './erreurs.js'

export const GROUPES = Object.freeze([
  {
    id: 'appels',
    nom: 'Appels au modèle (tous les usages)',
    resume: 'Ce que le modèle peut produire en un appel.',
  },
  {
    id: 'corrections',
    nom: 'Corrections IA',
    resume: 'Le panneau de la barre latérale : un appel par paragraphe.',
  },
  {
    id: 'margo',
    nom: 'Margo',
    resume: 'Le dialogue flottant : une boucle de lecture, d’outils et de réponse.',
  },
  {
    id: 'outils',
    nom: 'Écritures sur le document (Margo et « inviter Claude »)',
    resume: 'Le même moteur d’outils sert Margo et le connecteur.',
  },
  {
    id: 'connecteur',
    nom: 'Connecteur « inviter Claude »',
    resume: 'Les requêtes qui arrivent par l’adresse secrète d’une invitation.',
  },
])

/** `nature` : `modele` (le modèle l’impose) ou `emballement` (verrou). */
const DEFINITIONS = [
  // --- Appels au modèle ---------------------------------------------------
  {
    id: 'sortieMaxJetons',
    groupe: 'appels',
    nom: 'Sortie d’un appel, au plus',
    unite: 'jetons',
    defaut: 16_384,
    min: 1_024,
    max: 128_000,
    nature: 'modele',
    quoi: 'Le budget de sortie demandé au modèle pour un appel, réflexion comprise. C’est ce que le modèle peut écrire en une fois (≈ 24 000 signes de français). Une réponse qui le dépasse est coupée : Corrections IA la refuse (« sélectionnez un passage plus court »), Margo la jette et reprend en plus petit.',
  },

  // --- Corrections IA ------------------------------------------------------
  {
    id: 'correctionsEnParallele',
    groupe: 'corrections',
    nom: 'Paragraphes envoyés en même temps',
    unite: 'appels simultanés',
    defaut: 8,
    min: 1,
    max: 64,
    nature: 'emballement',
    quoi: 'Combien de paragraphes d’une même demande sont envoyés au modèle à la fois. Ce n’est pas une limite de taille : tous les paragraphes sont traités, dans l’ordre. Mais mille appels simultanés se heurteraient aux limites de débit du fournisseur.',
  },

  // --- Margo ---------------------------------------------------------------
  {
    id: 'margoEtapes',
    groupe: 'margo',
    nom: 'Étapes d’une demande, au plus',
    unite: 'allers-retours avec le modèle',
    defaut: 100,
    min: 5,
    max: 10_000,
    nature: 'emballement',
    quoi: 'Une demande à Margo est une boucle (lire, proposer, relire…). Une demande normale en consomme 20 à 40. Au-delà, un dernier appel sans outil demande à Margo de dire ce qui est fait et ce qui reste, au lieu d’une coupure sèche. Margo n’en est pas informée.',
  },
  {
    id: 'margoCoupures',
    groupe: 'margo',
    nom: 'Reprises après une réponse coupée, au plus',
    unite: 'reprises par demande',
    defaut: 2,
    min: 0,
    max: 20,
    nature: 'emballement',
    quoi: 'Quand une réponse est coupée par la sortie maximale, au milieu d’un appel d’outil, elle est jetée et Margo reprend en plus petit. Après ce nombre de reprises, la demande s’arrête et le dit.',
  },
  {
    id: 'margoRelances',
    groupe: 'margo',
    nom: 'Nouvelles tentatives en cas d’erreur du fournisseur, au plus',
    unite: 'tentatives par appel',
    defaut: 2,
    min: 0,
    max: 10,
    nature: 'emballement',
    quoi: 'Si le fournisseur répond une erreur serveur (5xx), l’appel est retenté après 1 s, puis 4 s, puis 9 s… Si le fournisseur répond « trop de demandes » (429, quota de jetons ou de demandes par minute de l’organisation), Margo attend plus longtemps avant de retenter : le délai annoncé par le fournisseur (en-tête retry-after, 60 s au plus), sinon 20 s. Au-delà de ce nombre de tentatives, l’erreur est montrée à la personne. Pour un très long document sur un fournisseur à quota serré (Scaleway avant vérification d’identité), relever ce nombre.',
  },
  {
    id: 'margoMargeLecture',
    groupe: 'margo',
    nom: 'Marge de lecture au-delà de « signes par demande »',
    unite: '% de la limite en signes',
    defaut: 120,
    min: 100,
    max: 1_000,
    nature: 'emballement',
    quoi: 'Margo peut relire le document autant que nécessaire, mais le texte lu pendant une demande est plafonné à la limite « signes par demande » majorée de ce pourcentage (le texte rendu porte les numéros de bloc, qui ne sont pas du texte de la personne). Au-delà, Margo reçoit un message qui le dit et en informe la personne.',
  },

  // --- Outils sur le document ---------------------------------------------
  {
    id: 'ecrituresParHeure',
    groupe: 'outils',
    nom: 'Écritures par heure et par invité',
    unite: 'appels d’outils d’écriture',
    defaut: 120,
    min: 1,
    max: 1_000_000,
    nature: 'emballement',
    quoi: 'Appels aux outils qui écrivent (proposer, ajouter, ajouter_note, commenter, répondre), comptés par invitation (connecteur) ou par conversation (Margo, par personne et par document) sur une heure glissante. Un appel peut porter plusieurs propositions : ce n’est pas le nombre de corrections.',
  },

  // --- Connecteur ----------------------------------------------------------
  {
    id: 'lotMcp',
    groupe: 'connecteur',
    nom: 'Messages d’un lot JSON-RPC, au plus',
    unite: 'messages',
    defaut: 20,
    min: 1,
    max: 1_000,
    nature: 'emballement',
    quoi: 'Le protocole MCP permet d’envoyer plusieurs messages dans une même requête. Un lot plus grand est refusé en entier (il était auparavant tronqué sans avertissement).',
  },
  {
    id: 'corpsMcpOctets',
    groupe: 'connecteur',
    nom: 'Taille d’une requête du connecteur, au plus',
    unite: 'octets',
    defaut: 4 * 1024 * 1024,
    min: 16_384,
    max: 64 * 1024 * 1024,
    nature: 'emballement',
    quoi: 'La taille du corps d’une requête reçue par l’adresse d’une invitation. Protège la mémoire du serveur ; doit rester au-dessus de ce qu’un appel d’écriture complet peut porter (la sortie maximale d’un appel, soit environ 64 000 octets, plus l’enveloppe).',
  },
]

export const GARDE_FOUS = Object.freeze(DEFINITIONS.map((d) => Object.freeze({ ...d })))
const PAR_ID = new Map(GARDE_FOUS.map((g) => [g.id, g]))

/** L'enveloppe d'un corps de requête JSON (clés, identifiants, marques) en plus
 * du texte : structure, pas un réglage. */
export const ENVELOPPE_CORPS_OCTETS = 50_000
/** La taille d'un corps de requête JSON de l'interface (conversation de Margo,
 * réglages du back-office) : un garde de transport, pas un réglage d'usage. Il
 * protège la mémoire du serveur ; une conversation qui le dépasse est refusée
 * en le disant, et celle qui dépasse la fenêtre du modèle revient du
 * fournisseur en erreur, que Margo traduit. */
export const CORPS_JSON_OCTETS_MAX = 2 * 1024 * 1024
/** Un signe pèse au plus 4 octets en UTF-8. */
export const OCTETS_PAR_SIGNE = 4

/** Les valeurs réglées par l'administrateur, qui diffèrent du défaut. */
let surcharges = {}

const entierValide = (g, v) => Number.isInteger(v) && v >= g.min && v <= g.max

/** La valeur en vigueur d'un garde-fou. Une faute de frappe dans l'identifiant
 * lève une erreur : un seuil introuvable ne retombe jamais sur « pas de limite ». */
export function garde(id) {
  const g = PAR_ID.get(id)
  if (!g) throw new Error(`garde-fou inconnu : ${id}`)
  return Object.hasOwn(surcharges, id) ? surcharges[id] : g.defaut
}

/** Rend sûre une table lue du disque : seules restent les valeurs valides qui
 * diffèrent du défaut. */
export function assainirGardeFous(brut) {
  const r = {}
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return r
  for (const [id, v] of Object.entries(brut)) {
    const g = PAR_ID.get(id)
    if (g && entierValide(g, v) && v !== g.defaut) r[id] = v
  }
  return r
}

/** Adopte les valeurs réglées (remplace les précédentes). */
export function appliquerGardeFous(brut) {
  surcharges = assainirGardeFous(brut)
}

/** Les valeurs réglées (seulement celles qui diffèrent du défaut). */
export function gardeFousRegles() {
  return { ...surcharges }
}

/** Toutes les valeurs en vigueur, par identifiant. */
export function gardeFousEnVigueur() {
  return Object.fromEntries(GARDE_FOUS.map((g) => [g.id, garde(g.id)]))
}

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** Valide une modification `{ id: nombre | null }` (`null` rétablit le défaut) ;
 * lève une `ErreurHttp` 400 qui dit quoi corriger. Renvoie la table complète
 * des valeurs réglées après modification. */
export function validerGardeFous(patch, actuel = surcharges) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ErreurHttp(400, 'garde-fous illisibles')
  const suivant = { ...actuel }
  for (const [id, v] of Object.entries(patch)) {
    const g = PAR_ID.get(id)
    if (!g) throw new ErreurHttp(400, `Garde-fous : réglage inconnu « ${String(id).slice(0, 40)} ».`)
    if (v === null) {
      delete suivant[id]
      continue
    }
    if (!entierValide(g, v))
      throw new ErreurHttp(400, `Garde-fous : « ${g.nom} » doit être un entier entre ${fmt(g.min)} et ${fmt(g.max)}.`)
    if (v === g.defaut) delete suivant[id]
    else suivant[id] = v
  }
  return suivant
}

/** Octets qu'une demande de `signes` signes peut peser en JSON : de quoi
 * porter le texte sans que la limite d'octets passe avant la limite en signes. */
export function corpsMaxOctets(signes) {
  return signes * OCTETS_PAR_SIGNE + ENVELOPPE_CORPS_OCTETS
}
