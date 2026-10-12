// Le journal Yjs d'un document (point 45 de la feuille de route, 11/10/2026),
// sorti de Storage : un fichier `<id>.log` en ajout seul (des mises à jour
// précédées de leur longueur), son compagnon `<id>.times.json` (un horodatage
// par opération), le tampon d'écriture différée, la compaction. Le serveur
// n'y lit jamais le contenu des opérations (voir l'invariant en tête de
// storage.js) : ce sont des octets.
//
// Ce que Storage lui apporte : la fiche du document dans le registre
// (`metaDoc`, pour les dates de repli), et ce qu'il faut faire quand une
// écriture ou un compactage a eu lieu (`apresEcriture`, `apresCompactage` :
// dater le document).

import { existsSync, readFileSync, openSync, readSync, fstatSync, closeSync, unlinkSync, statSync } from 'node:fs'
import { appendFile as appendFileAsync } from 'node:fs/promises'
import { join } from 'node:path'
import { ecrireAtomique } from './fichiers.js'

// How long updates sit in memory before being flushed to disk together —
// see appendUpdate/_flush below (correctif 4.1.2 : écritures asynchrones).
// Long enough to turn "one appendFileSync per keystroke" into a handful of
// writes per second even under several simultaneous fast typists; short
// enough that a crash between flushes loses at most a fraction of a
// second's edits (and every update has already reached every other
// connected peer via rooms.js's broadcast regardless of when it hits disk).
const FLUSH_DELAY_MS = 200

// Historique léger (voir getHistoryMeta/getHistoryRaw/compactDoc) : nombre
// d'opérations qu'une compaction laisse derrière elle — seuil de
// déclenchement, voir COMPACTION_TRIGGER_RATIO. Simple compteur d'opérations,
// pas une taille ni une durée.
const DEFAULT_MAX_UNCOMPACTED_OPS = 1000

// Hystérésis (15/09/2026) : la compaction ne se déclenche pas dès qu'on
// repasse au-dessus du nombre d'opérations conservées, mais seulement à
// COMPACTION_TRIGGER_RATIO fois ce nombre. Sans cette marge, un document
// qui vient d'être compacté repasse au-dessus du seuil à la première
// frappe, et *chaque* client qui se connecte ensuite relance une compaction
// complète pour quelques opérations — constaté au test de charge n°3 : un
// journal retombé à 1 000 opérations était déjà à 1 006, donc « à
// compacter », quelques secondes plus tard. Avec la marge, une compaction
// est suivie de ~500 opérations de répit.
const COMPACTION_TRIGGER_RATIO = 1.5

// Seuil en **octets** (23/09/2026). Compter les opérations ne suffit pas, et
// les mesures du 23/09 le montrent sans appel : sur le document le plus
// lourd du Mac de développement, 165 opérations sur 6 827 portaient 94 Mo
// sur 96. Elles viennent des reconnexions — un client qui a des
// modifications en attente renvoie l'état **entier** du document
// (provider.js), et le serveur, qui ne sait pas lire une opération Yjs, ne
// peut pas savoir qu'elle n'apporte rien : il l'ajoute comme les autres.
//
// Conséquence : un document ayant subi deux cents reconnexions pèserait
// 120 Mo pour deux cents opérations — très en dessous du seuil en
// opérations, donc **jamais compacté**, et rejoué en entier à chaque
// ouverture. C'est le seul scénario où le stockage pouvait croître sans
// limite, et il ne demandait qu'un second seuil.
const DEFAULT_MAX_UNCOMPACTED_BYTES = 4 * 1024 * 1024

