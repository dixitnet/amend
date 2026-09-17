import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { canJoin } from 'prosemirror-transform'
import { ySyncPluginKey } from 'y-prosemirror'
import { diffWords } from './diff.js'
import { touchedBlockRange } from './incrementalScan.js'

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
 *
 * `enabled` à l'ouverture (15/09/2026) : un éditeur arrive désormais suivi
 * *désactivé* — il écrit son propre document, et n'a pas à désarmer le mode
 * à chaque ouverture. Un correcteur, lui, est forcé à true par editor.js :
 * c'est la définition même de son rôle.
 */
export function trackChangesPlugin({ enabled = true } = {}) {
  return new Plugin({
    key: trackChangesKey,
    state: {
      init() {
        return { enabled }
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

/** Marks `[from, to)` (in `state.doc`, pre-edit) as a tracked deletion in
 * `tr` — except any span that is itself still a pending (unaccepted)
 * insertion from anyone, which really gets removed instead of
 * double-marking it. Shared by rewriteForTracking (plain edits) and
 * richPastePlugin (multi-line paste replacing a selection) so both mark a
 * replaced selection the same way. Mutates `tr`. */
function markRangeForTrackedDeletion(state, tr, from, to, delMark) {
  const insertionType = state.schema.marks.insertion
  const ranges = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (start >= end) return
    const alreadyInsertion = !!insertionType.isInSet(node.marks)
    ranges.push({ from: start, to: end, removeReally: alreadyInsertion })
  })
  for (const r of ranges) {
    const mFrom = tr.mapping.map(r.from)
    const mTo = tr.mapping.map(r.to)
    if (r.removeReally) tr.delete(mFrom, mTo)
    else tr.addMark(mFrom, mTo, delMark)
  }
}

/** True when `step` is a "pure" structural split — Enter pressed inside a
 * block, with no text or other content actually added or removed (see
 * prosemirror-transform's `Transform.split`, which is exactly what
 * baseKeymap's `splitBlock`/`splitListItem` dispatch for a plain Enter).
 * Distinguishes a plain paragraph break from a structural paste (which
 * does carry inserted content, and stays untracked — see
 * rewriteForTracking's fallback below). */
function isPureSplitStep(step) {
  if (step.jsonID !== 'replace') return false
  if (step.from !== step.to) return false
  const { slice } = step
  if (slice.openStart === 0 || slice.openStart !== slice.openEnd) return false
  let hasText = false
  slice.content.descendants((node) => {
    if (node.isText) hasText = true
  })
  return !hasText
}

/** Rewrites a plain top-level paragraph/heading split (Enter pressed
 * directly under the document — not inside a list item or blockquote, see
 * the depth check below) into a tracked one: the split happens for real
 * right away, so editing still feels normal, but the newly-created block
 * is marked `trackedBreak` (schema.js) — its own author/timestamp, like
 * the insertion/deletion marks — so it shows up in the changes panel
 * (listChanges) and can be reversed (acceptChange clears the marker,
 * rejectChange rejoins the two blocks). A split nested inside a list item
 * or blockquote, and anything that isn't a clean split (see
 * isPureSplitStep), falls through untracked — same scope note as
 * schema.js. Returns null when not applicable. */
function rewriteSplitForTracking(state, step, user) {
  if (!isPureSplitStep(step)) return null
  // Only a plain top-level split: `step.from` sits directly inside a
  // paragraph/heading that is itself a direct child of the document
  // (depth 1) — not one level deeper (a list item, a blockquote), which
  // stays untracked, as before this feature existed.
  if (state.doc.resolve(step.from).depth !== 1) return null
  const out = state.tr
  out.step(step)
  // A depth-1 split inserts exactly two structural tokens (closing the
  // first block, opening the second) right at step.from — the boundary
  // between the two resulting top-level blocks is always step.from + 1.
  // Deliberately NOT `out.mapping.map(step.from)`: its default forward
  // bias lands one token too far in, *inside* the second block's content,
  // rather than at the depth-0 boundary between the two blocks.
  const boundaryPos = step.from + 1
  const secondNode = out.doc.resolve(boundaryPos).nodeAfter
  if (!secondNode || (secondNode.type.name !== 'paragraph' && secondNode.type.name !== 'heading')) return null
  out.setNodeMarkup(boundaryPos, null, {
    ...secondNode.attrs,
    trackedBreak: { user: user.name, userColor: user.color, ts: Date.now() },
  })
  out.setMeta('trackChangesInternal', true)
  return out
}

/**
 * Given the transaction ProseMirror was about to apply, builds an
 * equivalent transaction (on the same starting state) that keeps deleted
 * text (marked instead of removed) and marks inserted text, both
 * attributed to `user`. Returns null when the input transaction isn't a
 * simple text edit or a plain top-level split (see comment below) — the
 * caller should then apply the original transaction untouched.
 */
export function rewriteForTracking(state, tr, user) {
  if (tr.steps.length !== 1) return null
  const step = tr.steps[0]
  if (step.jsonID !== 'replace') return null

  const { from, to, slice } = step

  // Pressing Enter (splitBlock/splitListItem) — see rewriteSplitForTracking
  // above. Anything else structural (rich paste, list/quote toggles) still
  // falls through untracked for this version.
  if (slice.openStart > 0 || slice.openEnd > 0) {
    return rewriteSplitForTracking(state, step, user)
  }

  // Only rewrite plain text edits from here (typing, backspace/delete,
  // selecting text and typing over it, plain-text paste) — every child of
  // the slice must be a bare text node.
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

  if (to > from) markRangeForTrackedDeletion(state, out, from, to, delMark)

  // Position du curseur une fois la frappe appliquée — calculée au moment
  // où l'on insère, pas après coup : `mapping.map(from)` rejoué à la fin
  // reporte la position *au-delà* de l'insertion, et le curseur atterrit
  // dans le texte barré (deux lettres sur trois entrelacées, constaté au
  // banc d'essai).
  let curseur = null

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
      curseur = insEnd
    }
  }
  // Rien d'inséré (retour arrière sur une sélection) : le curseur se pose
  // après le passage barré, là où il serait si le texte avait disparu.
  if (curseur === null && to > from) curseur = out.mapping.map(to)

  if (out.steps.length === 0) return null
  // Le curseur va **après ce qu'on vient de taper** (17/09/2026).
  //
  // Sans ça, la sélection d'origine était simplement reportée à travers les
  // pas, et comme le texte remplacé n'est pas retiré mais barré, elle
  // continuait de le couvrir : on tapait par-dessus un mot, et le mot
  // restait sélectionné, en surbrillance, curseur au mauvais endroit. Tapé
  // en suivi de modifications, remplacer un mot doit se sentir exactement
  // comme le remplacer sans suivi — c'est le texte qui change de forme, pas
  // le geste.
  if (curseur != null && positionUtilisable(out.doc, curseur)) {
    out.setSelection(TextSelection.create(out.doc, curseur))
  }
  out.setMeta('trackChangesInternal', true)
  return out
}

/** Une position où l'on peut réellement poser un curseur de texte. */
function positionUtilisable(doc, pos) {
  if (pos < 0 || pos > doc.content.size) return false
  return doc.resolve(pos).parent.isTextblock
}

/**
 * Handles a multi-line paste (the "collage riche" case — content copied
 * from a web page, Word, etc.) as a tracked edit. ProseMirror's own paste
 * handling turns such content into a multi-node slice that
 * rewriteForTracking above deliberately leaves untracked (see its
 * scope note) — this plugin intercepts the paste itself instead, before
 * ProseMirror gets to it.
 *
 * Deliberate scope: only the pasted *text* is kept (via
 * `text/plain`) — any source formatting (bold, links, headings…) is
 * dropped, each line becomes its own tracked-insertion paragraph, and
 * paragraph breaks between lines are tracked exactly like a manual Enter
 * (see rewriteSplitForTracking). A one-line paste (no `\n`) is left to the
 * normal path above unchanged. Only engages when the selection sits
 * directly in one top-level paragraph/heading (not nested in a list item
 * or blockquote, and not spanning several blocks already) — anything else
 * falls back to ProseMirror's own (untracked) paste, same conservative
 * scope as the rest of this file.
 */
export function richPastePlugin(getUser) {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const { state } = view
        if (!isTrackChangesEnabled(state)) return false
        const insertionType = state.schema.marks.insertion
        const deletionType = state.schema.marks.deletion
        if (!insertionType || !deletionType) return false

        const text = event.clipboardData && event.clipboardData.getData('text/plain')
        if (!text) return false
        const lines = text.split(/\r\n|\r|\n/)
        if (lines.length < 2) return false // collage simple : déjà pris en charge plus haut

        const { $from, $to, from, to } = state.selection
        if ($from.depth !== 1 || !$from.sameParent($to)) return false

        const user = getUser()
        const insMark = insertionType.create({ user: user.name, userColor: user.color, ts: Date.now() })
        const authorMark = state.schema.marks.authorColor?.create({ user: user.name, userColor: user.color })
        const tr = state.tr

        if (to > from) {
          const delMark = deletionType.create({ user: user.name, userColor: user.color, ts: Date.now() })
          markRangeForTrackedDeletion(state, tr, from, to, delMark)
        }

        let pos = tr.mapping.map(from)
        const insertLine = (line) => {
          if (!line) return
          tr.insert(pos, state.schema.text(line))
          tr.addMark(pos, pos + line.length, insMark)
          if (authorMark) tr.addMark(pos, pos + line.length, authorMark)
          pos += line.length
        }

        insertLine(lines[0])
        for (let i = 1; i < lines.length; i++) {
          // Same position arithmetic as rewriteSplitForTracking above: a
          // depth-1 split at `pos` puts the depth-0 boundary between the
          // two resulting blocks at `pos + 1`, and that new (second)
          // block's own content starts one further in, at `pos + 2`.
          const splitPos = pos
          tr.split(splitPos)
          const boundaryPos = splitPos + 1
          const after = tr.doc.resolve(boundaryPos).nodeAfter
          if (after) {
            tr.setNodeMarkup(boundaryPos, null, {
              ...after.attrs,
              trackedBreak: { user: user.name, userColor: user.color, ts: Date.now() },
            })
          }
          pos = boundaryPos + 1
          insertLine(lines[i])
        }

            // Même règle que pour la frappe : le curseur se pose après ce qui
        // vient d'être collé, pas sur le passage barré qu'il remplace.
        if (pos >= 0 && pos <= tr.doc.content.size) tr.setSelection(TextSelection.create(tr.doc, pos))
        tr.setMeta('trackChangesInternal', true)
        view.dispatch(tr)
        return true
      },
    },
  })
}

