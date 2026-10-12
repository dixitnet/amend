// File-based storage: no database. Each document is a title in a small
// JSON registry plus an append-only log of binary Yjs updates on disk.
// Deliberately simple so a self-hosted instance needs nothing but a
// writable folder.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { lireJson, ecrireJsonAtomique } from './fichiers.js'
import { randomId } from './ws.js'
import { StylesDocuments } from './stylesDocuments.js'
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

// --- L'index des comptes (point 12, 13/10/2026) -----------------------------
//
// Le registre est un fichier : relu et analysé en entier à chaque question,
// « qu'est-ce que cette adresse peut voir ? » obligeait à le parcourir — et
// surtout à l'analyser, ce qui coûte des millisecondes par appel à quelques
// milliers de documents (mesure : voir la feuille de route). Le registre
// reste la seule vérité sur le disque ; ce qui s'ajoute est **dérivé** et
// jamais écrit : le registre analysé et, bâti sur lui, un index par adresse.
// Les deux vivent en mémoire, valent tant que le fichier garde la même
// signature (inode, taille, date à la nanoseconde), et se refont tout seuls
// quand un autre programme le réécrit. Limite connue : une réécriture **sur
// place**, de **même taille**, dans le même battement d'horloge du système de
// fichiers, passerait inaperçue ; les programmes qui écrivent ce registre le
// remplacent par renommage (inode neuf), et le serveur invalide en plus son
// cache à chacune de ses écritures.

/** Les entrées de l'index d'un registre. Rien n'est copié : ce sont des
 * identifiants de documents. */
function construireIndex(registre) {
  /** @type {Map<string, Set<string>>} adresse → documents où elle a une entrée d'accès (corbeille comprise) */
  const acces = new Map()
  /** @type {Map<string, Set<string>>} adresse → documents qu'elle porte (corbeille comprise) */
  const possedes = new Map()
  /** @type {Map<string, string[]>} empreinte de jeton → documents */
  const jetonsHash = new Map()
  /** @type {Map<string, string[]>} jeton en clair (ancien format) → documents */
  const jetonsClair = new Map()
  /** @type {Set<string>} */
  const corbeille = new Set()
  const dans = (m, cle, id) => {
    let ensemble = m.get(cle)
    if (!ensemble) m.set(cle, (ensemble = new Set()))
    ensemble.add(id)
  }
  const liste = (m, cle, id) => {
    const l = m.get(cle)
    if (l) l.push(id)
    else m.set(cle, [id])
  }
  for (const [id, meta] of Object.entries(registre)) {
    if (!meta || typeof meta !== 'object') continue
    if (meta.corbeille) corbeille.add(id)
    const porteur = proprietaire(meta)
    if (porteur) dans(possedes, porteur, id)
    if (!Array.isArray(meta.access)) continue
    for (const a of meta.access) {
      if (!a || typeof a !== 'object') continue
      if (a.email) dans(acces, a.email, id)
      if (a.tokenHash) liste(jetonsHash, a.tokenHash, id)
      if (a.token) liste(jetonsClair, a.token, id)
    }
  }
  return { acces, possedes, jetonsHash, jetonsClair, corbeille }
}

/** La fiche d'un document, copiée : ce qui sort de `Storage` ne partage
 * jamais d'objet avec le registre en cache. */
const copie = (meta) => structuredClone(meta)