export class Journal {
  constructor(
    dataDir,
    {
      maxUncompactedOps = DEFAULT_MAX_UNCOMPACTED_OPS,
      compactionTrigger,
      maxUncompactedBytes = DEFAULT_MAX_UNCOMPACTED_BYTES,
      metaDoc = () => undefined,
      apresEcriture = () => {},
      apresCompactage = () => {},
    } = {}
  ) {
    this.dataDir = dataDir
    this.maxUncompactedOps = maxUncompactedOps
    this.maxUncompactedBytes = maxUncompactedBytes
    // Seuil de déclenchement, distinct du nombre d'opérations conservées
    // (voir COMPACTION_TRIGGER_RATIO). Réglable pour les tests.
    this.compactionTrigger = compactionTrigger || Math.ceil(maxUncompactedOps * COMPACTION_TRIGGER_RATIO)
    this.metaDoc = metaDoc
    this.apresEcriture = apresEcriture
    this.apresCompactage = apresCompactage
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

  _logPath(id) {
    return join(this.dataDir, `${id}.log`)
  }

  /** Fichier compagnon du journal : un horodatage (ms epoch) par opération
   * stockée dans le .log, dans le même ordre — voir _readTimes/_writeTimes
   * et getHistoryMeta/getHistoryRaw/compactDoc plus bas. */
  _timesPath(id) {
    return join(this.dataDir, `${id}.times.json`)
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
        this.apresEcriture(id)
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
    const meta = this.metaDoc(id)
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
    ecrireAtomique(this._timesPath(id), JSON.stringify(times))
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
   * (maxUncompactedOps), le seuil qui déclenche une compaction
   * (compactionTrigger, plus haut que le précédent — voir
   * COMPACTION_TRIGGER_RATIO), et les bornes temporelles connues. Pas les
   * données elles-mêmes (voir getHistoryRaw) — pensé pour un premier
   * appel bon marché avant de décider de charger le reste. */
  getHistoryMeta(id) {
    const entries = this._walkLog(id)
    const times = this._readTimes(id, entries.length)
    const meta = this.metaDoc(id)
    const octets = entries.length ? entries[entries.length - 1].end : 0
    return {
      count: entries.length,
      octets,
      maxUncompactedOps: this.maxUncompactedOps,
      compactionTrigger: this.compactionTrigger,
      maxUncompactedBytes: this.maxUncompactedBytes,
      // Deux seuils, et il suffit que l'un soit franchi : beaucoup de
      // petites frappes, ou peu d'opérations mais très grosses.
      needsCompaction: entries.length > this.compactionTrigger || octets > this.maxUncompactedBytes,
      oldestTs: times.length ? times[0] : meta ? meta.createdAt : null,
      newestTs: times.length ? times[times.length - 1] : meta ? meta.updatedAt : null,
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

  /** Remplace **tout** le journal par un unique instantané, déjà fusionné.
   * Le serveur ne fait ici que de la manipulation d'octets bruts, jamais de
   * fusion Yjs : l'instantané vient de la réplique (server/replique.js), qui
   * a tout vu.
   *
   * - baseSnapshot : Buffer, la mise à jour Yjs représentant l'état fusionné.
   * - baseTs : horodatage à associer à cet instantané.
   *
   * (Jusqu'au 11/10/2026 une compaction partielle existait — garder les
   * N dernières opérations, refuser si le journal avait changé —, du temps
   * où c'était le client qui calculait l'instantané. Plus personne ne s'en
   * servait.)
   *
   * Chaîné via _flushChain comme le reste des écritures, pour ne jamais
   * s'exécuter en même temps qu'un flush sur le même document. */
  compactDoc(id, { baseSnapshot, baseTs }) {
    const prev = this._flushChain.get(id) || Promise.resolve()
    const result = prev.then(() => this._doCompact(id, { baseSnapshot, baseTs }))
    // La chaîne elle-même ne doit jamais rester rejetée, sinon plus aucun
    // flush ni compaction futurs pour ce document ne pourraient s'exécuter
    // — l'appelant, lui, reçoit bien l'erreur via `result`.
    this._flushChain.set(
      id,
      result.catch(() => {})
    )
    return result
  }

  async _doCompact(id, { baseSnapshot, baseTs }) {
    const path = this._logPath(id)
    const snapLen = Buffer.alloc(4)
    snapLen.writeUInt32BE(baseSnapshot.length, 0)
    const newLog = Buffer.concat([snapLen, baseSnapshot])
    ecrireAtomique(path, newLog)

    this._writeTimes(id, [baseTs])

    this.apresCompactage(id)
    return { count: 1 }
  }

  /** Poids d'un document, sans parcourir son journal. `octets` coûte un
   * `stat` ; `operations` vient de data/<id>.times.json (un horodatage par
   * opération), bien moins cher que _walkLog — c'est exactement ce que le
   * test de charge n°3 déconseille de refaire à chaque affichage. Les
   * documents antérieurs à ce fichier renvoient `operations: null`. */
  journalInfo(id) {
    let octets = null
    try {
      octets = statSync(this._logPath(id)).size
    } catch {
      octets = null
    }
    let operations = null
    try {
      const times = JSON.parse(readFileSync(this._timesPath(id), 'utf8'))
      if (Array.isArray(times)) operations = times.length
    } catch {
      operations = null
    }
    return {
      octets,
      operations,
      aCompacter:
        (operations !== null && operations > this.compactionTrigger) ||
        (octets !== null && octets > this.maxUncompactedBytes),
    }
  }

  // --- Ce que la réplique (replique.js) lit sans passer par les privés ------

  /** Le chemin du fichier journal. */
  cheminDuJournal(id) {
    return this._logPath(id)
  }

  /** Les opérations reçues et pas encore écrites sur le disque. */
  enAttente(id) {
    return this._pending.get(id) || []
  }

  /** Écrit tout de suite ce qui est en tampon pour ce document. */
  ecrireMaintenant(id) {
    return this._flush(id)
  }

  /** Oublie un document : ce qui restait en tampon est annulé (sinon un flush
   * différé pourrait recréer le fichier juste après sa suppression), puis le
   * journal et ses horodatages sont effacés du disque. */
  supprimer(id) {
    const timer = this._flushTimers.get(id)
    if (timer) clearTimeout(timer)
    this._flushTimers.delete(id)
    this._pending.delete(id)
    this._flushChain.delete(id)
    const path = this._logPath(id)
    if (existsSync(path)) unlinkSync(path)
    const timesPath = this._timesPath(id)
    if (existsSync(timesPath)) unlinkSync(timesPath)
  }
}