/** Decorates every paragraph/heading carrying a pending `trackedBreak`
 * (schema.js) with a dashed top border in its author's color — the same
 * "pending, not yet reviewed" visual language as the tracked-insertion/
 * deletion marks and the horizontal_rule line (see style.css:
 * .pending-break). Purely a decoration: once trackedBreak is cleared
 * (acceptChange) or the two blocks are rejoined (rejectChange), the
 * paragraph/heading is completely ordinary again. */
export function pendingBreakPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const decos = []
        state.doc.descendants((node, pos) => {
          if (node.isTextblock && node.attrs.trackedBreak) {
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'pending-break',
                style: `--user-color:${node.attrs.trackedBreak.userColor}`,
                title: `Saut de paragraphe ajouté par ${node.attrs.trackedBreak.user}`,
              })
            )
          }
        })
        return DecorationSet.create(state.doc, decos)
      },
    },
  })
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

/** Every raw (unmerged) tracked change touching doc positions in
 * [from, to) — insertions/deletions (via marks) and pending paragraph
 * breaks (via the trackedBreak attr). Used both for a full-document scan
 * (listChanges below) and, incrementally, for just the portion of the
 * document an edit actually touched (see updateChangeList below and
 * changesPanel.js) — see rapport-test-charge-1.md, constat 2.2. */
