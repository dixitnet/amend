import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { ySyncPluginKey } from 'y-prosemirror'
import { diffWords } from './diff.js'

/**
 * Keeps the selection visibly highlighted even after the editor loses DOM
 * focus (e.g. while typing an instruction in the "Assistance IA" textarea,
 * which lives outside the editor). Browsers only paint a contenteditable's
 * native selection while it's focused, so without this, picking a passage
 * and then clicking into the instruction box makes the selection appear to
 * vanish — even though ProseMirror still remembers it perfectly well.
 */
export function selectionHighlightPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const { from, to, empty } = state.selection
        if (empty) return null
        return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: 'ai-selection-highlight' })])
      },
    },
  })
}

export const trackChangesKey = new PluginKey('trackChanges')

/**
 * Holds only the on/off state for "suivi des modifications". The actual
 * rewriting happens in wrapDispatch below, not here — a plugin's
 * appendTransaction runs too late (after the doc has already changed) to
 * turn a deletion into a "keep it, just mark it" edit.
 */
export function trackChangesPlugin() {
  return new Plugin({
    key: trackChangesKey,
    state: {
      init() {
        return { enabled: true }
      },
      apply(tr, value) {
        const meta = tr.getMeta(trackChangesKey)
        if (meta && typeof meta.enabled === 'boolean') return { enabled: meta.enabled }
        return value
      },
    },
  })
}

export function isTrackChangesEnabled(state) {
  return trackChangesKey.getState(state)?.enabled ?? true
}

export function setTrackChangesEnabled(view, enabled) {
  view.dispatch(view.state.tr.setMeta(trackChangesKey, { enabled }))
}

function isRemoteOrigin(tr) {
  // Transactions produced by y-prosemirror when applying an incoming Yjs
  // update (from another peer, or from an undo/redo that replays through
  // the shared type) carry this meta. We must not re-rewrite those: their
  // content already carries whatever insertion/deletion marks the
  // originating peer applied.
  return !!tr.getMeta(ySyncPluginKey)
}

/**
 * Given the transaction ProseMirror was about to apply, builds an
 * equivalent transaction (on the same starting state) that keeps deleted
 * text (marked instead of removed) and marks inserted text, both
 * attributed to `user`. Returns null when the input transaction isn't a
 * single simple text edit (see comment below) — the caller should then
 * apply the original transaction untouched.
 */
export function rewriteForTracking(state, tr, user) {
  if (tr.steps.length !== 1) return null
  const step = tr.steps[0]
  if (step.jsonID !== 'replace') return null

  const { from, to, slice } = step
  // Only rewrite plain text edits (typing, backspace/delete, selecting text
  // and typing over it, plain-text paste). Structural edits — pressing
  // Enter, pasting rich content, list/heading operations — are applied as
  // normal, untracked edits for this first version.
  if (slice.openStart !== 0 || slice.openEnd !== 0) return null
  for (let i = 0; i < slice.content.childCount; i++) {
    if (!slice.content.child(i).isText) return null
  }

  const insertionType = state.schema.marks.insertion
  const deletionType = state.schema.marks.deletion
  if (!insertionType || !deletionType) return null

  const ts = Date.now()
  const insMark = insertionType.create({ user: user.name, userColor: user.color, ts })
  const delMark = deletionType.create({ user: user.name, userColor: user.color, ts })
  const authorMark = state.schema.marks.authorColor?.create({ user: user.name, userColor: user.color })
  const out = state.tr

  if (to > from) {
    const ranges = []
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return
      const start = Math.max(pos, from)
      const end = Math.min(pos + node.nodeSize, to)
      if (start >= end) return
      // Deleting text that is itself still a pending (unaccepted) insertion
      // from anyone really removes it, instead of double-marking it.
      const alreadyInsertion = !!insertionType.isInSet(node.marks)
      ranges.push({ from: start, to: end, removeReally: alreadyInsertion })
    })
    for (const r of ranges) {
      const mFrom = out.mapping.map(r.from)
      const mTo = out.mapping.map(r.to)
      if (r.removeReally) out.delete(mFrom, mTo)
      else out.addMark(mFrom, mTo, delMark)
    }
  }

  if (slice.size > 0) {
    const insPos = out.mapping.map(from)
    const text = slice.content.textBetween(0, slice.content.size, '\n')
    if (text.length > 0) {
      // Use `insert`, not `insertText`: `insertText` looks at
      // storedMarks / the marks active at the boundary position and can
      // silently attach them to the new text (that's how a stray
      // deletion mark used to leak onto brand-new text sitting right
      // next to one). `insert` places a bare, markless text node — the
      // only marks it gets are the ones we add explicitly below.
      out.insert(insPos, state.schema.text(text))
      const insEnd = insPos + text.length
      out.addMark(insPos, insEnd, insMark)
      if (authorMark) out.addMark(insPos, insEnd, authorMark)
    }
  }

  if (out.steps.length === 0) return null
  out.setMeta('trackChangesInternal', true)
  return out
}