export class Storage {
  constructor(dataDir, { maxUncompactedOps, compactionTrigger, maxUncompactedBytes } = {}) {
    this.dataDir = dataDir
    // Le journal Yjs : voir journal.js. Il date le document dans le registre
    // quand une écriture ou un compactage a eu lieu, et lui demande sa fiche
    // pour les dates de repli.
    this.journal = new Journal(dataDir, {
      maxUncompactedOps,
      compactionTrigger,
      maxUncompactedBytes,
      metaDoc: (id) => this._metaLu(id),
      apresEcriture: (id) => this._toucherEnDiffere(id),
      apresCompactage: (id) => this.touchDoc(id),
    })
    this.registryPath = join(dataDir, 'docs.json')
    // Les feuilles de style et les modèles de mise en page (stylesDocuments.js).
    this.styles = new StylesDocuments(dataDir, {
      lireRegistre: () => this._readRegistry(),
      ecrireRegistre: (registre) => this._writeRegistry(registre),
      // Pour les questions qui ne modifient rien : le registre en cache.
      consulterRegistre: () => this._instantane().registre,
    })
    this.modeles = this.styles.modeles
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    this.listeAttente = new ListeAttente(dataDir, { aUnAcces: (email) => this.emailHasAnyAccess(email) })
    if (!existsSync(this.registryPath)) {
      writeFileSync(this.registryPath, JSON.stringify({}), 'utf8')
    }
    this._touchPrevus = new Map() // id -> minuteur : `updatedAt` à écrire au plus tard dans TOUCH_MIN_MS
    /** Le registre analysé et son index (voir `_instantane`). */
    this._cache = null
  }

  // --- Les styles et les modèles (stylesDocuments.js) : mêmes noms qu'avant l'extraction ---
  getStyle() {
    return this.styles.getStyle()
  }
  setStyle(style) {
    return this.styles.setStyle(style)
  }
  hasOwnStyle(id) {
    return this.styles.hasOwnStyle(id)
  }
  modeleDuDocument(id) {
    return this.styles.modeleDuDocument(id)
  }
  getDocStyle(id) {
    return this.styles.getDocStyle(id)
  }
  setDocStyle(id, style) {
    return this.styles.setDocStyle(id, style)
  }
  ecartsDuDocument(id) {
    return this.styles.ecartsDuDocument(id)
  }
  resetDocStyle(id) {
    return this.styles.resetDocStyle(id)
  }
  setDocModele(id, modeleId, options) {
    return this.styles.setDocModele(id, modeleId, options)
  }
  usagesModeles() {
    return this.styles.usagesModeles()
  }
  compterUsagesModele(modeleId) {
    return this.styles.compterUsagesModele(modeleId)
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
    this._cache = null
  }

  /** Ce qui identifie l'état du fichier de registre : inode (le renommage
   * atomique en donne un nouveau à chaque écriture), taille et date en
   * nanosecondes. `null` si le fichier manque. */
  _signatureRegistre() {
    try {
      const st = statSync(this.registryPath, { bigint: true })
      return `${st.ino}:${st.size}:${st.mtimeNs}`
    } catch {
      return null
    }
  }

  /** Le registre analysé et son index, en cache tant que le fichier n'a pas
   * changé. **Partagé, donc en lecture seule** : qui modifie le registre
   * passe par `_readRegistry()` (une copie neuve) puis `_writeRegistry`, ce
   * qui vide aussi le cache. Un fichier illisible lève, comme toujours (A1). */
  _instantane() {
    const signature = this._signatureRegistre()
    const c = this._cache
    if (c && signature !== null && c.signature === signature) return c
    const registre = this._readRegistry()
    const neuf = { signature, registre, index: construireIndex(registre) }
    this._cache = signature === null ? null : neuf
    return neuf
  }

  /** La fiche d'un document dans le registre en cache, **sans copie** : pour
   * lire un champ, jamais pour la rendre ni la modifier. `undefined` si le
   * document n'existe pas (et pas de fausse trouvaille sur `constructor`). */
  _metaLu(id) {
    const registre = this._instantane().registre
    return Object.hasOwn(registre, id) ? registre[id] : undefined
  }

