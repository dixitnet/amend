// Suivi des modifications — l'état : la clé du greffon, l'interrupteur, ce qui distingue un nœud suivi. Le reste du suivi s'appuie là-dessus.
// (Découpé de l'ancien `trackChanges.js`, 1 630 lignes — audit du 10/10/2026, C11.
// `../trackChanges.js` réexporte tout : aucun import à changer.)

import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { ySyncPluginKey } from 'y-prosemirror'

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

export function isRemoteOrigin(tr) {
  // Transactions produced by y-prosemirror when applying an incoming Yjs
  // update (from another peer, or from an undo/redo that replays through
  // the shared type) carry this meta. We must not re-rewrite those: their
  // content already carries whatever insertion/deletion marks the
  // originating peer applied.
  return !!tr.getMeta(ySyncPluginKey)
}

/** A short id shared by a replacement's deletion mark and its insertion
 * mark — set only when a selection is genuinely replaced by typed/pasted
 * text (see rewriteForTracking and effacementMultiBloc below), never for a
 * plain insertion or a plain deletion. Used purely for display: pairing
 * the two halves into one "remplacement" entry in the changes panel (see
 * pairReplacements) — accept/reject still act on each mark independently
 * underneath, exactly as before (see claude/etude-suivi-remplacement.md,
 * projet Amend). Not cryptographically unique, doesn't need to be: it only
 * has to avoid colliding with another replacement typed in the same
 * millisecond by the same author, which Math.random's few extra bits cover
 * comfortably for this purpose. */
export function idDeGroupe(ts) {
  return `${ts}-${Math.random().toString(36).slice(2, 8)}`
}

/** Marks `[from, to)` (in `state.doc`, pre-edit) as a tracked deletion in
 * `tr` — except any span that is itself still a pending (unaccepted)
 * insertion from anyone, which really gets removed instead of
 * double-marking it. Shared by rewriteForTracking (plain edits) and
 * richPastePlugin (multi-line paste replacing a selection) so both mark a
 * replaced selection the same way. Mutates `tr`. */
/** Vrai pour un nœud suivi **entier** par son attribut `suivi` (image,
 * note — voir schema.js), par opposition au texte, suivi par des marques. */
export function estNoeudSuivi(node) {
  return !node.isText && !!node.type.spec.attrs && 'suivi' in node.type.spec.attrs
}

/** L'état de suivi d'un nœud suivi entier : null, ou { type, user,
 * userColor, ts }. Le seul lecteur de l'attribut. */
export function suiviDuNoeud(node) {
  return estNoeudSuivi(node) ? node.attrs.suivi || null : null
}

/** Ce que le panneau affiche pour un nœud suivi entier. */
export function libelleDuNoeud(node) {
  if (node.type.name === 'footnote') return `Note : ${node.textContent}`
  if (node.type.name === 'hard_break') return 'Saut de ligne'
  if (node.type.name === 'image') return node.attrs.alt ? `Image : ${node.attrs.alt}` : 'Image'
  return node.type.name
}
