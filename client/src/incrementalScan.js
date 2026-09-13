/**
 * Shared incremental-recompute helpers for plugins that would otherwise
 * rescan the whole document on every transaction (wordcount.js,
 * outline.js, tkMarker.js, and — via trackChanges.js's updateChangeList —
 * changesPanel.js). See rapport-test-charge-1.md, constat 2.2: several
 * plugins recomputing over the entire document on every keystroke is the
 * identified cause of client-side dispatch latency growing with document
 * size/tracked-change volume. The shared idea: a transaction always
 * carries exactly the information needed to know what changed
 * (tr.steps/tr.mapping) — use that to recompute only the affected part of
 * the document instead of the whole thing.
 */

/**
 * Returns the [from, to) range of `tr.doc` (final positions, after every
 * step) that this transaction touched, expanded to the boundaries of the
 * enclosing top-level block(s) — or null if the transaction didn't
 * actually change the document. A block-level result (rather than the raw
 * touched positions) means callers that rescan just this range always see
 * each affected block *whole*, which matters for anything computed
 * per-block (a paragraph's word count, whether a paragraph is a heading,
 * merging adjacent tracked-change spans...).
 */
export function touchedBlockRange(tr) {
  if (!tr.docChanged || tr.steps.length === 0) return null
  let minFrom = Infinity
  let maxTo = -Infinity
  for (let i = 0; i < tr.steps.length; i++) {
    const step = tr.steps[i]
    if (typeof step.from !== 'number' || typeof step.to !== 'number') continue
    // step.from/to are expressed in the doc *before* step i. Map them
    // forward through this step and every step after it (the same
    // technique prosemirror-transform itself uses internally, e.g.
    // `tr.mapping.slice(mapFrom).map(pos)`) to land in tr.doc's final
    // coordinates, so every step's touched range ends up comparable.
    const rest = tr.mapping.slice(i)
    const from = rest.map(step.from, -1)
    const to = rest.map(step.to, 1)
    if (from < minFrom) minFrom = from
    if (to > maxTo) maxTo = to
  }
  if (minFrom === Infinity) return null
  const doc = tr.doc
  const size = doc.content.size
  const clampedFrom = Math.max(0, Math.min(minFrom, size))
  const clampedTo = Math.max(clampedFrom, Math.min(maxTo, size))
  const $from = doc.resolve(clampedFrom)
  const $to = doc.resolve(clampedTo)
  const from = $from.depth >= 1 ? $from.before(1) : 0
  const to = $to.depth >= 1 ? $to.after(1) : size
  return { from, to }
}

/**
 * Incrementally updates a list of `{ pos, ... }` items (as produced by
 * `scanRange(doc, from, to)`, sorted by `pos`) for one transaction,
 * without rescanning the whole document: entries outside the edited part
 * of the document are kept (with `pos` remapped through the transaction);
 * only the touched range (see touchedBlockRange) is rescanned fresh.
 * Always returns a new array — `items` is never mutated. Used by
 * outline.js. changesPanel.js uses its own variant
 * (trackChanges.js's updateChangeList) since a tracked change spans a
 * range (`from`/`to`), not a single point.
 */
export function updateItemList(items, tr, scanRange) {
  if (!tr.docChanged) return items
  const range = touchedBlockRange(tr)
  if (!range) return items
  const inv = tr.mapping.invert()
  const oldFrom = inv.map(range.from, -1)
  const oldTo = inv.map(range.to, 1)
  const kept = []
  for (const item of items) {
    if (item.pos >= oldFrom && item.pos < oldTo) continue
    kept.push({ ...item, pos: tr.mapping.map(item.pos) })
  }
  const rescanned = scanRange(tr.doc, range.from, range.to)
  return kept.concat(rescanned).sort((a, b) => a.pos - b.pos)
}