/**
 * Wraps an EditorView's transaction dispatch so that, while track changes
 * is on, local edits get rewritten by rewriteForTracking instead of applied
 * directly. `getUser` returns the current { name, color }.
 */
export function makeDispatchTransaction(view, getUser) {
  return function dispatchTransaction(tr) {
    let finalTr = tr
    if (
      tr.docChanged &&
      isTrackChangesEnabled(view.state) &&
      !tr.getMeta('trackChangesInternal') &&
      !isRemoteOrigin(tr)
    ) {
      const rewritten = rewriteForTracking(view.state, tr, getUser())
      if (rewritten) finalTr = rewritten
    }
    const newState = view.state.apply(finalTr)
    view.updateState(newState)
  }
}

/** Lists every tracked change currently in the document, merging adjacent
 * spans from the same author/type for a cleaner "changes" panel. */
export function listChanges(doc) {
  const raw = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const type of ['insertion', 'deletion']) {
      const mark = node.marks.find((m) => m.type.name === type)
      if (mark) {
        raw.push({
          type,
          from: pos,
          to: pos + node.nodeSize,
          user: mark.attrs.user,
          userColor: mark.attrs.userColor,
          ts: mark.attrs.ts,
          text: node.text,
        })
      }
    }
  })
  const merged = []
  for (const c of raw) {
    const last = merged[merged.length - 1]
    if (last && last.type === c.type && last.user === c.user && last.to === c.from) {
      last.to = c.to
      last.text += c.text
    } else {
      merged.push({ ...c })
    }
  }
  return merged
}

