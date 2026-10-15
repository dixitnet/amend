// Les garde-fous de l'IA — **le seul endroit** où se trouvent les seuils qui
// bornent un usage de l'IA (15/10/2026, point 79 de la feuille de route).
//
// Principe posé par Sylvain : la seule limite d'un usage est la **taille de la
// demande, en signes** (« signes par demande », réglage d'instance, back-office
// → server/reglagesIa.js). Tout le reste ne doit être qu'une de ces deux choses :
//
//   - `modele`      : une limite que le modèle impose (ce qu'il peut produire ou
//                     recevoir en une fois) ;
//   - `emballement` : un verrou contre une boucle ou un client emballé, placé
//                     bien au-dessus de tout usage normal, qui ne se déclenche
//                     que si quelque chose tourne mal.
//
// Aucun autre fichier de l'IA ne définit de seuil : serveur (ai, dialogue, mcp,
// agentTexte, connecteur, routes) lit `garde('identifiant')`. Un test
// (`garde-fous.test.js`) échoue si une constante de seuil réapparaît ailleurs.
//
// Les valeurs se règlent dans le back-office (#/admin/ia, « Garde-fous »),
// pour toute l'instance, et se rétablissent une à une. La documentation
// complète est produite depuis cette liste : `node tools/garde-fous-doc.mjs`.
//
// Ce que ce fichier ne contient pas, volontairement : les limites de sécurité
// (essais de secret d'une invitation, inscriptions, contact…), qui ne sont pas
// des usages de l'IA, et les valeurs par défaut de pagination (40 blocs lus
// par défaut, 20 résultats de recherche par défaut), qui ne limitent rien.

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
    nom: 'Outils sur le document (Margo et « inviter Claude »)',
    resume: 'Ce que chaque appel d’outil peut lire ou écrire ; le même moteur sert Margo et le connecteur.',
  },
  {
    id: 'connecteur',
    nom: 'Connecteur « inviter Claude »',
    resume: 'Les requêtes qui arrivent par l’adresse secrète d’une invitation.',
  },
  {
    id: 'reglages',
    nom: 'Back-office',
    resume: 'Les réglages eux-mêmes.',
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
  {
    id: 'sortieMinJetonsCorrection',
    groupe: 'appels',
    nom: 'Sortie d’un paragraphe corrigé, au moins',
    unite: 'jetons',
    defaut: 4_096,
    min: 256,
    max: 128_000,
    nature: 'modele',
    quoi: 'Plancher du budget de sortie d’un paragraphe de Corrections IA, dont le budget suit sinon la longueur du paragraphe (deux fois sa longueur estimée en jetons). Évite qu’un paragraphe court soit coupé parce que le modèle a un peu réfléchi.',
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

  {
    id: 'consigneSignes',
    groupe: 'corrections',
    nom: 'Consigne d’un bouton, au plus',
    unite: 'signes',
    defaut: 2_000,
    min: 100,
    max: 100_000,
    nature: 'emballement',
    quoi: 'Les consignes de Corrections IA viennent toutes de boutons (quelques dizaines de signes) : une consigne plus longue ne peut venir que d’un client emballé. Elle n’entre pas dans les signes de la demande.',
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
    quoi: 'Si le fournisseur répond « trop de demandes » (429) ou une erreur serveur (5xx), l’appel est retenté après 1 s, puis 4 s. Au-delà, l’erreur est montrée à la personne.',
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
  {
    id: 'margoMessages',
    groupe: 'margo',
    nom: 'Messages d’une conversation, au plus',
    unite: 'messages',
    defaut: 200,
    min: 2,
    max: 100_000,
    nature: 'emballement',
    quoi: 'Le nombre de messages (de la personne et de Margo) renvoyés à chaque tour. Une conversation normale en compte moins de trente.',
  },
  {
    id: 'margoHistorique',
    groupe: 'margo',
    nom: 'Historique d’une conversation, au plus',
    unite: 'signes',
    defaut: 400_000,
    min: 1_000,
    max: 5_000_000,
    nature: 'modele',
    quoi: 'La taille de l’historique renvoyé au modèle à chaque tour. 400 000 signes font environ 100 000 jetons, ce que Claude (200 000) et Mistral Large 4 (256 000) acceptent en entrée, avec de la place pour le texte lu et la réponse. À régler selon la fenêtre du modèle choisi.',
  },
  {
    id: 'margoSimultanes',
    groupe: 'margo',
    nom: 'Réponses menées en même temps sur l’instance',
    unite: 'conversations simultanées',
    defaut: 20,
    min: 1,
    max: 10_000,
    nature: 'emballement',
    quoi: 'Pour toute l’instance, tous documents et personnes confondus. Ménage les limites de débit du fournisseur. En plus : une seule réponse à la fois par personne et par document (verrou fixe, qui évite le double clic).',
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
  {
    id: 'remplacementsParAppel',
    groupe: 'outils',
    nom: 'Remplacements par appel de « proposer »',
    unite: 'remplacements',
    defaut: 30,
    min: 1,
    max: 1_000,
    nature: 'modele',
    quoi: 'Combien de remplacements tiennent dans un appel (ce que le modèle écrit en une fois). Le surplus est refusé en le disant, et le modèle renvoie les suivants dans un nouvel appel.',
  },
  {
    id: 'ajoutsParAppel',
    groupe: 'outils',
    nom: 'Ajouts par appel de « ajouter »',
    unite: 'ajouts',
    defaut: 20,
    min: 1,
    max: 1_000,
    nature: 'modele',
    quoi: 'Combien d’ajouts de paragraphes tiennent dans un appel.',
  },
  {
    id: 'lignesParAjout',
    groupe: 'outils',
    nom: 'Paragraphes par ajout',
    unite: 'paragraphes',
    defaut: 10,
    min: 1,
    max: 1_000,
    nature: 'modele',
    quoi: 'Un ajout est un texte dont chaque ligne devient un paragraphe. Au-delà, l’ajout est refusé et le modèle le scinde.',
  },
  {
    id: 'notesParAppel',
    groupe: 'outils',
    nom: 'Notes par appel de « ajouter_note »',
    unite: 'notes',
    defaut: 20,
    min: 1,
    max: 1_000,
    nature: 'modele',
    quoi: 'Combien de notes de bas de page tiennent dans un appel.',
  },
  {
    id: 'commentairesParAppel',
    groupe: 'outils',
    nom: 'Commentaires par appel de « commenter »',
    unite: 'commentaires',
    defaut: 20,
    min: 1,
    max: 1_000,
    nature: 'modele',
    quoi: 'Combien de commentaires tiennent dans un appel.',
  },
  {
    id: 'longueurAvant',
    groupe: 'outils',
    nom: 'Passage à remplacer (« avant »), au plus',
    unite: 'signes',
    defaut: 20_000,
    min: 100,
    max: 1_000_000,
    nature: 'emballement',
    quoi: 'Longueur du passage qu’un remplacement désigne. Les consignes du modèle lui demandent de le garder court ; ce verrou n’existe que contre un modèle qui désignerait des pages entières.',
  },
  {
    id: 'longueurApres',
    groupe: 'outils',
    nom: 'Texte de remplacement ou d’ajout, au plus',
    unite: 'signes',
    defaut: 20_000,
    min: 100,
    max: 1_000_000,
    nature: 'emballement',
    quoi: 'Longueur du texte qui remplace un passage (« apres ») ou du texte d’un ajout. Réécrire un très long paragraphe en une proposition reste possible.',
  },
  {
    id: 'longueurCommentaire',
    groupe: 'outils',
    nom: 'Commentaire ou réponse, au plus',
    unite: 'signes',
    defaut: 10_000,
    min: 100,
    max: 1_000_000,
    nature: 'emballement',
    quoi: 'Longueur d’un commentaire posé dans la marge ou d’une réponse dans un fil.',
  },
  {
    id: 'longueurNote',
    groupe: 'outils',
    nom: 'Note de bas de page, au plus',
    unite: 'signes',
    defaut: 10_000,
    min: 100,
    max: 1_000_000,
    nature: 'emballement',
    quoi: 'Longueur du texte d’une note de bas de page ajoutée.',
  },
  {
    id: 'lireBlocsMax',
    groupe: 'outils',
    nom: 'Blocs lus par appel de « lire », au plus',
    unite: 'blocs',
    defaut: 200,
    min: 1,
    max: 100_000,
    nature: 'modele',
    quoi: 'Un bloc est un paragraphe, un titre, un élément de liste. Le modèle lit par tranches et enchaîne avec `de` : ce n’est pas une limite sur la quantité lue au total.',
  },
  {
    id: 'lireSignesParReponse',
    groupe: 'outils',
    nom: 'Texte rendu par un appel de « lire », au plus',
    unite: 'signes',
    defaut: 60_000,
    min: 1_000,
    max: 5_000_000,
    nature: 'modele',
    quoi: 'La réponse d’un appel de lecture s’arrête au dernier bloc entier qui tient dans ce volume (≈ 20 000 jetons) et indique où reprendre. Ce n’est pas une limite sur la quantité lue au total.',
  },
  {
    id: 'chercherResultatsMax',
    groupe: 'outils',
    nom: 'Résultats de « chercher », au plus',
    unite: 'résultats',
    defaut: 100,
    min: 1,
    max: 100_000,
    nature: 'modele',
    quoi: 'Nombre de passages renvoyés pour une recherche (20 par défaut, le modèle peut en demander jusqu’à ce plafond).',
  },
  {
    id: 'planTitresMax',
    groupe: 'outils',
    nom: 'Titres montrés par « plan », au plus',
    unite: 'titres',
    defaut: 300,
    min: 10,
    max: 100_000,
    nature: 'modele',
    quoi: 'Le plan liste les titres du document avec leur taille ; au-delà, il dit combien d’autres titres existent (le modèle les trouve avec `lire`).',
  },
  {
    id: 'commentairesAffichesMax',
    groupe: 'outils',
    nom: 'Fils montrés par « commentaires », au plus',
    unite: 'fils de commentaires',
    defaut: 100,
    min: 10,
    max: 100_000,
    nature: 'modele',
    quoi: 'Au-delà, la liste dit combien de fils de plus existent.',
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
    quoi: 'La taille du corps d’une requête reçue par l’adresse d’une invitation. Protège la mémoire du serveur ; doit rester au-dessus de ce qu’un appel d’écriture complet peut porter (30 remplacements de 20 000 signes ≈ 2,4 Mo en UTF-8).',
  },

  // --- Back-office ---------------------------------------------------------
  {
    id: 'maniereSignes',
    groupe: 'reglages',
    nom: 'Manière de répondre de Margo, au plus',
    unite: 'signes',
    defaut: 5_000,
    min: 200,
    max: 100_000,
    nature: 'emballement',
    quoi: 'Le texte libre que l’administrateur ajoute à la consigne de Margo. Il est envoyé à chaque étape : plus il est long, plus chaque demande coûte.',
  },
]

export const GARDE_FOUS = Object.freeze(DEFINITIONS.map((d) => Object.freeze({ ...d })))
const PAR_ID = new Map(GARDE_FOUS.map((g) => [g.id, g]))

/** L'enveloppe d'un corps de requête JSON (clés, identifiants, marques) en plus
 * du texte : structure, pas un réglage. */
export const ENVELOPPE_CORPS_OCTETS = 50_000
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