  /** `email` : si fourni, ne renvoie que les documents accessibles à cette
   * personne (éditeur ou correcteur) — les documents sans liste d'accès
   * (créés avant cette fonctionnalité) restent visibles à tout le monde,
   * connecté ou non, pour ne pas casser les documents existants. Sans
   * email (pas connecté), seuls ces documents "ouverts" apparaissent. */
  listDocs(email) {
    if (!email) return []
    const { registre, index } = this._instantane()
    const ids = index.acces.get(email)
    if (!ids) return []
    return (
      [...ids]
        .filter((id) => !registre[id].corbeille)
        .map((id) => {
          const meta = copie(registre[id])
          const entree = meta.access.find((a) => a.email === email) || {}
          return {
            id,
            ...meta,
            access: accesSansJetons(meta),
            myRole: entree.role || null,
            myCapabilities: capabilities(entree.role || null),
            // Pour que la liste sache afficher « Supprimer » au propriétaire et
            // « Quitter » aux autres, sans une requête par document.
            owner: proprietaire(meta),
            jeSuisProprietaire: proprietaire(meta) === email,
          }
        })
        // Du plus récemment modifié au plus ancien. Les favoris sont personnels
        // (server/rangement.js) : c'est la page qui les met en tête.
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    )
  }

  getDoc(id) {
    const meta = this._metaLu(id)
    if (!meta) return null
    // Jamais de jeton d'invitation dans ce qui sort d'ici : getDoc() alimente
    // des réponses de l'API lisibles par tout membre, lecteur compris.
    const fiche = copie(meta)
    return { id, ...fiche, access: accesSansJetons(fiche) }
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
    // Sans copie : on ne lit que la liste d'accès (c'est le chemin le plus
    // fréquent — chaque requête, chaque ouverture de WebSocket).
    const doc = this._metaLu(id)
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
    const { registre, index } = this._instantane()
    return [...(index.possedes.get(email) || [])].filter((id) => avecCorbeille || !registre[id].corbeille)
  }

  /** Les identifiants de tous les documents où cette adresse a une entrée
   * d'accès — actif, en attente, corbeille comprise (point 12). C'est ce que
   * l'index rend gratuit, et ce dont la suppression d'un compte a besoin. */
  documentsAvecAcces(email) {
    if (!email) return []
    return [...(this._instantane().index.acces.get(email) || [])]
  }

  // --- La suppression d'un compte (point 7, 13/10/2026) ---------------------
  //
  // Ce que devient chaque document de la personne, d'après le registre :
  //   - elle ne le porte pas            → `quittes`   : son accès est retiré ;
  //   - elle le porte, seule (ou avec
  //     des invitations jamais acceptées) → `supprimes` : plus personne n'en
  //     a besoin, il disparaît avec le reste ;
  //   - elle le porte, et d'autres
  //     personnes y travaillent, dont
  //     au moins un éditeur             → `transferes` : l'éditeur le plus
  //     ancien le reçoit (comme `transferOwnership`) ;
  //   - elle le porte, et il n'y a que
  //     des lecteurs ou correcteurs     → `bloquants` : on ne fait pas d'un
  //     lecteur un éditeur à sa place. Elle doit choisir elle-même
  //     (transférer à quelqu'un, ou supprimer le document).
  // La corbeille n'y change rien : un document jeté est jugé comme les autres.

  planSuppressionCompte(email) {
    const plan = { quittes: [], supprimes: [], transferes: [], bloquants: [] }
    if (!email) return plan
    const { registre, index } = this._instantane()
    const ids = new Set([...(index.acces.get(email) || []), ...(index.possedes.get(email) || [])])
    for (const id of ids) {
      const meta = registre[id]
      const ligne = { id, title: meta.title || '', corbeille: !!meta.corbeille }
      if (proprietaire(meta) !== email) {
        plan.quittes.push(ligne)
        continue
      }
      const autres = (Array.isArray(meta.access) ? meta.access : []).filter(
        (a) => a && a.email && a.email !== email && (a.status || 'actif') === 'actif'
      )
      if (!autres.length) {
        plan.supprimes.push(ligne)
        continue
      }
      const editeurs = autres.filter((a) => a.role === 'editeur')
      if (!editeurs.length) {
        plan.bloquants.push(ligne)
        continue
      }
      const heritier = editeurs.reduce((ancien, a) =>
        (a.grantedAt || Infinity) < (ancien.grantedAt || Infinity) ? a : ancien
      )
      plan.transferes.push({ ...ligne, vers: heritier.email })
    }
    return plan
  }