export function scanChangesInRange(doc, from, to) {
  const raw = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock && node.attrs.trackedBreak && pos >= from && pos < to) {
      const { user, userColor, ts } = node.attrs.trackedBreak
      raw.push({ type: 'break', from: pos, to: pos, user, userColor, ts, text: 'Saut de paragraphe' })
    }
    if (!node.isText) return
    if (pos < from || pos >= to) return
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
  return raw
}

/** Merges adjacent same-type/same-author spans in a raw change list (as
 * produced by scanChangesInRange) into the single logical "changes" shown
 * in the panel. Cheap — proportional to the number of changes, not the
 * size of the document — so it's fine to redo on every transaction even
 * though scanChangesInRange itself only needs to touch the edited part of
 * the document. Requires `raw` sorted by `from`, which every caller here
 * guarantees. */
export function mergeAdjacentChanges(raw) {
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

/** Lists every tracked change currently in the document, merging adjacent
 * spans from the same author/type for a cleaner "changes" panel. */
export function listChanges(doc) {
  return mergeAdjacentChanges(scanChangesInRange(doc, 0, doc.content.size))
}

/** Incrementally updates a raw (unmerged) change list — as returned by
 * scanChangesInRange or by a previous call to this function — for one
 * transaction, without rescanning the whole document: entries outside the
 * edited part of the document are kept (their `from`/`to` remapped
 * through the transaction); only the touched range (see
 * incrementalScan.js) is rescanned fresh. Used by changesPanel.js, which
 * runs mergeAdjacentChanges on the result before displaying it — merging
 * is cheap (proportional to the number of changes) so it's fine to redo
 * on every transaction even though this rescan itself is bounded to the
 * edited range. */
export function updateChangeList(raw, tr) {
  if (!tr.docChanged) return raw
  const range = touchedBlockRange(tr)
  if (!range) return raw
  const inv = tr.mapping.invert()
  const oldFrom = inv.map(range.from, -1)
  const oldTo = inv.map(range.to, 1)
  const kept = []
  for (const c of raw) {
    // A change entirely outside the touched range survives untouched
    // (just remapped); anything that even partially overlaps it is
    // dropped and picked back up by the fresh rescan below, so a change
    // whose span was widened/narrowed by this edit is never left stale.
    if (c.to > oldFrom && c.from < oldTo) continue
    kept.push({ ...c, from: tr.mapping.map(c.from), to: tr.mapping.map(c.to) })
  }
  const rescanned = scanChangesInRange(tr.doc, range.from, range.to)
  return kept.concat(rescanned).sort((a, b) => a.from - b.from)
}

export function acceptChange(view, change) {
  const tr = view.state.tr
  if (change.type === 'break') {
    // Accepter un saut de paragraphe en attente : juste effacer le
    // marqueur, la coupure elle-même reste (c'est déjà l'état réel du
    // document depuis la frappe/le collage — voir rewriteSplitForTracking).
    const node = view.state.doc.nodeAt(change.from)
    if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, trackedBreak: null })
  } else {
    const markType = view.state.schema.marks[change.type]
    if (change.type === 'deletion') retirerTexte(view.state, tr, change.from, change.to)
    else tr.removeMark(change.from, change.to, markType)
  }
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