export function acceptChange(view, change) {
  const markType = view.state.schema.marks[change.type]
  const tr = view.state.tr
  if (change.type === 'deletion') tr.delete(change.from, change.to)
  else tr.removeMark(change.from, change.to, markType)
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

export function rejectChange(view, change) {
  const markType = view.state.schema.marks[change.type]
  const tr = view.state.tr
  if (change.type === 'insertion') tr.delete(change.from, change.to)
  else tr.removeMark(change.from, change.to, markType)
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

export function acceptAllChanges(view) {
  for (let changes = listChanges(view.state.doc); changes.length; changes = listChanges(view.state.doc)) {
    acceptChange(view, changes[0])
  }
}

export function rejectAllChanges(view) {
  for (let changes = listChanges(view.state.doc); changes.length; changes = listChanges(view.state.doc)) {
    rejectChange(view, changes[0])
  }
}

/**
 * Above this fraction of a (fully-selected) paragraph's characters being
 * touched, a word/letter-level diff stops helping and starts reading as a
 * patchwork of unrelated marks. Past this point we switch strategy: mark
 * the whole old paragraph as one deletion and add the new text as a whole
 * new paragraph right below it — "swap this paragraph for this one",
 * clearly readable, instead of "here are thirty scattered edits". 0.3 is a
 * starting point (a straight reformulation of a sentence or two tends to
 * land well past it, a handful of word-level corrections stays well under
 * it) — easy to tune if it feels off in practice.
 */
const BIG_REWRITE_RATIO = 0.3

/** Replays a word/letter-level diff into `tr` as tracked insert/delete
 * marks anchored at `blockFrom`. Mutates `tr`. Returns true if anything
 * actually changed. */
function replayDiffOps(tr, schema, blockFrom, ops, insMark, delMark, authorMark) {
  let srcPos = blockFrom
  let changed = false
  for (const op of ops) {
    if (!op.text) continue
    if (op.type === 'equal') {
      srcPos += op.text.length
    } else if (op.type === 'delete') {
      const mFrom = tr.mapping.map(srcPos)
      const mTo = tr.mapping.map(srcPos + op.text.length)
      tr.addMark(mFrom, mTo, delMark)
      srcPos += op.text.length
      changed = true
    } else if (op.type === 'insert') {
      const insPos = tr.mapping.map(srcPos)
      tr.insert(insPos, schema.text(op.text))
      tr.addMark(insPos, insPos + op.text.length, insMark)
      if (authorMark) tr.addMark(insPos, insPos + op.text.length, authorMark)
      changed = true
    }
  }
  return changed
}

/** Fraction of `oldText`/`newText` that a diff's insert+delete ops touch,
 * out of the longer of the two texts. */
function diffChangeRatio(oldText, newText, ops) {
  let changedLen = 0
  for (const op of ops) {
    if (op.type !== 'equal') changedLen += op.text.length
  }
  return changedLen / Math.max(oldText.length, newText.length, 1)
}

/**
 * Diffs `block.text` against `newText` and replays the result into `tr` as
 * tracked changes. For a small-to-moderate edit, that's the usual
 * word/letter-level insert+delete marks in place. For a heavy rewrite of a
 * fully-selected paragraph (see BIG_REWRITE_RATIO), it instead marks the
 * whole paragraph deleted and inserts a brand-new paragraph (same node
 * type — heading stays a heading) right after it, carrying the new text as
 * one clean insertion. Mutates `tr`. Returns true if anything changed.
 */
function applyParagraphDiff(tr, schema, block, newText, insMark, delMark, authorMark) {
  const oldText = block.text
  if (oldText === newText) return false
  const ops = diffWords(oldText, newText)

  const bigRewrite = block.fullyCovered && oldText && newText && diffChangeRatio(oldText, newText, ops) >= BIG_REWRITE_RATIO

  if (bigRewrite) {
    if (block.textTo > block.textFrom) {
      tr.addMark(tr.mapping.map(block.textFrom), tr.mapping.map(block.textTo), delMark)
    }
    const insertAt = tr.mapping.map(block.nodeEnd)
    const marks = authorMark ? [insMark, authorMark] : [insMark]
    const newNode = block.nodeType.create(block.nodeAttrs, schema.text(newText, marks))
    tr.insert(insertAt, newNode)
    return true
  }

  return replayDiffOps(tr, schema, block.textFrom, ops, insMark, delMark, authorMark)
}

/** Every top-level text block (paragraph/heading) that [from, to) touches,
 * as { textFrom, textTo, text, nodeStart, nodeEnd, fullyCovered, nodeType,
 * nodeAttrs } clipped to the selection. Used to send a multi-paragraph AI
 * request one paragraph at a time (see aiPanel.js), to diff each paragraph
 * independently instead of as one undifferentiated blob, and (via
 * `fullyCovered`/`nodeEnd`/`nodeType`) to add a whole new paragraph node
 * for a heavy rewrite — see applyParagraphDiff. */
export function getTextBlocksInRange(doc, from, to) {
  const blocks = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const nodeStart = pos
    const nodeEnd = pos + node.nodeSize
    const contentStart = pos + 1
    const contentEnd = pos + node.nodeSize - 1
    const textFrom = Math.max(contentStart, from)
    const textTo = Math.min(contentEnd, to)
    blocks.push({
      textFrom,
      textTo,
      text: doc.textBetween(textFrom, textTo),
      nodeStart,
      nodeEnd,
      fullyCovered: textFrom === contentStart && textTo === contentEnd,
      nodeType: node.type,
      nodeAttrs: node.attrs,
    })
    return false
  })
  return blocks
}

