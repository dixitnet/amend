import { Plugin, PluginKey } from 'prosemirror-state'
import { touchedBlockRange } from './incrementalScan.js'
import { throttle } from './throttle.js'

/** Word/character count for a doc range. Character count is the plain text
 * length (spaces included, no separators added — matches what the user
 * actually typed). Word count inserts a space between blocks first, so two
 * adjacent paragraphs' words are never fused into one at the boundary. */
export function countText(doc, from, to) {
  const chars = doc.textBetween(from, to, '', '').length
  const wordsSource = doc.textBetween(from, to, ' ', ' ').trim()
  const words = wordsSource === '' ? 0 : wordsSource.split(/\s+/).length
  return { chars, words }
}

const wordCountKey = new PluginKey('wordCountTotal')
const RENDER_INTERVAL_MS = 1000

/**
 * Keeps the whole-document {chars, words} total in sync with a
 * transaction without rescanning the whole document (see
 * rapport-test-charge-1.md, constat 2.2): only the part of the document
 * the transaction actually touched (expanded to whole top-level
 * blocks — see incrementalScan.js) is recounted, both before and after
 * the edit, and the difference is folded into the running total. Falls
 * back to a full recount if anything about the touched-range computation
 * looks off, so a bug here can only cost performance, never silently
 * drift the displayed count.
 */
function applyCount(tr, prev) {
  if (!tr.docChanged) return prev
  const range = touchedBlockRange(tr)
  if (!range) return prev
  try {
    const inv = tr.mapping.invert()
    const beforeSize = tr.before.content.size
    const oldFrom = Math.max(0, Math.min(inv.map(range.from, -1), beforeSize))
    const oldTo = Math.max(oldFrom, Math.min(inv.map(range.to, 1), beforeSize))
    const before = countText(tr.before, oldFrom, oldTo)
    const after = countText(tr.doc, range.from, range.to)
    return {
      chars: prev.chars - before.chars + after.chars,
      words: prev.words - before.words + after.words,
    }
  } catch {
    return countText(tr.doc, 0, tr.doc.content.size)
  }
}

/**
 * Renders a permanent word/character counter into `container`: the current
 * selection when it's non-empty, otherwise the whole document. The
 * whole-document count is maintained incrementally in plugin state
 * (applyCount above) instead of rescanned on every keystroke; the DOM
 * write itself is additionally throttled to at most once a second
 * (RENDER_INTERVAL_MS) — a counter lagging up to a second behind the very
 * latest keystroke is imperceptible in normal use, and it's this repaint
 * that used to cost the most as the document/tracked-change volume grew.
 */
export function mountWordCount(container) {
  let view = null
  let last = null

  function render() {
    if (!view) return
    const { state } = view
    const { selection } = state
    const selecting = !selection.empty
    const { chars, words } = selecting
      ? countText(state.doc, selection.from, selection.to)
      : wordCountKey.getState(state)
    const signature = `${selecting}:${chars}:${words}`
    if (signature === last) return
    last = signature
    const wordLabel = words === 1 ? 'mot' : 'mots'
    const charLabel = chars === 1 ? 'caractère' : 'caractères'
    container.textContent = selecting
      ? `Sélection : ${words} ${wordLabel}, ${chars} ${charLabel}`
      : `${words} ${wordLabel}, ${chars} ${charLabel}`
  }

  const throttledRender = throttle(render, RENDER_INTERVAL_MS)

  const plugin = new Plugin({
    key: wordCountKey,
    state: {
      init: (_, state) => countText(state.doc, 0, state.doc.content.size),
      apply: applyCount,
    },
    view(editorView) {
      view = editorView
      render() // first paint immediately, no need to wait a second on load
      return {
        update: () => throttledRender(),
        destroy: () => {
          view = null
        },
      }
    },
  })

  return plugin
}
