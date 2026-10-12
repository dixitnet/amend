// File-based storage: no database. Each document is a title in a small
// JSON registry plus an append-only log of binary Yjs updates on disk.
// Deliberately simple so a self-hosted instance needs nothing but a
// writable folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { lireJson, ecrireJsonAtomique, ecrireAtomique } from './fichiers.js'
import { randomId } from './ws.js'
import { fusionner, reduire, assainir } from '../shared/style.js'
import { compterEcarts, ID_DEFAUT } from '../shared/modeles.js'
import { Modeles } from './modeles.js'
import { Journal } from './journal.js'
import { ListeAttente } from './listeAttente.js'
import { capabilities } from './roles.js'


// `updatedAt` d'un document actif n'est réécrit dans le registre qu'une fois
// toutes les 5 s (point 40, 11/10/2026) : chaque écriture relit, sérialise
// et remplace `docs.json` en entier, et un flush a lieu toutes les 200 ms
// par document qui reçoit des frappes. L'horodatage reste exact à 5 s près
// (un dernier report est toujours planifié, et l'arrêt les applique tous).
const TOUCH_MIN_MS = 5000




// La feuille de style ne vit plus ici : sa définition est dans
// shared/style.js, importée telle quelle par le serveur ET par le client.
// Avant le 16/09/2026, DEFAULT_STYLE était recopié à la main des deux
// côtés, « petite forme stable, pas de quoi partager un module » — ça a
// tenu jusqu'au jour où chaque niveau de titre a eu ses propres réglages.

/** Durée de validité d'un lien d'invitation nominatif (choix du
 * 15/09/2026 : assez long pour survivre à un week-end ou à des vacances,
 * assez court pour qu'une invitation oubliée ne reste pas une porte
 * ouverte indéfiniment). */
const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000
// Après la première acceptation, le lien reste valable ce temps-là seulement
// (ouvrir le mail sur son téléphone puis sur son ordinateur), pas 14 jours :
// un jeton ouvre une session au nom de la personne invitée.
const INVITATION_GRACE_MS = 60 * 60 * 1000

/** Ce qu'on garde d'un jeton d'invitation : son empreinte. Le jeton lui-même
 * n'existe que dans le courrier envoyé. Audit du 10/10/2026, S1 et S5. */
