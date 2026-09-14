// File-based storage: no database. Each document is a title in a small
// JSON registry plus an append-only log of binary Yjs updates on disk.
// Deliberately simple so a self-hosted instance needs nothing but a
// writable folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, readSync, fstatSync, closeSync, renameSync, unlinkSync } from 'node:fs'
import { appendFile as appendFileAsync } from 'node:fs/promises'
import { join } from 'node:path'
import { randomId } from './ws.js'

// How long updates sit in memory before being flushed to disk together —
// see appendUpdate/_flush below (correctif 4.1.2 : écritures asynchrones).
// Long enough to turn "one appendFileSync per keystroke" into a handful of
// writes per second even under several simultaneous fast typists; short
// enough that a crash between flushes loses at most a fraction of a
// second's edits (and every update has already reached every other
// connected peer via rooms.js's broadcast regardless of when it hits disk).
const FLUSH_DELAY_MS = 200

// Historique léger (voir getHistoryMeta/getHistoryRaw/compactDoc) : au-delà
// de ce nombre d'opérations stockées pour un document, needsCompaction
// devient vrai — un client connecté fusionne alors tout ce qui précède les
// DEFAULT_MAX_UNCOMPACTED_OPS dernières opérations en un seul instantané
// (voir client/src/historySnapshot.js). Simple compteur d'opérations, pas
// une taille ni une durée — plus prévisible pour la page de versions, qui
// affiche justement "les N dernières opérations".
const DEFAULT_MAX_UNCOMPACTED_OPS = 1000

// The shared feuille de style ("Mise en page" admin page) — one config for
// the whole instance, not per document. Mirrors DEFAULT_STYLE in
// client/src/styleConfig.js; kept in sync by hand (small, stable shape,
// not worth a shared module between two separate npm packages for this).
const DEFAULT_STYLE = {
  page: {
    size: 'A4',
    marginTop: 25,
    marginRight: 20,
    marginBottom: 25,
    marginLeft: 20,
    pageNumbers: { enabled: false, startAt: 1 },
  },
  body: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', spaceBefore: 0, spaceAfter: 8, lineHeight: 1.15 },
  heading: {
    font: 'system',
    bold: true,
    italic: false,
    uppercase: false,
    align: 'left',
    spaceBefore: 16,
    spaceAfter: 8,
    sizes: [24, 20, 17, 15, 13],
  },
}

/** Merges a possibly-partial/possibly-stale style object over
 * DEFAULT_STYLE, one block at a time — so a config saved before some
 * future new field existed still comes back complete, instead of the
 * whole block silently vanishing. */
function mergeStyle(partial) {
  const p = partial || {}
  return {
    page: {
      ...DEFAULT_STYLE.page,
      ...(p.page || {}),
      pageNumbers: { ...DEFAULT_STYLE.page.pageNumbers, ...((p.page && p.page.pageNumbers) || {}) },
    },
    body: { ...DEFAULT_STYLE.body, ...(p.body || {}) },
    // "quote" retiré de la feuille de style (13/09/2026) — un ancien
    // style.json qui en garde un n'en hérite plus, ignoré silencieusement.

    heading: {
      ...DEFAULT_STYLE.heading,
      ...(p.heading || {}),
      sizes: (p.heading && Array.isArray(p.heading.sizes) && p.heading.sizes.length === 5)
        ? p.heading.sizes
        : DEFAULT_STYLE.heading.sizes,
    },
  }
}

export class Storage {
  constructor(dataDir, { maxUncompactedOps = DEFAULT_MAX_UNCOMPACTED_OPS } = {}) {
    this.dataDir = dataDir
    this.maxUncompactedOps = maxUncompactedOps
    this.registryPath = join(dataDir, 'docs.json')
    this.stylePath = join(dataDir, 'style.json')
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
    if (!existsSync(this.registryPath)) {
      writeFileSync(this.registryPath, JSON.stringify({}), 'utf8')
    }
    // Write-behind buffer for the per-document update logs — see
    // appendUpdate/_flush/flushAll. `_pending` is the source of truth for
    // "not yet confirmed on disk" (readUpdates reads it too, so a client
    // joining mid-batch never misses anything); `_flushChain` serializes
    // one document's writes so two flushes can never interleave on the
    // same file.
    this._pending = new Map() // id -> raw update Buffer[]
    this._flushTimers = new Map() // id -> Timeout
    this._flushChain = new Map() // id -> Promise (tail of that doc's writes)
  }