/** Retire [from, to) — et le **bloc entier** si ce passage en était tout le
 * contenu (17/09/2026).
 *
 * Sans ça, une réécriture de paragraphe par l'IA (voir BIG_REWRITE_RATIO :
 * l'ancien paragraphe barré, le nouveau ajouté en dessous) laissait à
 * l'acceptation un paragraphe vide à la place de l'ancien — un saut de
 * ligne en trop, à chaque paragraphe réécrit, que personne n'avait demandé.
 * Le rejet laissait symétriquement un paragraphe vide à la place du
 * nouveau.
 *
 * Un bloc vide volontairement laissé par quelqu'un n'est pas concerné : on
 * ne retire que le bloc dont on vient de vider le contenu. Et jamais le
 * dernier bloc du document, qui ne peut pas ne pas exister. */
function retirerTexte(state, tr, from, to) {
  const $from = state.doc.resolve(from)
  const profondeur = $from.depth
  if (profondeur > 0 && state.doc.childCount > 1) {
    const debutContenu = $from.start(profondeur)
    const finContenu = $from.end(profondeur)
    const memeBloc = to <= finContenu
    if (memeBloc && from === debutContenu && to === finContenu) {
      tr.delete($from.before(profondeur), $from.after(profondeur))
      return
    }
  }
  tr.delete(from, to)
}