function empreinteJeton(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

/** Une entrée d'accès sans rien de ce qui permet de se connecter : jeton en
 * clair (ancien format), empreinte et expiration. Tout ce qui sort du
 * stockage vers l'API passe par là. */
function sansJeton(entree) {
  const { token, tokenHash, tokenExpiresAt, ...reste } = entree
  return reste
}

function accesSansJetons(meta) {
  return Array.isArray(meta.access) ? meta.access.map(sansJeton) : meta.access
}

/** Le propriétaire d'un document, à partir de ses métadonnées brutes.
 *
 * `owner` d'abord ; à défaut, l'**éditeur au `grantedAt` le plus ancien**,
 * qui est le créateur puisque `createDoc` l'inscrit comme premier éditeur au
 * moment de la création. Ce repli est ce qui permet au champ de fonctionner
 * sur les documents antérieurs au 17/09/2026 sans script de migration.
 *
 * Un document sans liste d'accès n'a pas de propriétaire : `null`.
 *
 * Fonction de module plutôt que méthode, parce qu'elle travaille sur les
 * métadonnées déjà en main — l'appeler depuis `listDocs` ne doit pas relire
 * le registre une fois par document, alors qu'il est déjà relu plusieurs
 * fois par requête (mesuré au test de charge n°3). */
function proprietaire(meta) {
  if (!meta) return null
  if (meta.owner) return meta.owner
  if (!Array.isArray(meta.access)) return null
  const editeurs = meta.access.filter((a) => a.role === 'editeur')
  if (!editeurs.length) return null
  return editeurs.reduce((plusAncien, a) =>
    (a.grantedAt || Infinity) < (plusAncien.grantedAt || Infinity) ? a : plusAncien
  ).email
}

export class Storage {
  constructor(
    dataDir,
    {
      maxUncompactedOps,
      compactionTrigger,
      maxUncompactedBytes,
    } = {}
  ) {
    this.dataDir = dataDir
    // Le journal Yjs : voir journal.js. Il date le document dans le registre
    // quand une écriture ou un compactage a eu lieu, et lui demande sa fiche
    // pour les dates de repli.
    this.journal = new Journal(dataDir, {
      maxUncompactedOps,
      compactionTrigger,
      maxUncompactedBytes,
      metaDoc: (id) => this._readRegistry()[id],
      apresEcriture: (id) => this._toucherEnDiffere(id),
      apresCompactage: (id) => this.touchDoc(id),
    })
    this.registryPath = join(dataDir, 'docs.json')
    this.stylePath = join(dataDir, 'style.json')
    // Les modèles de mise en page (01/10/2026, server/modeles.js). Le
    // registre ne sait rien des documents : on lui donne de quoi compter
    // ceux qui utilisent un modèle, et de quoi lire / écrire « Par défaut »,
    // qui est le style de l'instance.
    this.modeles = new Modeles(join(dataDir, 'modeles'), {
      lireInstance: () => this._lireStyle(this.stylePath),
      ecrireInstance: (style) => this.setStyle(style),
      enUsage: (id) => this.compterUsagesModele(id),
    })
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    this.listeAttente = new ListeAttente(dataDir, { aUnAcces: (email) => this.emailHasAnyAccess(email) })
    if (!existsSync(this.registryPath)) {
      writeFileSync(this.registryPath, JSON.stringify({}), 'utf8')
    }
    this._touchPrevus = new Map() // id -> minuteur : `updatedAt` à écrire au plus tard dans TOUCH_MIN_MS
  }

  /** Feuille de style par défaut de l'instance — celle que la page
   * « Mise en page » règle, et dont héritent les documents qui n'ont pas
   * la leur. Renvoyée complète (valeurs par défaut du code comprises). */
  getStyle() {
    return fusionner(this._lireStyle(this.stylePath))
  }

  setStyle(style) {
    return this._ecrireStyle(this.stylePath, style)
  }

  /** Feuille de style d'un document (16/09/2026). Un fichier par document,
   * à côté de son journal et de ses horodatages — surtout pas dans
   * `docs.json`, que `_readRegistry` relit et analyse plusieurs fois par
   * requête : à mille documents, un style de 840 octets chacun ferait
   * bientôt un mégaoctet reparsé à chaque appel d'API. Celui-ci n'est lu
   * qu'à l'ouverture du panneau et à l'export. */
  _stylePath(id) {
    return join(this.dataDir, `${id}.style.json`)
  }

  /** `true` si ce document a sa propre mise en page. Tant que c'est faux,
   * il suit le style par défaut de l'instance — y compris quand celui-ci
   * change. Dès qu'un éditeur y touche, elle devient la sienne et ne bouge
   * plus : une feuille de style d'instance modifiée ne doit pas reflouer
   * silencieusement sur un livre en cours. */
  hasOwnStyle(id) {
    return existsSync(this._stylePath(id))
  }

  /** Le modèle de mise en page d'un document (01/10/2026) : son
   * identifiant s'il en a choisi un et qu'il existe encore, sinon « Par
   * défaut ». C'est une **propriété du document** — enregistrée avec lui,
   * la même pour tous ses collaborateurs. */
  modeleDuDocument(id) {
    const meta = this._readRegistry()[id]
    return this.modeles.effectif(meta && meta.modele)
  }

  /** La feuille de style effective d'un document : valeurs par défaut du
   * code, puis le calque de son modèle (« Par défaut » = le style de
   * l'instance, tant qu'il n'a pas choisi), puis ses propres écarts. */
  getDocStyle(id) {
    return fusionner(this.modeles.couche(this.modeleDuDocument(id)), this._lireStyle(this._stylePath(id)))
  }

  /** Le calque de son modèle, complet : ce par rapport à quoi un document
   * enregistre ses écarts (voir `reduire`). */
  _baseDuDocument(id) {
    return fusionner(this.modeles.couche(this.modeleDuDocument(id)))
  }

  setDocStyle(id, style) {
    // Le modèle est passé à `reduire` : sans lui, un réglage ramené à la
    // valeur codée en dur (page A4 quand le modèle est en A5) disparaît du
    // fichier et le document retombe sur son modèle — voir `reduire`.
    // Deux régimes (voir `reduire`) : un document sur « Par défaut » fige
    // ce qu'il tient de l'instance (comportement d'avant les modèles) ; un
    // document qui a **choisi** un modèle n'enregistre que ses écarts à lui.
    const seulement = this.modeleDuDocument(id) !== ID_DEFAUT
    return this._ecrireStyle(this._stylePath(id), style, this._baseDuDocument(id), { seulement })
  }

  /** Combien de réglages propres ce document porte **réellement** par
   * rapport à son modèle : on compare la feuille effective à celle du
   * modèle, plutôt que de compter le fichier — un document sur « Par
   * défaut » en a figé beaucoup qui ne s'écartent de rien. */
  ecartsDuDocument(id) {
    if (!this.hasOwnStyle(id)) return 0
    return compterEcarts(reduire(this.getDocStyle(id), this._baseDuDocument(id), { seulement: true }))
  }

  /** Repasse un document à son modèle : on efface son fichier d'écarts. */
  resetDocStyle(id) {
    const p = this._stylePath(id)
    if (existsSync(p)) unlinkSync(p)
    return this.getDocStyle(id)
  }

  /** Change le modèle d'un document. Par défaut ses écarts propres sont
   * **abandonnés** : un réglage de page fait pour l'ancien modèle (un A5
   * demandé sur « Livre ») n'a plus de sens sur le nouveau, et conserver
   * des écarts en silence ferait que le document ne ressemble ni à l'un ni à
   * l'autre. `garderEcarts` les conserve quand même. Renvoie `null` si le
   * document n'existe pas. */
  setDocModele(id, modeleId, { garderEcarts = false } = {}) {
    const registry = this._readRegistry()
    if (!registry[id]) return null
    if (modeleId === ID_DEFAUT) delete registry[id].modele
    else registry[id].modele = modeleId
    this._writeRegistry(registry)
    if (!garderEcarts) this.resetDocStyle(id)
    return this.getDocStyle(id)
  }

  /** Tous les décomptes d'un coup (identifiant → nombre), pour la liste des
   * modèles : un seul passage sur le registre plutôt qu'un par modèle. */
  usagesModeles() {
    const n = new Map()
    for (const meta of Object.values(this._readRegistry())) {
      const id = this.modeles.effectif(meta && meta.modele)
      n.set(id, (n.get(id) || 0) + 1)
    }
    return n
  }

  /** Combien de documents utilisent ce modèle. « Par défaut » compte aussi
   * ceux qui n'en ont jamais choisi, et ceux dont le modèle a disparu. */
  compterUsagesModele(modeleId) {
    let n = 0
    for (const meta of Object.values(this._readRegistry())) {
      const effectif = this.modeles.effectif(meta && meta.modele)
      if (effectif === modeleId) n++
    }
    return n
  }

  _lireStyle(path) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      return null
    }
  }

  /** On n'enregistre que les écarts aux valeurs par défaut (`reduire`) :
   * un réglage qu'on n'a pas touché continue de suivre le défaut, et un
   * réglage ajouté plus tard au modèle apparaît tout seul. Écriture
   * atomique, comme le registre. */
  _ecrireStyle(path, style, instance = null, options = {}) {
    // `assainir` : ce qui est enregistré est toujours dans le domaine que
    // le modèle sait rendre (listes fermées, bornes) — un modèle partagé
    // porteur d'une marge « abc » ferait échouer l'export de tous ses
    // documents.
    const complet = assainir(style)
    ecrireAtomique(path, JSON.stringify(reduire(complet, instance, options), null, 2))
    return complet
  }

  // --- La liste d'attente (listeAttente.js) : mêmes noms qu'avant l'extraction ---

  addToWaitlist(email) {
    return this.listeAttente.ajouter(email)
  }

  waitlist() {
    return this.listeAttente.lire()
  }

  marquerEmbarque(email, docId, par) {
    return this.listeAttente.marquerEmbarque(email, docId, par)
  }

  fileAttente() {
    return this.listeAttente.file()
  }

  _readRegistry() {
    // Illisible ≠ vide : voir fichiers.js (audit A1).
    return lireJson(this.registryPath, {})
  }

  _writeRegistry(registry) {
    // Write to a temp file then rename, so a crash mid-write can't corrupt
    // the registry.
    ecrireJsonAtomique(this.registryPath, registry)
  }

  /** `email` : si fourni, ne renvoie que les documents accessibles à cette
   * personne (éditeur ou correcteur) — les documents sans liste d'accès
   * (créés avant cette fonctionnalité) restent visibles à tout le monde,
   * connecté ou non, pour ne pas casser les documents existants. Sans
   * email (pas connecté), seuls ces documents "ouverts" apparaissent. */
  listDocs(email) {
    const registry = this._readRegistry()
    return Object.entries(registry)
      .filter(([, meta]) => {
        if (meta.corbeille) return false
        if (!email || !Array.isArray(meta.access)) return false
        return meta.access.some((a) => a.email === email)
      })
      .map(([id, meta]) => ({
        id,
        ...meta,
        access: accesSansJetons(meta),
        myRole: (meta.access.find((a) => a.email === email) || {}).role || null,
        myCapabilities: capabilities((meta.access.find((a) => a.email === email) || {}).role || null),
        // Pour que la liste sache afficher « Supprimer » au propriétaire et
        // « Quitter » aux autres, sans une requête par document.
        owner: proprietaire(meta),
        jeSuisProprietaire: !!email && proprietaire(meta) === email,
      }))
      // Du plus récemment modifié au plus ancien. Les favoris sont personnels
      // (server/rangement.js) : c'est la page qui les met en tête.
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }

  getDoc(id) {
    const registry = this._readRegistry()
    const meta = registry[id]
    if (!meta) return null
    // Jamais de jeton d'invitation dans ce qui sort d'ici : getDoc() alimente
    // des réponses de l'API lisibles par tout membre, lecteur compris.
    return { id, ...meta, access: accesSansJetons(meta) }
  }

  /** `creatorEmail` : si fourni, cette personne devient immédiatement
   * éditrice du document (voir claude/conception-gestion-utilisateurs.md,
   * projet Amend). Un document créé sans email (ne devrait plus arriver
   * depuis que POST /api/docs exige une session, mais gardé permissif ici)
   * n'a pas de liste d'accès — et n'est donc accessible à personne depuis
   * le 28/09/2026 (voir roleFor). */
  createDoc(title, creatorEmail) {
    const registry = this._readRegistry()
    const id = randomId()
    const now = Date.now()
    const meta = { title: title || 'Sans titre', createdAt: now, updatedAt: now }
    if (creatorEmail) {
      // Le créateur porte le document (17/09/2026) : `owner` est un champ à
      // part, pas un rôle — voir `ownerOf` plus bas.
      meta.owner = creatorEmail
      meta.access = [{ email: creatorEmail, role: 'editeur', grantedAt: now }]
    }
    registry[id] = meta
    this._writeRegistry(registry)
    writeFileSync(this.cheminDuJournal(id), Buffer.alloc(0))
    return { id, ...registry[id] }
  }

  /** Rôle de cet email sur ce document, ou null si aucun accès. Un
   * document sans liste d'accès (créé avant cette fonctionnalité, ou sans
   * creatorEmail — voir createDoc) était traité comme ouvert : tout le
   * monde y était « editeur », **même sans session**. Fermé le 28/09/2026
   * (claude/etude-roles-serveur.md, phase 0) : aucun document de
   * production n'était dans ce cas (0 à migrer le 14/09), et une porte
   * ouverte dans le code reste une porte ouverte. Un tel document n'est
   * accessible qu'aux administrateurs, par les routes qui les distinguent. */
  roleFor(id, email) {
    const doc = this.getDoc(id)
    if (!doc) return null
    // Un document à la corbeille n'a plus de rôle pour personne (12/10/2026) :
    // c'est le point de contrôle unique — API, WebSocket, connecteurs,
    // exports et publication passent tous par ici.
    if (doc.corbeille) return null
    if (!Array.isArray(doc.access)) return null
    if (!email) return null
    const entry = doc.access.find((a) => a.email === email)
    return entry ? entry.role : null
  }

  /** Le propriétaire d'un document, ou `null`.
   *
   * Le champ `owner` n'existe que depuis le 17/09/2026 : pour les
   * documents antérieurs, on le **déduit** de la liste d'accès — l'éditeur
   * au `grantedAt` le plus ancien est le créateur, puisque `createDoc`
   * l'inscrit comme premier éditeur au moment même de la création. C'est
   * une quasi-certitude aujourd'hui (six documents en production) et ce
   * serait un pari dans six mois : d'où le champ posé maintenant, et ce
   * repli qui évite d'avoir à lancer un script de migration pour que ça
   * marche.
   *
   * Un document **sans liste d'accès** (les « ouverts » d'avant le contrôle
   * d'accès) n'a pas de propriétaire possible : personne n'y est inscrit.
   * Il n'en a donc pas, et garde son comportement d'avant — tout le monde
   * y est éditeur, y compris pour le supprimer. Il n'en existe aucun en
   * production (migration du 14/09 : 0 document concerné). */
  /** Les identifiants des documents dont cette adresse est propriétaire
   * (quota par compte, S14). Ceux de la corbeille ne comptent pas dans le
   * quota de documents, mais comptent pour le disque (`avecCorbeille`). */
  documentsDe(email, { avecCorbeille = false } = {}) {
    if (!email) return []
    return Object.entries(this._readRegistry())
      .filter(([, meta]) => proprietaire(meta) === email && (avecCorbeille || !meta.corbeille))
      .map(([id]) => id)
  }

  // --- La corbeille (12/10/2026, claude/conception-dossiers-corbeille.md) ---
  //
  // Mettre à la corbeille ne supprime rien : la fiche du registre reçoit un
  // champ `corbeille: { le, par }`, et `roleFor` rend `null` à tout le monde.
  // Journal, versions, images et mise en page restent sur le disque, de sorte
  // que restaurer est instantané et complet. Aucune purge automatique pour
  // l'instant (décision de Sylvain, 12/10) : `enCorbeilleDepuis` dit quels
  // documents y sont depuis assez longtemps pour qu'on la branche un jour.

  /** Met un document à la corbeille ; `par` : qui l'y a mis. null si absent. */
  mettreALaCorbeille(id, par) {
    const registry = this._readRegistry()
    if (!registry[id]) return null
    if (!registry[id].corbeille) registry[id].corbeille = { le: Date.now(), par: par || null }
    this._writeRegistry(registry)
    return { id, ...registry[id] }
  }

  /** Sort un document de la corbeille. null si absent ou s'il n'y était pas. */
  restaurerDeLaCorbeille(id) {
    const registry = this._readRegistry()
    if (!registry[id] || !registry[id].corbeille) return null
    delete registry[id].corbeille
    this._writeRegistry(registry)
    return { id, ...registry[id] }
  }

  estALaCorbeille(id) {
    const doc = this.getDoc(id)
    return !!(doc && doc.corbeille)
  }

  /** La corbeille de cette personne : les documents qu'elle porte et qu'elle
   * y a mis (ou qu'un administrateur y a mis), du plus récemment jeté au plus
   * ancien. */
  listCorbeille(email) {
    if (!email) return []
    return Object.entries(this._readRegistry())
      .filter(([, meta]) => meta.corbeille && proprietaire(meta) === email)
      .map(([id, meta]) => ({ id, title: meta.title, updatedAt: meta.updatedAt, corbeille: meta.corbeille }))
      .sort((a, b) => b.corbeille.le - a.corbeille.le)
  }

  /** Les documents à la corbeille depuis plus de `ms` millisecondes, tous
   * propriétaires confondus — pour la purge, le jour où on la branchera. */
  enCorbeilleDepuis(ms, maintenant = Date.now()) {
    return Object.entries(this._readRegistry())
      .filter(([, meta]) => meta.corbeille && maintenant - meta.corbeille.le > ms)
      .map(([id]) => id)
  }

  ownerOf(id) {
    return proprietaire(this.getDoc(id))
  }

  isOwner(id, email) {
    if (!email) return false
    return proprietaire(this.getDoc(id)) === email
  }

  /** Transfère la propriété. La cible doit **déjà avoir accès** au document
   * — on ne confie pas un document à quelqu'un qui ne l'a jamais ouvert, et
   * ça évite de créer un accès par un chemin détourné. Elle devient
   * éditrice au passage : un propriétaire est toujours éditeur.
   * Renvoie `{ ok }` ou `{ error }`. */
  transferOwnership(id, toEmail) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return { error: 'document introuvable' }
    if (!Array.isArray(doc.access)) return { error: 'ce document n’a pas de gestion des accès' }
    const entree = doc.access.find((a) => a.email === toEmail)
    if (!entree) return { error: 'cette personne n’a pas accès au document' }
    if (entree.status === 'invite') return { error: 'cette personne n’a pas encore accepté son invitation' }
    doc.owner = toEmail
    entree.role = 'editeur'
    this._writeRegistry(registry)
    return { ok: true, owner: toEmail }
  }

  /** Retirer son propre accès. Distinct de `revokeAccess`, qui est un acte
   * d'éditeur sur quelqu'un d'autre : ici la personne n'a besoin d'aucun
   * droit, seulement d'être concernée. C'est ce qui manquait — jusqu'ici
   * personne ne pouvait sortir d'un document où il avait été invité.
   * Le propriétaire, lui, ne peut pas partir : le document deviendrait
   * orphelin. Il transfère d'abord. */
  leaveDoc(id, email) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return { error: 'document introuvable' }
    if (!Array.isArray(doc.access)) return { error: 'ce document n’a pas de gestion des accès' }
    if (proprietaire(doc) === email) {
      return { error: 'vous portez ce document — transférez-le avant de le quitter' }
    }
    if (!doc.access.some((a) => a.email === email)) return { error: 'vous n’avez pas accès à ce document' }
    doc.access = doc.access.filter((a) => a.email !== email)
    this._writeRegistry(registry)
    return { ok: true }
  }

  /** Liste des accès, **sans les jetons d'invitation** : cette liste est
   * renvoyée telle quelle par l'API aux éditeurs, et un jeton qui fuite
   * vaut une session au nom de la personne invitée. `status` vaut 'actif'
   * ou 'invite' ; son absence (entrées antérieures au 15/09/2026) se lit
   * comme 'actif'. */
  getAccess(id) {
    const doc = this.getDoc(id)
    if (!doc || !Array.isArray(doc.access)) return []
    const owner = proprietaire(doc)
    return doc.access.map((a) => ({
      ...sansJeton(a),
      status: a.status || 'actif',
      proprietaire: a.email === owner,
    }))
  }

  grantAccess(id, email, role) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return null
    // Le propriétaire est toujours éditeur (Sylvain, 17/09) : lui donner
    // correcteur produirait un état absurde — quelqu'un qui peut supprimer
    // le document mais pas y écrire.
    if (proprietaire(doc) === email && role !== 'editeur') return null
    if (!Array.isArray(doc.access)) doc.access = []
    const existing = doc.access.find((a) => a.email === email)
    if (existing) existing.role = role
    else doc.access.push({ email, role, grantedAt: Date.now(), status: 'actif' })
    this._writeRegistry(registry)
    return { id, ...doc }
  }

  revokeAccess(id, email) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc || !Array.isArray(doc.access)) return null
    // Révoquer le propriétaire laisserait un document que plus personne ne
    // porte : plus de quota, plus personne pour le supprimer.
    if (proprietaire(doc) === email) return null
    doc.access = doc.access.filter((a) => a.email !== email)
    this._writeRegistry(registry)
    return { id, ...doc }
  }

  /** Invite une adresse précise sur ce document : crée une entrée d'accès
   * « en attente » et son jeton d'invitation nominatif. Remplace les liens
   * partagés par rôle (retirés le 15/09/2026) — un jeton ne vaut plus que
   * pour une adresse, et c'est le mail reçu qui prouve l'identité. Seule
   * l'empreinte du jeton est conservée ; il reste valable une heure après
   * la première acceptation, pour qu'on puisse ouvrir le mail sur son
   * téléphone puis son ordinateur.
   * Voir claude/conception-gestion-utilisateurs.md (projet Amend). */
  inviteEmail(id, email, role, invitedBy) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return null
    if (!Array.isArray(doc.access)) doc.access = []
    const now = Date.now()
    let entry = doc.access.find((a) => a.email === email)
    const nouvelleEntree = !entry
    if (!entry) {
      entry = { email, grantedAt: now }
      doc.access.push(entry)
    }
    // Même règle que grantAccess : on ne rétrograde pas le propriétaire.
    entry.role = proprietaire(doc) === email ? 'editeur' : role
    entry.status = 'invite'
    entry.invitedBy = invitedBy || null
    entry.invitedAt = now
    const token = randomId(24)
    delete entry.token
    entry.tokenHash = empreinteJeton(token)
    entry.tokenExpiresAt = now + INVITATION_TTL_MS
    this._writeRegistry(registry)
    return { token, nouvelleEntree }
  }

  /** Retrouve l'invitation correspondant à un jeton. Renvoie aussi les
   * invitations expirées (avec `expired: true`) pour pouvoir le dire à la
   * personne au lieu d'un « lien inconnu » trompeur. Parcourt le registre
   * en mémoire, comme le reste de ce fichier — échelle assumée. */
  findInvitation(token) {
    const registry = this._readRegistry()
    for (const [id, doc] of Object.entries(registry)) {
      if (!Array.isArray(doc.access) || doc.corbeille) continue
      const h = empreinteJeton(token)
      // `a.token` : ancien format, en clair, retiré au démarrage par
      // purgerJetonsEnClair() ; gardé ici le temps d'une migration ratée.
      const entry = doc.access.find((a) => a.tokenHash === h || (a.token && a.token === token))
      if (!entry) continue
      const expired = !entry.tokenExpiresAt || Date.now() > entry.tokenExpiresAt
      return { id, email: entry.email, role: entry.role, expired }
    }
    return null
  }

  /** Registre complet — réservé au back-office (voir server/admin.js), qui
   * a besoin de voir tous les documents, y compris ceux auxquels
   * l'administrateur n'a pas accès. Copie superficielle : les jetons
   * d'invitation en sont retirés, ils ne servent à personne ici et valent
   * une session. */
  allDocs() {
    const registry = this._readRegistry()
    return Object.entries(registry).map(([id, doc]) => ({
      id,
      ...doc,
      access: Array.isArray(doc.access)
        ? doc.access.map((a) => ({ ...sansJeton(a), status: a.status || 'actif' }))
        : null,
    }))
  }


  /** true si cette adresse a un rôle sur au moins un document — sert de
   * base à isLoginAllowed (auth.js) : une personne déjà invitée quelque
   * part peut toujours se reconnecter par lien magique, même sans son
   * invitation sous la main (une invitation encore « en attente » compte,
   * la possession de la boîte mail étant vérifiée de toute façon).
   * Parcourt le petit registre en mémoire, comme findInvitation — même
   * logique, même échelle assumée. */
  emailHasAnyAccess(email) {
    if (!email) return false
    const registry = this._readRegistry()
    return Object.values(registry).some(
      (doc) => Array.isArray(doc.access) && doc.access.some((a) => a.email === email)
    )
  }

  /** Au démarrage : retire du registre tout jeton d'invitation conservé en
   * clair (format antérieur au 10/10/2026). Ces jetons ont été lisibles par
   * les membres des documents concernés : on ne les convertit pas, on les
   * supprime. Une invitation non encore acceptée devient donc inutilisable ;
   * la personne se reconnecte par lien magique (elle a déjà un accès) ou
   * l'éditeur l'invite de nouveau. Renvoie le nombre de jetons retirés. */
  purgerJetonsEnClair() {
    const registry = this._readRegistry()
    let retires = 0
    for (const doc of Object.values(registry)) {
      if (!Array.isArray(doc.access)) continue
      for (const entry of doc.access) {
        if (!('token' in entry)) continue
        delete entry.token
        delete entry.tokenHash
        delete entry.tokenExpiresAt
        retires++
      }
    }
    if (retires) this._writeRegistry(registry)
    return retires
  }

  /** Bascule une invitation en accès actif (première connexion de la
   * personne invitée). Le jeton reste valable une heure de plus, pas
   * davantage (INVITATION_GRACE_MS). */
  acceptInvitation(id, email) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc || !Array.isArray(doc.access)) return null
    const entry = doc.access.find((a) => a.email === email)
    if (!entry) return null
    const maintenant = Date.now()
    if (entry.status !== 'actif') {
      entry.status = 'actif'
      entry.acceptedAt = maintenant
      // Plus d'usage unique strict (téléphone puis ordinateur), mais un
      // délai court : le lien ne vaut plus 14 jours de session.
      if (entry.tokenExpiresAt) {
        entry.tokenExpiresAt = Math.min(entry.tokenExpiresAt, maintenant + INVITATION_GRACE_MS)
      }
    }
    this._writeRegistry(registry)
    return { id, role: entry.role }
  }

  renameDoc(id, title) {
    const registry = this._readRegistry()
    if (!registry[id]) return null
    registry[id].title = title
    registry[id].updatedAt = Date.now()
    this._writeRegistry(registry)
    return { id, ...registry[id] }
  }

  /** `touchDoc` pour les flush en rafale : écrit tout de suite si la dernière
   * écriture date de plus de TOUCH_MIN_MS, sinon planifie une seule écriture
   * pour la fin de la fenêtre. */
  _toucherEnDiffere(id) {
    if (this._touchPrevus.has(id)) return // déjà prévu : il prendra l'heure du moment
    const registry = this._readRegistry()
    const dernier = registry[id]?.updatedAt || 0
    const attente = TOUCH_MIN_MS - (Date.now() - dernier)
    if (attente <= 0) return this.touchDoc(id)
    const minuteur = setTimeout(() => {
      this._touchPrevus.delete(id)
      this.touchDoc(id)
    }, attente)
    minuteur.unref?.()
    this._touchPrevus.set(id, minuteur)
  }

  touchDoc(id) {
    const registry = this._readRegistry()
    if (!registry[id]) return
    registry[id].updatedAt = Date.now()
    this._writeRegistry(registry)
  }

  /** Migration 2 (12/10/2026) : l'étoile d'un document, qui était une
   * propriété du document, devient un favori de chacun de ses membres.
   * Idempotente : un favori déjà posé n'est pas dupliqué, et le champ
   * `starred` n'est retiré du registre qu'une fois les favoris écrits.
   * Renvoie le nombre de documents convertis. */
  migrerEtoilesVersFavoris(rangements) {
    const registry = this._readRegistry()
    const parPersonne = new Map()
    let n = 0
    for (const [id, meta] of Object.entries(registry)) {
      if (!meta.starred) continue
      n++
      for (const acces of Array.isArray(meta.access) ? meta.access : []) {
        if (!parPersonne.has(acces.email)) parPersonne.set(acces.email, [])
        parPersonne.get(acces.email).push(id)
      }
    }
    for (const [email, ids] of parPersonne) {
      const r = rangements.lire(email)
      const nouveaux = ids.filter((id) => !r.favoris.includes(id))
      if (nouveaux.length) rangements._ecrire(email, { ...r, favoris: [...r.favoris, ...nouveaux] })
    }
    if (n) {
      for (const meta of Object.values(registry)) delete meta.starred
      this._writeRegistry(registry)
    }
    return n
  }

  /** Supprime un document : sorti du registre (donc de la liste et de
   * l'accès direct — getDoc/listDocs ne le voient plus), son journal de
   * modifications supprimé du disque. Irréversible : l'application passe d'abord
   * par la corbeille (`mettreALaCorbeille`) et n'appelle ceci que depuis
   * la corbeille (server/corbeille.js). */
  deleteDoc(id) {
    const registry = this._readRegistry()
    if (!registry[id]) return false
    delete registry[id]
    this._writeRegistry(registry)
    this.journal.supprimer(id)
    // Les écarts de style propres au document ne lui survivent pas non plus.
    const stylePath = this._stylePath(id)
    if (existsSync(stylePath)) unlinkSync(stylePath)
    return true
  }

  // --- Le journal (journal.js) : mêmes noms qu'avant l'extraction ---------

  get maxUncompactedOps() {
    return this.journal.maxUncompactedOps
  }

  get maxUncompactedBytes() {
    return this.journal.maxUncompactedBytes
  }

  get compactionTrigger() {
    return this.journal.compactionTrigger
  }

  appendUpdate(id, updateBuffer) {
    return this.journal.appendUpdate(id, updateBuffer)
  }

  readUpdates(id) {
    return this.journal.readUpdates(id)
  }

  getHistoryMeta(id) {
    return this.journal.getHistoryMeta(id)
  }

  getHistoryRaw(id) {
    return this.journal.getHistoryRaw(id)
  }

  compactDoc(id, options) {
    return this.journal.compactDoc(id, options)
  }

  journalInfo(id) {
    return this.journal.journalInfo(id)
  }

  cheminDuJournal(id) {
    return this.journal.cheminDuJournal(id)
  }

  enAttente(id) {
    return this.journal.enAttente(id)
  }

  ecrireMaintenant(id) {
    return this.journal.ecrireMaintenant(id)
  }

  /** Force toute l'écriture différée sur le disque (journaux, puis dates
   * reportées des documents). À appeler avant la sortie du processus (voir
   * server.js) pour qu'un redémarrage ne perde jamais la dernière fraction
   * de seconde de frappe. */
  async flushAll() {
    await this.journal.flushAll()
    // Les horodatages reportés (_toucherEnDiffere) s'écrivent maintenant.
    for (const [id, minuteur] of this._touchPrevus) {
      clearTimeout(minuteur)
      this.touchDoc(id)
    }
    this._touchPrevus.clear()
  }
}