  getStyle() {
    try {
      return mergeStyle(JSON.parse(readFileSync(this.stylePath, 'utf8')))
    } catch {
      return DEFAULT_STYLE
    }
  }

  setStyle(style) {
    const merged = mergeStyle(style)
    const tmp = this.stylePath + '.tmp'
    writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8')
    renameSync(tmp, this.stylePath)
    return merged
  }

  _readRegistry() {
    try {
      return JSON.parse(readFileSync(this.registryPath, 'utf8'))
    } catch {
      return {}
    }
  }

  _writeRegistry(registry) {
    // Write to a temp file then rename, so a crash mid-write can't corrupt
    // the registry.
    const tmp = this.registryPath + '.tmp'
    writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8')
    renameSync(tmp, this.registryPath)
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
        if (!Array.isArray(meta.access)) return true
        if (!email) return false
        return meta.access.some((a) => a.email === email)
      })
      .map(([id, meta]) => ({
        id,
        ...meta,
        myRole: Array.isArray(meta.access)
          ? (meta.access.find((a) => a.email === email) || {}).role || null
          : 'editeur',
      }))
      .sort((a, b) => {
        // Étoilés d'abord (peu importe depuis quand), puis par date de
        // dernière modification comme avant — deux tris indépendants plutôt
        // qu'un seul champ composite, pour que le second critère continue
        // de s'appliquer normalement à l'intérieur de chaque groupe.
        const starDiff = (b.starred ? 1 : 0) - (a.starred ? 1 : 0)
        if (starDiff !== 0) return starDiff
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      })
  }

  getDoc(id) {
    const registry = this._readRegistry()
    const meta = registry[id]
    if (!meta) return null
    return { id, ...meta }
  }

  /** `creatorEmail` : si fourni, cette personne devient immédiatement
   * éditrice du document (voir claude/conception-gestion-utilisateurs.md,
   * projet Amend). Un document créé sans email (ne devrait plus arriver
   * depuis que POST /api/docs exige une session, mais gardé permissif ici)
   * n'a pas de liste d'accès — traité comme ouvert à tous, comme les
   * documents créés avant cette fonctionnalité (voir hasAccessControl). */
  createDoc(title, creatorEmail) {
    const registry = this._readRegistry()
    const id = randomId()
    const now = Date.now()
    const meta = { title: title || 'Sans titre', createdAt: now, updatedAt: now }
    if (creatorEmail) {
      meta.access = [{ email: creatorEmail, role: 'editeur', grantedAt: now }]
    }
    registry[id] = meta
    this._writeRegistry(registry)
    writeFileSync(this._logPath(id), Buffer.alloc(0))
    return { id, ...registry[id] }
  }

  /** Rôle de cet email sur ce document, ou null si aucun accès. Un
   * document sans liste d'accès (créé avant cette fonctionnalité, ou sans
   * creatorEmail — voir createDoc) est traité comme ouvert : tout le monde
   * y est "editeur", pour ne pas casser les documents existants. */
  roleFor(id, email) {
    const doc = this.getDoc(id)
    if (!doc) return null
    if (!Array.isArray(doc.access)) return 'editeur'
    if (!email) return null
    const entry = doc.access.find((a) => a.email === email)
    return entry ? entry.role : null
  }

  /** true si ce document a une gestion des droits active (voir roleFor). */
  hasAccessControl(id) {
    const doc = this.getDoc(id)
    return !!(doc && Array.isArray(doc.access))
  }

  getAccess(id) {
    const doc = this.getDoc(id)
    return (doc && doc.access) || []
  }

  grantAccess(id, email, role) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return null
    if (!Array.isArray(doc.access)) doc.access = []
    const existing = doc.access.find((a) => a.email === email)
    if (existing) existing.role = role
    else doc.access.push({ email, role, grantedAt: Date.now() })
    this._writeRegistry(registry)
    return { id, ...doc }
  }

  revokeAccess(id, email) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc || !Array.isArray(doc.access)) return null
    doc.access = doc.access.filter((a) => a.email !== email)
    this._writeRegistry(registry)
    return { id, ...doc }
  }

  /** Jeton d'invitation courant pour ce document et ce rôle — auto-connectant
   * et réutilisable par plusieurs personnes (voir
   * claude/conception-gestion-utilisateurs.md) ; en crée un s'il n'existe
   * pas encore. */
  getOrCreateInviteLink(id, role) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return null
    if (!doc.inviteLinks) doc.inviteLinks = {}
    if (!doc.inviteLinks[role]) {
      doc.inviteLinks[role] = randomId(24)
      this._writeRegistry(registry)
    }
    return doc.inviteLinks[role]
  }

  /** Remplace le jeton par un nouveau, invalidant l'ancien (ex. trop
   * largement diffusé) sans retirer l'accès des personnes déjà entrées. */
  regenerateInviteLink(id, role) {
    const registry = this._readRegistry()
    const doc = registry[id]
    if (!doc) return null
    if (!doc.inviteLinks) doc.inviteLinks = {}
    doc.inviteLinks[role] = randomId(24)
    this._writeRegistry(registry)
    return doc.inviteLinks[role]
  }

  /** Retrouve le document et le rôle correspondant à un jeton d'invitation.
   * Parcourt le petit registre en mémoire plutôt qu'un index séparé — ce
   * projet reste volontairement simple, adapté à une poignée de documents
   * (voir le reste de ce fichier). */
  findInviteLink(token) {
    const registry = this._readRegistry()
    for (const [id, doc] of Object.entries(registry)) {
      if (!doc.inviteLinks) continue
      for (const [role, t] of Object.entries(doc.inviteLinks)) {
        if (t === token) return { id, role }
      }
    }
    return null
  }

  renameDoc(id, title) {
    const registry = this._readRegistry()
    if (!registry[id]) return null
    registry[id].title = title
    registry[id].updatedAt = Date.now()
    this._writeRegistry(registry)
    return { id, ...registry[id] }
  }

  touchDoc(id) {
    const registry = this._readRegistry()
    if (!registry[id]) return
    registry[id].updatedAt = Date.now()
    this._writeRegistry(registry)
  }

  /** Étoile ou désétoile un document — n'affecte pas updatedAt : marquer un
   * document n'est pas une modification de son contenu, juste un rangement
   * dans la liste (voir le tri dans listDocs). */
  starDoc(id, starred) {
    const registry = this._readRegistry()
    if (!registry[id]) return null
    registry[id].starred = !!starred
    this._writeRegistry(registry)
    return { id, ...registry[id] }
  }

  _logPath(id) {
    return join(this.dataDir, `${id}.log`)
  }

  /** Fichier compagnon du journal : un horodatage (ms epoch) par opération
   * stockée dans le .log, dans le même ordre — voir _readTimes/_writeTimes
   * et getHistoryMeta/getHistoryRaw/compactDoc plus bas. */
  _timesPath(id) {
    return join(this.dataDir, `${id}.times.json`)
  }

  /** Supprime un document : sorti du registre (donc de la liste et de
   * l'accès direct — getDoc/listDocs ne le voient plus), son journal de
   * modifications supprimé du disque. Irréversible — pas de corbeille pour
   * cette première version (voir la conception détaillée dans README.md
   * pour une suppression douce éventuelle, une fois les droits en place). */
  deleteDoc(id) {
    const registry = this._readRegistry()
    if (!registry[id]) return false
    delete registry[id]
    this._writeRegistry(registry)
    // Annule tout ce qui restait en tampon pour ce document (voir
    // appendUpdate/_flush) — sinon un flush différé pourrait recréer le
    // fichier juste après sa suppression.
    const timer = this._flushTimers.get(id)
    if (timer) clearTimeout(timer)
    this._flushTimers.delete(id)
    this._pending.delete(id)
    this._flushChain.delete(id)
    const path = this._logPath(id)
    if (existsSync(path)) unlinkSync(path)
    const timesPath = this._timesPath(id)
    if (existsSync(timesPath)) unlinkSync(timesPath)
    return true
  }

  /** Buffers one update for the document's log; actually written to disk
   * within FLUSH_DELAY_MS by _flush, batched with whatever else arrives in
   * the meantime (see the constant's comment above). */
  appendUpdate(id, updateBuffer) {
    let list = this._pending.get(id)
    if (!list) {
      list = []
      this._pending.set(id, list)
    }
    list.push(updateBuffer)
    if (!this._flushTimers.has(id)) {
      const timer = setTimeout(() => this._flush(id), FLUSH_DELAY_MS)
      timer.unref?.()
      this._flushTimers.set(id, timer)
    }
  }

  /** Writes every currently-buffered update for `id` to disk, in one
   * appendFile call. Only removes the exact updates it wrote — anything
   * pushed to the buffer while this write was in flight stays queued for
   * the next flush, never lost and never duplicated. Chained through
   * `_flushChain` so a document's writes always land in order, even if a
   * new flush is scheduled before the previous one's disk write finishes. */
  _flush(id) {
    this._flushTimers.delete(id)
    const list = this._pending.get(id)
    if (!list || list.length === 0) return Promise.resolve()
    const n = list.length
    const chunks = []
    for (let i = 0; i < n; i++) {
      const updateBuffer = list[i]
      const lenPrefix = Buffer.alloc(4)
      lenPrefix.writeUInt32BE(updateBuffer.length, 0)
      chunks.push(lenPrefix, updateBuffer)
    }
    const payload = Buffer.concat(chunks)
    const prev = this._flushChain.get(id) || Promise.resolve()
    const next = prev
      .then(() => appendFileAsync(this._logPath(id), payload))
      .then(() => {
        const current = this._pending.get(id)
        if (current) {
          current.splice(0, n)
          if (current.length === 0) {
            this._pending.delete(id)
          } else if (!this._flushTimers.has(id)) {
            // More updates arrived while this write was in flight — make
            // sure they still get flushed.
            const timer = setTimeout(() => this._flush(id), FLUSH_DELAY_MS)
            timer.unref?.()
            this._flushTimers.set(id, timer)
          }
        }
        this.touchDoc(id)
        this._recordFlushTimes(id, n)
      })
      .catch((err) => {
        // Best-effort persistence: every one of these updates already
        // reached every connected peer via rooms.js's live broadcast —
        // only durability against a server restart is at risk here, so log
        // and carry on rather than crashing the whole server over it.
        console.error(`[storage] échec d'écriture du journal pour ${id} :`, err)
      })
    this._flushChain.set(id, next)
    return next
  }

  /** Forces every buffered write to disk right now. Call this before the
   * process exits (see server.js) so a restart never loses the last
   * fraction of a second's edits. */
  async flushAll() {
    const ids = new Set([...this._pending.keys(), ...this._flushChain.keys()])
    for (const id of ids) {
      const timer = this._flushTimers.get(id)
      if (timer) clearTimeout(timer)
      this._flush(id)
    }
    await Promise.all([...this._flushChain.values()])
  }

  /** Parcourt le fichier .log d'un document et retourne chaque opération
   * qu'il contient sous la forme { start, end, payload } — start/end sont
   * les offsets en octets (start = début du préfixe de longueur, end =
   * juste après les données), ce qui permet à compactDoc de découper le
   * fichier brut sans jamais avoir besoin de comprendre le contenu Yjs
   * (voir l'invariant "zéro dépendance yjs côté serveur" en tête de
   * fichier). readUpdates et getHistoryMeta/getHistoryRaw s'appuient tous
   * les deux sur cette même lecture pour ne pas dupliquer la logique de
   * parcours du format préfixé par longueur. */
  _walkLog(id) {
    const path = this._logPath(id)
    const entries = []
    if (!existsSync(path)) return entries
    const fd = openSync(path, 'r')
    try {
      const size = fstatSync(fd).size
      let pos = 0
      const lenBuf = Buffer.alloc(4)
      while (pos + 4 <= size) {
        readSync(fd, lenBuf, 0, 4, pos)
        const len = lenBuf.readUInt32BE(0)
        const start = pos
        pos += 4
        if (pos + len > size) break // truncated trailing write, ignore it
        const payload = Buffer.alloc(len)
        readSync(fd, payload, 0, len, pos)
        pos += len
        entries.push({ start, end: pos, payload })
      }
    } finally {
      closeSync(fd)
    }
    return entries
  }

  /** Reads and returns every stored update for a document, in order —
   * whatever's already on disk, followed by anything still buffered in
   * memory (see appendUpdate/_flush) so a client joining mid-batch sees
   * everything, not just what's been flushed so far. */
  readUpdates(id) {
    const updates = this._walkLog(id).map((e) => e.payload)
    const pending = this._pending.get(id)
    if (pending && pending.length) updates.push(...pending)
    return updates
  }

  /** Lit data/<id>.times.json — un horodatage par opération du .log, dans
   * le même ordre. Auto-réparation si ça ne correspond pas à expectedCount
   * (fichier manquant : document créé avant cette fonctionnalité ;
   * désynchronisé : crash entre l'écriture du .log et celle du
   * .times.json) : on approxime plutôt que d'échouer, car ce n'est qu'un
   * affichage pour la page d'historique, pas une source de vérité. */
  _readTimes(id, expectedCount) {
    let times = []
    try {
      const parsed = JSON.parse(readFileSync(this._timesPath(id), 'utf8'))
      if (Array.isArray(parsed)) times = parsed.filter((t) => typeof t === 'number')
    } catch {
      times = []
    }
    if (times.length === expectedCount) return times
    const registry = this._readRegistry()
    const meta = registry[id]
    const fallback = (meta && (meta.createdAt || meta.updatedAt)) || Date.now()
    if (times.length < expectedCount) {
      // Opérations plus anciennes que le premier horodatage connu (ou que
      // ce fichier lui-même) : on leur attribue la date de création du
      // document, faute de mieux.
      const missing = expectedCount - times.length
      times = [...Array(missing).fill(fallback), ...times]
    } else {
      // Plus d'horodatages que d'opérations (compaction interrompue avant
      // d'avoir réécrit les deux fichiers, par ex.) : on garde les plus
      // récents.
      times = times.slice(times.length - expectedCount)
    }
    return times
  }

  _writeTimes(id, times) {
    const tmp = this._timesPath(id) + '.tmp'
    writeFileSync(tmp, JSON.stringify(times), 'utf8')
    renameSync(tmp, this._timesPath(id))
  }

  /** Appelé depuis _flush juste après qu'un lot de `n` opérations a été
   * ajouté avec succès au .log : leur associe toutes le même horodatage
   * (l'instant du flush — la fenêtre de FLUSH_DELAY_MS rend la précision
   * à l'opération près illusoire de toute façon). Best-effort comme le
   * reste de l'écriture différée : une erreur ici ne doit pas faire
   * échouer la persistance du contenu lui-même. */
  _recordFlushTimes(id, n) {
    try {
      let times = []
      try {
        const parsed = JSON.parse(readFileSync(this._timesPath(id), 'utf8'))
        if (Array.isArray(parsed)) times = parsed
      } catch {
        times = []
      }
      const now = Date.now()
      for (let i = 0; i < n; i++) times.push(now)
      this._writeTimes(id, times)
    } catch (err) {
      console.error(`[storage] échec d'écriture des horodatages pour ${id} :`, err)
    }
  }

  /** Métadonnées légères sur l'historique d'un document : combien
   * d'opérations sont stockées, si ça dépasse le seuil de compaction
   * (maxUncompactedOps), et les bornes temporelles connues. Pas les
   * données elles-mêmes (voir getHistoryRaw) — pensé pour un premier
   * appel bon marché avant de décider de charger le reste. */
  getHistoryMeta(id) {
    const entries = this._walkLog(id)
    const times = this._readTimes(id, entries.length)
    const registry = this._readRegistry()
    const meta = registry[id]
    return {
      count: entries.length,
      maxUncompactedOps: this.maxUncompactedOps,
      needsCompaction: entries.length > this.maxUncompactedOps,
      oldestTs: times.length ? times[0] : (meta ? meta.createdAt : null),
      newestTs: times.length ? times[times.length - 1] : (meta ? meta.updatedAt : null),
    }
  }

  /** Chaque opération stockée pour ce document, avec son horodatage et ses
   * données brutes encodées en base64 — de quoi reconstruire n'importe
   * quelle version intermédiaire côté client (seul endroit où le serveur a
   * le droit de faire de la fusion Yjs, voir l'en-tête de ce fichier).
   * Ne lit que ce qui est déjà sur le disque : les opérations encore en
   * tampon (voir appendUpdate/_flush) n'ont pas encore d'horodatage
   * enregistré, et de toute façon seront flushées d'ici FLUSH_DELAY_MS. */
  getHistoryRaw(id) {
    const entries = this._walkLog(id)
    const times = this._readTimes(id, entries.length)
    return entries.map((e, i) => ({ ts: times[i], data: e.payload.toString('base64') }))
  }

  /** Remplace tout ce qui précède `keepFromIndex` (dans la liste renvoyée
   * par getHistoryRaw) par un unique instantané déjà fusionné côté client
   * — le serveur ne fait ici que de la manipulation d'octets bruts (lire,
   * découper, concaténer, écrire), jamais de fusion Yjs (voir l'invariant
   * en tête de fichier : ça doit rester le cas côté client, qui a déjà
   * `yjs` comme dépendance).
   *
   * - baseSnapshot : Buffer, la mise à jour Yjs représentant l'état fusionné
   *   de toutes les opérations avant keepFromIndex.
   * - baseTs : horodatage à associer à cet instantané (typiquement celui de
   *   la dernière opération qu'il remplace).
   * - keepFromIndex : les opérations d'index >= keepFromIndex sont gardées
   *   telles quelles (copie brute des octets), tout ce qui précède est
   *   remplacé par baseSnapshot.
   * - expectedTotalBeforeCompaction : le nombre total d'opérations que le
   *   client avait vu en calculant baseSnapshot (typiquement via un appel
   *   précédent à getHistoryMeta/getHistoryRaw). Si le journal a changé
   *   entre-temps (une autre compaction a eu lieu, ou de nouvelles
   *   opérations sont arrivées), on refuse plutôt que de risquer de
   *   perdre des données — le client recalcule et réessaie.
   *
   * Chaîné via _flushChain comme le reste des écritures, pour ne jamais
   * s'exécuter en même temps qu'un flush sur le même document. */
  compactDoc(id, { baseSnapshot, baseTs, keepFromIndex, expectedTotalBeforeCompaction }) {
    const prev = this._flushChain.get(id) || Promise.resolve()
    const result = prev.then(() =>
      this._doCompact(id, { baseSnapshot, baseTs, keepFromIndex, expectedTotalBeforeCompaction })
    )
    // La chaîne elle-même ne doit jamais rester rejetée, sinon plus aucun
    // flush ni compaction futurs pour ce document ne pourraient s'exécuter
    // — l'appelant, lui, reçoit bien l'erreur via `result`.
    this._flushChain.set(id, result.catch(() => {}))
    return result
  }

  async _doCompact(id, { baseSnapshot, baseTs, keepFromIndex, expectedTotalBeforeCompaction }) {
    // Une compaction précédente (ou de nouvelles frappes) a pu changer le
    // journal depuis que le client a calculé baseSnapshot — mieux vaut
    // échouer proprement que d'écraser des opérations que le client n'a
    // pas prises en compte dans sa fusion.
    const entries = this._walkLog(id)
    if (
      typeof expectedTotalBeforeCompaction === 'number' &&
      entries.length !== expectedTotalBeforeCompaction
    ) {
      throw new Error(
        `compactDoc : le journal a changé depuis (attendu ${expectedTotalBeforeCompaction} opérations, trouvé ${entries.length}) — recalculez et réessayez`
      )
    }
    if (keepFromIndex < 0 || keepFromIndex > entries.length) {
      throw new Error(`compactDoc : keepFromIndex (${keepFromIndex}) hors limites (0..${entries.length})`)
    }
    const path = this._logPath(id)
    let tailBuf
    if (keepFromIndex >= entries.length) {
      tailBuf = Buffer.alloc(0)
    } else {
      const tailStart = entries[keepFromIndex].start
      const fd = openSync(path, 'r')
      try {
        const size = fstatSync(fd).size
        tailBuf = Buffer.alloc(size - tailStart)
        readSync(fd, tailBuf, 0, tailBuf.length, tailStart)
      } finally {
        closeSync(fd)
      }
    }
    const snapLen = Buffer.alloc(4)
    snapLen.writeUInt32BE(baseSnapshot.length, 0)
    const newLog = Buffer.concat([snapLen, baseSnapshot, tailBuf])
    const tmp = path + '.tmp'
    writeFileSync(tmp, newLog)
    renameSync(tmp, path)

    const times = this._readTimes(id, entries.length)
    const keptTimes = times.slice(keepFromIndex)
    this._writeTimes(id, [baseTs, ...keptTimes])

    this.touchDoc(id)
    return { count: 1 + keptTimes.length }
  }
}
