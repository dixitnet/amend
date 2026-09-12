// File-based storage: no database. Each document is a title in a small
// JSON registry plus an append-only log of binary Yjs updates on disk.
// Deliberately simple so a self-hosted instance needs nothing but a
// writable folder.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, openSync, readSync, fstatSync, closeSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomId } from './ws.js'

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
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
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

  _logPath(id) {
    return join(this.dataDir, `${id}.log`)
  }

  /** Appends one length-prefixed binary update to the document's log. */
  appendUpdate(id, updateBuffer) {
    const lenPrefix = Buffer.alloc(4)
    lenPrefix.writeUInt32BE(updateBuffer.length, 0)
    appendFileSync(this._logPath(id), Buffer.concat([lenPrefix, updateBuffer]))
    this.touchDoc(id)
  }

  /** Reads and returns every stored update for a document, in order. */
  readUpdates(id) {
    const path = this._logPath(id)
    if (!existsSync(path)) return []
    const fd = openSync(path, 'r')
    try {
      const size = fstatSync(fd).size
      const updates = []
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
      return updates
    } finally {
      closeSync(fd)
    }
  }
}