export function rejectChange(view, change) {
  const tr = view.state.tr
  if (change.type === 'break') {
    // Rejeter un saut de paragraphe : le seul moyen de vraiment l'annuler
    // est de refusionner les deux blocs qu'il a créés — l'exact inverse
    // structurel du split d'origine. canJoin est vrai dans le cas courant
    // (les deux blocs viennent du même nœud d'origine, donc du même type)
    // mais plus forcément si l'un des deux a changé de type entre-temps
    // (ex. transformé en titre) — dans ce cas plus rare, on se contente
    // d'effacer le marqueur : le saut reste, mais cesse d'être "en
    // attente" plutôt que de planter sur un join impossible.
    if (canJoin(view.state.doc, change.from)) {
      tr.join(change.from)
    } else {
      const node = view.state.doc.nodeAt(change.from)
      if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, trackedBreak: null })
    }
  } else {
    const markType = view.state.schema.marks[change.type]
    if (change.type === 'insertion') retirerTexte(view.state, tr, change.from, change.to)
    else tr.removeMark(change.from, change.to, markType)
  }
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
      // Un nœud texte ProseMirror ne contient pas de saut de ligne : au
      // niveau d'un diff fin (quelques mots), un saut venu de la
      // suggestion se lit comme une espace.
      tr.insert(insPos, schema.text(op.text.replace(/[\r\n]+/g, ' ')))
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
/** Le texte d'une suggestion, découpé en blocs.
 *
 * L'IA répond parfois en plusieurs paragraphes là où il n'y en avait qu'un.
 * Ce texte était jusqu'ici inséré tel quel dans **un seul nœud texte**,
 * sauts de ligne compris — or un nœud texte ProseMirror n'a pas de sauts de
 * ligne : le document devenait invalide et la coupure n'apparaissait nulle
 * part. Une ligne, un bloc. */
function blocsDepuisTexte(schema, nodeType, nodeAttrs, texte, insMark, authorMark) {
  const marks = authorMark ? [insMark, authorMark] : [insMark]
  return String(texte)
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // `trackedBreak: null` : les blocs ajoutés par l'IA portent déjà leur
    // marque d'insertion, le saut qui les sépare n'est pas une
    // modification de plus à relire.
    .map((ligne) => nodeType.create({ ...nodeAttrs, trackedBreak: null }, schema.text(ligne, marks)))
}

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
    const noeuds = blocsDepuisTexte(schema, block.nodeType, block.nodeAttrs, newText, insMark, authorMark)
    if (!noeuds.length) return block.textTo > block.textFrom
    tr.insert(insertAt, noeuds)
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
      // Les nouveaux paragraphes vont **après le dernier bloc touché**, pas
      // au milieu du texte barré : l'ancien se lit d'un bloc, le nouveau
      // aussi. Avant, la suggestion entière était injectée dans un seul
      // nœud texte, au milieu de la sélection, sauts de ligne compris.
      const dernier = blocks[blocks.length - 1]
      const modele = blocks[0]
      if (suggestion.trim() && dernier && modele) {
        const noeuds = blocsDepuisTexte(
          schema,
          modele.nodeType,
          modele.nodeAttrs,
          suggestion,
          insMark,
          authorMark
        )
        if (noeuds.length) {
          tr.insert(tr.mapping.map(dernier.nodeEnd), noeuds)
          changed = true
        }
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
