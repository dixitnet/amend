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

// The shared feuille de style ("Mise en page" admin page) — one config for
// the whole instance, not per document. Mirrors DEFAULT_STYLE in
// client/src/styleConfig.js; kept in sync by hand (small, stable shape,
// not worth a shared module between two separate npm packages for this).
const DEFAULT_STYLE = {
  page: { size: 'A4', marginTop: 25, marginRight: 20, marginBottom: 25, marginLeft: 20 },
  body: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', spaceBefore: 0, spaceAfter: 8 },
  quote: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', spaceBefore: 4, spaceAfter: 8 },
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
    page: { ...DEFAULT_STYLE.page, ...(p.page || {}) },
    body: { ...DEFAULT_STYLE.body, ...(p.body || {}) },
    quote: { ...DEFAULT_STYLE.quote, ...(p.quote || {}) },
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
  constructor(dataDir) {
    this.dataDir = dataDir
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

  listDocs() {
    const registry = this._readRegistry()
    return Object.entries(registry)
      .map(([id, meta]) => ({ id, ...meta }))
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

  createDoc(title) {
    const registry = this._readRegistry()
    const id = randomId()
    const now = Date.now()
    registry[id] = { title: title || 'Sans titre', createdAt: now, updatedAt: now }
    this._writeRegistry(registry)
    writeFileSync(this._logPath(id), Buffer.alloc(0))
    return { id, ...registry[id] }
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

  /** Reads and returns every stored update for a document, in order —
   * whatever's already on disk, followed by anything still buffered in
   * memory (see appendUpdate/_flush) so a client joining mid-batch sees
   * everything, not just what's been flushed so far. */
  readUpdates(id) {
    const path = this._logPath(id)
    const updates = []
    if (existsSync(path)) {
      const fd = openSync(path, 'r')
      try {
        const size = fstatSync(fd).size
        let pos = 0
        const lenBuf = Buffer.alloc(4)
        while (pos + 4 <= size) {
          readSync(fd, lenBuf, 0, 4, pos)
          const len = lenBuf.readUInt32BE(0)
          pos += 4
          if (pos + len > size) break // truncated trailing write, ignore it
          const payload = Buffer.alloc(len)
          readSync(fd, payload, 0, len, pos)
          pos += len
          updates.push(payload)
        }
      } finally {
        closeSync(fd)
      }
    }
    const pending = this._pending.get(id)
    if (pending && pending.length) updates.push(...pending)
    return updates
  }
}