/**
 * Inserts `suggestion` as a tracked replacement for the text in [from, to),
 * attributed to the AI. Used by the AI panel.
 *
 * Rather than blanket-marking the whole selection as "deleted" and the
 * whole suggestion as "added" (which makes even a one-letter accent fix
 * read as "the AI rewrote this entire paragraph"), this diffs the original
 * text against the suggestion and only marks the spans that actually
 * changed — down to individual letters for a single-word tweak like
 * "chomage" -> "chômage". When the selection covers several paragraphs,
 * each original paragraph is diffed against its counterpart in the
 * suggestion (matched by position), so an untouched paragraph stays
 * completely unmarked and only the paragraphs that actually changed show
 * any tracked change at all.
 */
export function insertAISuggestion(view, from, to, suggestion, aiUser) {
  const schema = view.state.schema
  const ts = Date.now()
  const insMark = schema.marks.insertion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const delMark = schema.marks.deletion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const authorMark = schema.marks.authorColor?.create({ user: aiUser.name, userColor: aiUser.color })

  const tr = view.state.tr
  const $from = view.state.doc.resolve(from)
  const $to = view.state.doc.resolve(to)

  let changed = false

  if ($from.sameParent($to)) {
    // Single block (the common case: a sentence or paragraph selected
    // inside one paragraph/heading) — diff word-by-word so only the real
    // changes get marked (or, for a heavy rewrite, swap the whole
    // paragraph — see applyParagraphDiff).
    const [block] = getTextBlocksInRange(view.state.doc, from, to)
    if (block) changed = applyParagraphDiff(tr, schema, block, suggestion, insMark, delMark, authorMark)
  } else {
    const blocks = getTextBlocksInRange(view.state.doc, from, to)
    // The AI is asked to keep one line per paragraph (see ai.js), so in the
    // common case — reformulating N paragraphs into N paragraphs — the
    // split lines up 1:1 with the original blocks. Diff each pair
    // independently so an untouched paragraph among them stays untouched.
    const newParas = suggestion.trim().split(/\n+/)
    if (blocks.length > 0 && newParas.length === blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        const didChange = applyParagraphDiff(tr, schema, blocks[i], newParas[i], insMark, delMark, authorMark)
        changed = changed || didChange
      }
    } else {
      // Paragraph count changed (merge/split) — diffing across block
      // boundaries in that case is out of scope for v0.1. Fall back to
      // marking the whole selection as one delete + one insert.
      if (to > from) {
        tr.addMark(from, to, delMark)
        changed = true
      }
      if (suggestion.length > 0) {
        const insPos = tr.mapping.map(to)
        tr.insert(insPos, schema.text(suggestion))
        tr.addMark(insPos, insPos + suggestion.length, insMark)
        if (authorMark) tr.addMark(insPos, insPos + suggestion.length, authorMark)
        changed = true
      }
    }
  }

  if (!changed) return
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

/**
 * Like insertAISuggestion, but for a selection that was split into several
 * independent per-paragraph AI requests (see aiPanel.js) instead of one
 * request for the whole selection. Since each block in `blocks` (from
 * getTextBlocksInRange) got its own dedicated suggestion, there's no
 * paragraph-count guessing here: `suggestions[i]` is diffed against
 * `blocks[i]` directly, one block at a time, in a single transaction.
 * `suggestions[i]` may be null for a block whose request failed — that
 * block is left untouched rather than aborting the whole thing.
 */
export function insertAIParagraphSuggestions(view, blocks, suggestions, aiUser) {
  const schema = view.state.schema
  const ts = Date.now()
  const insMark = schema.marks.insertion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const delMark = schema.marks.deletion.create({ user: aiUser.name, userColor: aiUser.color, ts })
  const authorMark = schema.marks.authorColor?.create({ user: aiUser.name, userColor: aiUser.color })

  const tr = view.state.tr
  let changed = false
  for (let i = 0; i < blocks.length; i++) {
    const suggestion = suggestions[i]
    if (suggestion == null) continue
    const didChange = applyParagraphDiff(tr, schema, blocks[i], suggestion, insMark, delMark, authorMark)
    changed = changed || didChange
  }

  if (!changed) return
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}