  /** Applique à la fois les transferts et les départs du plan, **en une seule
   * écriture** du registre, et efface l'adresse des fiches des autres
   * documents (`invitedBy`, `corbeille.par`). Les documents à supprimer ne
   * sont pas traités ici (`deleteDoc`, un par un, après les fichiers qui leur
   * appartiennent). Renvoie les identifiants des documents conservés où la
   * personne figurait. */
  retirerCompte(email, plan) {
    const registre = this._readRegistry()
    const touches = []
    const transferts = new Map(plan.transferes.map((t) => [t.id, t.vers]))
    const quitter = new Set([...plan.quittes.map((q) => q.id), ...transferts.keys()])
    for (const [id, meta] of Object.entries(registre)) {
      if (!meta || typeof meta !== 'object') continue
      let touche = false
      if (transferts.has(id)) {
        meta.owner = transferts.get(id)
        touche = true
      }
      if (quitter.has(id) && Array.isArray(meta.access)) {
        const avant = meta.access.length
        meta.access = meta.access.filter((a) => !a || a.email !== email)
        if (meta.access.length !== avant) touche = true
      }
      if (Array.isArray(meta.access)) {
        for (const a of meta.access) {
          if (a && a.invitedBy === email) {
            a.invitedBy = null
            touche = true
          }
        }
      }
      if (meta.corbeille && meta.corbeille.par === email) {
        meta.corbeille.par = null
        touche = true
      }
      if (touche && quitter.has(id)) touches.push(id)
    }
    this._writeRegistry(registre)
    return touches
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
    const meta = this._metaLu(id)
    return !!(meta && meta.corbeille)
  }

  /** La corbeille de cette personne : les documents qu'elle porte et qu'elle
   * y a mis (ou qu'un administrateur y a mis), du plus récemment jeté au plus
   * ancien. */
  listCorbeille(email) {
    if (!email) return []
    const { registre, index } = this._instantane()
    return [...(index.possedes.get(email) || [])]
      .filter((id) => registre[id].corbeille)
      .map((id) => {
        const meta = registre[id]
        return { id, title: meta.title, updatedAt: meta.updatedAt, corbeille: { ...meta.corbeille } }
      })
      .sort((a, b) => b.corbeille.le - a.corbeille.le)
  }

  /** Les documents à la corbeille depuis plus de `ms` millisecondes, tous
   * propriétaires confondus — pour la purge, le jour où on la branchera. */
  enCorbeilleDepuis(ms, maintenant = Date.now()) {
    const { registre, index } = this._instantane()
    return [...index.corbeille].filter((id) => maintenant - registre[id].corbeille.le > ms)
  }

  ownerOf(id) {
    return proprietaire(this._metaLu(id))
  }

  isOwner(id, email) {
    if (!email) return false
    return proprietaire(this._metaLu(id)) === email
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
    const doc = this._metaLu(id)
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
    const { registre, index } = this._instantane()
    const h = empreinteJeton(token)
    // `a.token` : ancien format, en clair, retiré au démarrage par
    // purgerJetonsEnClair() ; gardé ici le temps d'une migration ratée.
    const candidats = [...(index.jetonsHash.get(h) || []), ...(index.jetonsClair.get(token) || [])]
    for (const id of candidats) {
      const doc = registre[id]
      if (!Array.isArray(doc.access) || doc.corbeille) continue
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
    return Object.entries(this._instantane().registre).map(([id, meta]) => {
      const doc = copie(meta)
      return {
        id,
        ...doc,
        access: Array.isArray(doc.access)
          ? doc.access.map((a) => ({ ...sansJeton(a), status: a.status || 'actif' }))
          : null,
      }
    })
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
    return this._instantane().index.acces.has(email)
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
    const dernier = this._metaLu(id)?.updatedAt || 0
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
    this.styles.supprimerDuDocument(id)
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
