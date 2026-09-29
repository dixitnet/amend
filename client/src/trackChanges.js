import { Plugin, PluginKey, TextSelection, NodeSelection } from 'prosemirror-state'
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
function idDeGroupe(ts) {
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
function libelleDuNoeud(node) {
  if (node.type.name === 'footnote') return `Note : ${node.textContent}`
  if (node.type.name === 'image') return node.attrs.alt ? `Image : ${node.attrs.alt}` : 'Image'
  return node.type.name
}

function markRangeForTrackedDeletion(state, tr, from, to, delMark) {
  const insertionType = state.schema.marks.insertion
  const ranges = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    // Un nœud suivi entier dans la sélection (note, image) : par son
    // attribut `suivi`, pas par une marque — voir schema.js. Déjà proposé
    // à la suppression : rien à faire. Proposé à l'insertion **par la même
    // personne** : il disparaît, comme du texte qu'on vient de taper.
    if (estNoeudSuivi(node)) {
      // Partiellement couvert : c'est son texte qu'on barre, on descend.
      if (pos < from || pos + node.nodeSize > to) return true
      const suivi = suiviDuNoeud(node)
      if (suivi && suivi.type === 'deletion') return false
      ranges.push({ from: pos, to: pos + node.nodeSize, noeud: node, removeReally: !!suivi && suivi.user === delMark.attrs.user })
      return false
    }
    if (!node.isText) return
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    if (start >= end) return
    // Retiré pour de bon seulement si c'est **sa propre** insertion en
    // attente (D2 du rapport du 28/09/2026) : effacer ce qu'un autre vient
    // de proposer le barre, comme n'importe quel texte — sinon un
    // correcteur pouvait faire disparaître sans trace la proposition d'un
    // éditeur.
    const insertion = insertionType.isInSet(node.marks)
    ranges.push({ from: start, to: end, removeReally: !!insertion && insertion.attrs.user === delMark.attrs.user })
  })
  for (const r of ranges) {
    const mFrom = tr.mapping.map(r.from)
    const mTo = tr.mapping.map(r.to)
    if (r.removeReally) tr.delete(mFrom, mTo)
    else if (r.noeud) {
      const { user, userColor, ts } = delMark.attrs
      tr.setNodeMarkup(mFrom, null, { ...r.noeud.attrs, suivi: { type: 'deletion', user, userColor, ts } })
    } else tr.addMark(mFrom, mTo, delMark)
  }
}

/** `true` si [f, t) est déjà proposé à la suppression — du texte barré, ou
 * une note entière portant `suivi.type === 'deletion'`. */
function dejaSupprime(state, f, t, deletionType) {
  if (state.doc.rangeHasMark(f, t, deletionType)) return true
  const node = state.doc.nodeAt(f)
  const suivi = node && t - f === node.nodeSize ? suiviDuNoeud(node) : null
  return !!(suivi && suivi.type === 'deletion')
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

/** Le caractère qu'une touche d'effacement doit réellement barrer, en
 * **sautant ce qui est déjà barré** (17/09/2026).
 *
 * Sans ça, le curseur restait planté contre un passage barré et chaque
 * touche visait le même caractère. Comme poser une marque déjà posée ne
 * produit aucun pas, la transaction réécrite était vide, `rewriteForTracking`
 * renvoyait `null`, et l'appelant appliquait alors la **transaction
 * d'origine** : un retour arrière sur deux supprimait pour de bon le
 * caractère barré, sans laisser de trace. Le suivi des modifications se
 * contournait donc en appuyant deux fois sur la même touche — y compris
 * pour un correcteur, qui n'est censé rien pouvoir retirer.
 *
 * On avance donc dans le sens de la frappe jusqu'au premier caractère
 * encore vivant, sans sortir du bloc. `null` veut dire « il n'y a plus rien
 * à barrer de ce côté ».
 */
function caractereAEffacer(state, from, to, versLArriere) {
  const deletionType = state.schema.marks.deletion
  const $pos = state.doc.resolve(from)
  const debut = $pos.start()
  const fin = $pos.end()
  let f = from
  let t = to
  // Garde-fou : un document pathologique ne doit pas faire tourner cette
  // boucle plus longtemps que le bloc lui-même.
  for (let n = fin - debut; n >= 0; n--) {
    if (f < debut || t > fin || f >= t) return null
    if (!dejaSupprime(state, f, t, deletionType)) return { from: f, to: t }
    if (versLArriere) {
      f -= 1
      t -= 1
    } else {
      f += 1
      t += 1
    }
  }
  return null
}

/** Les marques de mise en forme (gras, italique, souligné, barré) que
 * ProseMirror donnerait à une frappe à cet endroit — celles du curseur,
 * ou celles posées en attente (Ctrl+B sur une sélection vide). Jamais les
 * marques du suivi ni la couleur d'auteur, qui sont posées à part. */
export const MARQUES_MISE_EN_FORME = new Set(['strong', 'em', 'underline', 'strike'])
function marquesDeMiseEnForme(state) {
  const marques = state.storedMarks || state.selection.$from.marks()
  return marques.filter((m) => MARQUES_MISE_EN_FORME.has(m.type.name))
}

/** `true` si [from, to] tient dans un seul bloc de texte.
 *
 * Un retour arrière en début de paragraphe ne supprime pas du texte : il
 * **fusionne deux blocs**, et cette opération-là reste hors suivi (même
 * périmètre que le reste de ce fichier). Sans cette vérification, le
 * réécrivain s'en emparait, ne trouvait rien à barrer dans le bloc
 * précédent, et se contentait de déplacer le curseur : la touche n'avait
 * plus aucun effet. Constaté par Sylvain le 17/09. */
function dansUnSeulBloc(state, from, to) {
  const $from = state.doc.resolve(from)
  const $to = state.doc.resolve(to)
  // `inlineContent` et non `isTextblock` : le texte d'une note (un nœud
  // inline à contenu, voir schema.js) se suit comme celui d'un paragraphe.
  return $from.parent.inlineContent && $from.sameParent($to)
}

/** Une transaction qui ne fait que déplacer le curseur. Sert quand il n'y a
 * plus rien à barrer : on ne renvoie surtout pas `null`, qui laisserait
 * passer la suppression d'origine. */
function seulementLeCurseur(state, pos) {
  const cible = Math.max(0, Math.min(pos, state.doc.content.size))
  const out = state.tr
  if (positionUtilisable(out.doc, cible)) out.setSelection(TextSelection.create(out.doc, cible))
  out.setMeta('trackChangesInternal', true)
  return out
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
/** Le texte brut d'une tranche, ou `null` si elle contient autre chose que
 * des blocs de texte (une image, un tableau, une liste…). Sert à décider si
 * un remplacement est une simple frappe ou une opération structurelle. */
function texteDeLaTranche(slice) {
  let texte = ''
  let pur = true
  slice.content.descendants((node) => {
    if (node.isText) {
      texte += node.text
      return false
    }
    if (!node.isTextblock) pur = false
    return pur
  })
  return pur ? texte : null
}

/**
 * Effacer (ou taper par-dessus) une sélection qui **traverse des blocs de
 * natures différentes** — un paragraphe et une citation, par exemple.
 *
 * Bug signalé par Sylvain le 19/09/2026 : pris séparément, chacun de ces
 * blocs se barrait correctement ; supprimés ensemble, ils disparaissaient
 * sans laisser la moindre trace. La raison est entièrement du côté de
 * ProseMirror : il ne sait pas fusionner un paragraphe avec une citation,
 * alors au lieu d'un simple `replace` avec une tranche vide, il remplace
 * toute la plage par un bloc neuf (`replace` dont la tranche contient un
 * paragraphe) ou, si on tape par-dessus, par un `replaceAround`. Dans les
 * deux cas, la réécriture en suivi ne reconnaissait pas la forme de la
 * transaction et renvoyait `null` — ce qui fait appliquer la suppression
 * d'origine, telle quelle, hors suivi. Le pire des deux mondes : le suivi
 * était actif, et le texte partait pour de bon.
 *
 * On ne s'appuie donc pas sur la forme du pas, mais sur la sélection : ce
 * qui disparaît, c'est ce qui était sélectionné. On le barre, et on insère
 * la frappe éventuelle au début — exactement la convention du cas simple.
 * La structure des blocs, elle, n'est pas touchée : rien n'est fusionné
 * tant que la modification n'est pas acceptée.
 */
function effacementMultiBloc(state, tr, step, user) {
  if (step.jsonID !== 'replace' && step.jsonID !== 'replaceAround') return null
  // Un collage a son propre chemin (richPastePlugin) : ne pas s'en mêler.
  if (tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste') return null
  const { from, to } = state.selection
  if (!(to > from)) return null
  // Le cas d'un seul bloc est traité par la voie normale, plus fine.
  if (dansUnSeulBloc(state, from, to)) return null
  // La sélection doit bien être ce que le pas efface, sinon on ne sait pas
  // de quoi il s'agit (bascule de liste, changement de bloc…).
  if (step.from > from || step.to < to) return null
  const texte = texteDeLaTranche(step.slice)
  if (texte === null) return null

  const insertionType = state.schema.marks.insertion
  const deletionType = state.schema.marks.deletion
  if (!insertionType || !deletionType) return null

  const ts = Date.now()
  const groupe = texte.length > 0 ? idDeGroupe(ts) : null
  const delMark = deletionType.create({ user: user.name, userColor: user.color, ts, groupe })
  const out = state.tr
  markRangeForTrackedDeletion(state, out, from, to, delMark)

  let curseur = out.mapping.map(from)
  if (texte.length > 0 && positionUtilisable(out.doc, curseur)) {
    const insMark = insertionType.create({ user: user.name, userColor: user.color, ts, groupe })
    const authorMark = state.schema.marks.authorColor?.create({
      user: user.name,
      userColor: user.color,
    })
    out.insert(curseur, state.schema.text(texte))
    const fin = curseur + texte.length
    out.addMark(curseur, fin, insMark)
    if (authorMark) out.addMark(curseur, fin, authorMark)
    curseur = fin
  }

  if (out.steps.length === 0) return seulementLeCurseur(state, from)
  if (positionUtilisable(out.doc, curseur)) {
    out.setSelection(TextSelection.create(out.doc, curseur))
  }
  out.setMeta('trackChangesInternal', true)
  return out
}

export function rewriteForTracking(state, tr, user) {
  if (tr.steps.length !== 1) return null
  const step = tr.steps[0]

  // Une sélection qui traverse plusieurs blocs de natures différentes ne
  // produit pas la forme de transaction attendue plus bas : traitée à part.
  const multiBloc = effacementMultiBloc(state, tr, step, user)
  if (multiBloc) return multiBloc

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

  // Une touche d'effacement (retour arrière ou suppression avant), par
  // opposition à une frappe qui remplace une sélection : rien n'est
  // inséré, et la sélection de départ était un simple curseur.
  let cibleFrom = from
  let cibleTo = to
  let versLArriere = false
  const effacement =
    slice.size === 0 && to > from && state.selection.empty && dansUnSeulBloc(state, from, to)
  if (effacement) {
    // Retour arrière : le curseur était à droite de ce qui disparaît.
    versLArriere = state.selection.head === to
    const cible = caractereAEffacer(state, from, to, versLArriere)
    // Plus rien à barrer de ce côté : on déplace seulement le curseur, au
    // bord du passage barré. Surtout pas `null`, qui laisserait passer la
    // suppression d'origine.
    if (!cible) return seulementLeCurseur(state, versLArriere ? from : to)
    cibleFrom = cible.from
    cibleTo = cible.to
  }

  const ts = Date.now()
  // Un vrai remplacement — une sélection non vide, et quelque chose à
  // insérer à la place — partage un identifiant de groupe entre les deux
  // marques (voir idDeGroupe ci-dessus). Un simple effacement (rien à
  // insérer) ou une frappe au curseur (rien à effacer) n'en a pas besoin :
  // il n'y a qu'une seule moitié.
  const groupe = cibleTo > cibleFrom && slice.size > 0 ? idDeGroupe(ts) : null
  const insMark = insertionType.create({ user: user.name, userColor: user.color, ts, groupe })
  const delMark = deletionType.create({ user: user.name, userColor: user.color, ts, groupe })
  const authorMark = state.schema.marks.authorColor?.create({ user: user.name, userColor: user.color })
  const out = state.tr

  if (cibleTo > cibleFrom) markRangeForTrackedDeletion(state, out, cibleFrom, cibleTo, delMark)

  // Position du curseur une fois la frappe appliquée — calculée au moment
  // où l'on insère, pas après coup : `mapping.map(from)` rejoué à la fin
  // reporte la position *au-delà* de l'insertion, et le curseur atterrit
  // dans le texte barré (deux lettres sur trois entrelacées, constaté au
  // banc d'essai).
  let curseur = null

  if (slice.size > 0) {
    const insPos = out.mapping.map(cibleFrom)
    const text = slice.content.textBetween(0, slice.content.size, '\n')
    if (text.length > 0) {
      // Use `insert`, not `insertText`: `insertText` looks at
      // storedMarks / the marks active at the boundary position and can
      // silently attach them to the new text (that's how a stray
      // deletion mark used to leak onto brand-new text sitting right
      // next to one). `insert` places a bare, markless text node — the
      // only marks it gets are the ones we add explicitly below.
      // …sauf la mise en forme active au curseur (gras, italique…) : taper
      // au milieu d'un mot en gras reste en gras, en suivi comme hors
      // suivi (D1 du rapport du 28/09/2026).
      out.insert(insPos, state.schema.text(text, marquesDeMiseEnForme(state)))
      const insEnd = insPos + text.length
      out.addMark(insPos, insEnd, insMark)
      if (authorMark) out.addMark(insPos, insEnd, authorMark)
      curseur = insEnd
    }
  }
  // Rien d'inséré : le curseur se pose du côté vers lequel on efface — à
  // gauche du passage barré pour un retour arrière, à droite pour une
  // suppression avant. C'est ce qui permet d'appuyer plusieurs fois de
  // suite : chaque frappe mord sur le caractère suivant au lieu de revenir
  // buter sur celui qu'on vient de barrer.
  //
  // Une sélection effacée compte comme un retour arrière : le curseur se
  // pose **avant** le passage barré. C'est ce qui rend le résultat
  // identique quel que soit le chemin — effacer une sélection puis taper
  // doit donner le même texte que taper directement par-dessus elle, et
  // dans le même ordre à l'écran. Seule la suppression avant pousse le
  // curseur de l'autre côté.
  if (curseur === null && cibleTo > cibleFrom) {
    curseur = out.mapping.map(effacement && !versLArriere ? cibleTo : cibleFrom)
  }

  // Une réécriture qui ne produit aucun pas ne doit **jamais** renvoyer
  // `null` quand il s'agissait d'un effacement : l'appelant appliquerait
  // alors la suppression d'origine, telle quelle, hors suivi.
  if (out.steps.length === 0) return effacement ? seulementLeCurseur(state, versLArriere ? cibleFrom : cibleTo) : null
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
  return doc.resolve(pos).parent.inlineContent
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
          // Un nœud de bloc suivi entier (une image) : même langage visuel.
          // La note, inline, se décore elle-même (footnotes.js).
          const suivi = node.isBlock ? suiviDuNoeud(node) : null
          if (suivi) {
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: suivi.type === 'insertion' ? 'noeud-insere' : 'noeud-supprime',
                style: `--user-color:${suivi.userColor}`,
                title: `${libelleDuNoeud(node)} ${suivi.type === 'insertion' ? 'ajoutée' : 'supprimée'} par ${suivi.user}`,
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
/**
 * Les touches d'effacement, prises en charge **avant le navigateur**
 * (17/09/2026).
 *
 * Jusqu'ici, Retour arrière et Suppr passaient par le comportement natif du
 * champ éditable, et l'on réécrivait après coup la transaction que
 * ProseMirror en déduisait. Ça marche tant que le document à l'écran est
 * celui que le navigateur croit éditer — or le suivi des modifications
 * garde à l'écran du texte que le navigateur considère comme effacé. Avec
 * la touche maintenue enfoncée, Chrome finissait par réparer ce qu'il
 * prenait pour une incohérence et **insérait une espace** avant le mot
 * qu'on était en train d'effacer (signalé par Sylvain le 17/09).
 *
 * On ne laisse donc plus le navigateur toucher au document : la touche est
 * interceptée, la transaction suivie construite directement, et rien n'est
 * déduit du DOM. `false` quand ce n'est pas notre affaire — hors suivi, en
 * début de bloc (c'est une fusion, pas un effacement), sur une sélection
 * qui traverse plusieurs blocs — et la commande suivante prend la main,
 * exactement comme avant.
 */
export function effacementSuivi(getUser, versLArriere) {
  return (state, dispatch) => {
    if (!isTrackChangesEnabled(state)) return false
    const sel = state.selection
    // Un nœud de bloc sélectionné entier (une image) : suivi par son
    // attribut, sans passer par la réécriture, qui ne connaît que le
    // texte dans un bloc.
    if (sel instanceof NodeSelection && estNoeudSuivi(sel.node)) {
      const user = getUser()
      const ts = Date.now()
      const tr = state.tr
      const suivi = suiviDuNoeud(sel.node)
      if (suivi && suivi.type === 'deletion') return true
      if (suivi && suivi.type === 'insertion' && suivi.user === user.name) tr.delete(sel.from, sel.to)
      else tr.setNodeMarkup(sel.from, null, { ...sel.node.attrs, suivi: { type: 'deletion', user: user.name, userColor: user.color, ts } })
      tr.setMeta('trackChangesInternal', true)
      if (dispatch) dispatch(tr)
      return true
    }
    let debut
    let fin
    if (!sel.empty) {
      debut = sel.from
      fin = sel.to
    } else if (versLArriere) {
      // Un nœud entier avant le curseur (une note) : c'est lui qu'on
      // efface, pas « un caractère » qui tomberait au milieu de son texte.
      const avant = sel.$from.nodeBefore
      debut = sel.from - (avant && !avant.isText ? avant.nodeSize : 1)
      fin = sel.from
    } else {
      const apres = sel.$from.nodeAfter
      debut = sel.from
      fin = sel.from + (apres && !apres.isText ? apres.nodeSize : 1)
    }
    if (debut < 0 || fin > state.doc.content.size || debut >= fin) return false
    if (!dansUnSeulBloc(state, debut, fin)) return false

    const suivie = rewriteForTracking(state, state.tr.delete(debut, fin), getUser())
    if (!suivie) return false
    if (dispatch) dispatch(suivie)
    return true
  }
}

/**
 * `peutModifierLibrement` : vrai pour qui a le droit d'écrire hors suivi
 * (un éditeur). Pour les autres — un correcteur —, **ce que le suivi ne
 * sait pas suivre est refusé** (S1 du rapport du 28/09/2026) : fusionner ou
 * scinder des blocs hors premier niveau, changer un paragraphe en titre,
 * mettre en forme, cocher une tâche… Avant, ces gestes passaient hors
 * suivi, sans un mot : autant de portes de sortie du suivi pour quelqu'un
 * dont le rôle est de proposer. Une règle, écrite ici une fois, qui
 * remplace les cas particuliers (boutons cachés, gardes par greffon) et
 * couvre ceux qu'on n'a pas listés. `surRefus` prévient la personne.
 */
export function makeDispatchTransaction(view, getUser, { peutModifierLibrement = () => true, surRefus = () => {} } = {}) {
  return function dispatchTransaction(tr) {
    let finalTr = tr
    if (
      tr.docChanged &&
      isTrackChangesEnabled(view.state) &&
      !tr.getMeta('trackChangesInternal') &&
      !isRemoteOrigin(tr)
    ) {
      const rewritten = rewriteForTracking(view.state, tr, getUser())
      if (!rewritten && !peutModifierLibrement()) {
        surRefus(tr)
        return
      }
      if (rewritten) {
        finalTr = rewritten
        // La transaction d'origine portait la consigne « ramène le curseur
        // dans le champ de vision » — c'est ProseMirror qui la pose sur
        // toute saisie. La réécrite, construite de zéro, ne la porte pas :
        // on écrivait donc sous la barre d'outils, ou sous le clavier, sans
        // que rien ne défile (banc iPhone, 23/09/2026). Défaut présent en
        // suivi de modifications seulement, sur tous les écrans.
        if (tr.scrolledIntoView) finalTr = finalTr.scrollIntoView()
      }
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
    // Une note proposée (insérée ou supprimée) entière : une entrée à part,
    // qui ne se fond jamais avec le texte voisin (`noeud`). Le texte
    // **dans** une note qui n'est pas elle-même en attente est parcouru
    // comme celui d'un paragraphe.
    if (estNoeudSuivi(node)) {
      const suivi = suiviDuNoeud(node)
      if (!suivi || pos < from || pos >= to) return !suivi
      raw.push({
        type: suivi.type,
        noeud: node.type.name,
        from: pos,
        to: pos + node.nodeSize,
        user: suivi.user,
        userColor: suivi.userColor,
        ts: suivi.ts,
        groupe: null,
        text: libelleDuNoeud(node),
      })
      return false
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
          groupe: mark.attrs.groupe || null,
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
  // La dernière entrée de chaque type et auteur : un texte qui porte à la
  // fois une insertion (d'Alice) et une suppression (de Bob) produit des
  // entrées entrelacées — ins, del, ins, del — et chaque moitié doit
  // quand même se recoller à la sienne (29/09/2026).
  const dernieres = new Map()
  for (const c of raw) {
    const cle = `${c.type}|${c.user}`
    const last = dernieres.get(cle)
    if (last && !last.noeud && !c.noeud && last.to === c.from) {
      last.to = c.to
      last.text += c.text
      // Le groupe survit à la fusion : un mot tapé à la suite d'un
      // remplacement en fait partie, il ne le casse pas.
      if (!last.groupe && c.groupe) last.groupe = c.groupe
    } else {
      const copie = { ...c }
      merged.push(copie)
      dernieres.set(cle, copie)
    }
  }
  return merged
}

/** Pairs a merged insertion immediately followed by a merged deletion that
 * share the same non-null `groupe` into one display "remplacement" entry —
 * the panel equivalent of what typing over a selection actually is:
 * swapping one passage for another, not two unrelated changes (see
 * claude/etude-suivi-remplacement.md, projet Amend). Deliberately only
 * pairs adjacent entries: a replacement's insertion always sits
 * immediately before its matching deletion in the document, by
 * construction (see rewriteForTracking/effacementMultiBloc) — no need to
 * search further, and safer not to (two same-`groupe` spans that end up
 * apart, e.g. after other edits nearby, are exactly the case where forcing
 * a pairing would confuse more than it'd help).
 *
 * Underlying document state is untouched by this — it only reshapes the
 * *list* handed to the panel. `change.insertion`/`change.deletion` on the
 * resulting entry keep the two original sub-changes, so acceptChange/
 * rejectChange can still act on each mark independently (whole-group
 * accept/reject, or "traiter séparément" in the panel). A groupe that has
 * lost its other half (that half already accepted/rejected on its own)
 * simply stops pairing — no special-casing needed, the condition below
 * just never matches. */
export function pairReplacements(changes) {
  const out = []
  for (let i = 0; i < changes.length; i++) {
    const a = changes[i]
    const b = changes[i + 1]
    // Deux moitiés d'un même groupe, qui se suivent dans la liste : une
    // insertion et une suppression, dans un ordre ou dans l'autre. La
    // frappe met le nouveau avant l'ancien barré ; une réécriture entière
    // par l'IA met le nouveau paragraphe **après** l'ancien (28/09/2026).
    const paire =
      b && a.groupe && a.groupe === b.groupe && a.type !== b.type && ['insertion', 'deletion'].includes(a.type) && ['insertion', 'deletion'].includes(b.type)
    if (paire) {
      const insertion = a.type === 'insertion' ? a : b
      const deletion = a.type === 'deletion' ? a : b
      out.push({
        type: 'remplacement',
        groupe: a.groupe,
        from: a.from,
        to: b.to,
        user: a.user,
        userColor: a.userColor,
        ts: a.ts,
        ancien: deletion.text,
        nouveau: insertion.text,
        insertion,
        deletion,
      })
      i++ // b est consommée avec a
    } else {
      out.push(a)
    }
  }
  return out
}

/** Lists every tracked change currently in the document, merging adjacent
 * spans from the same author/type for a cleaner "changes" panel, and
 * pairing replacement insertion/deletion pairs into one entry (see
 * pairReplacements). */
export function listChanges(doc) {
  return pairReplacements(mergeAdjacentChanges(scanChangesInRange(doc, 0, doc.content.size)))
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
  if (change.type === 'remplacement') {
    // Accepter le tout : la proposition entre dans le texte (on retire
    // seulement la marque d'insertion) et l'ancien texte barré s'efface
    // pour de bon. La marque retirée d'abord, quelle que soit l'action,
    // parce qu'elle ne change jamais la taille du document — la
    // suppression, elle, en change une, alors elle passe en dernier pour
    // ne jamais invalider les positions de l'autre moitié (voir
    // pairReplacements : l'insertion précède toujours la suppression dans
    // le document, donc l'ordre ici est sans risque dans les deux sens,
    // mais autant garder une seule règle facile à vérifier).
    tr.removeMark(change.insertion.from, change.insertion.to, view.state.schema.marks.insertion)
    retirerTexte(view.state, tr, change.deletion.from, change.deletion.to)
    tr.setMeta('trackChangesInternal', true)
    view.dispatch(tr)
    return
  }
  if (change.type === 'break') {
    // Accepter un saut de paragraphe en attente : juste effacer le
    // marqueur, la coupure elle-même reste (c'est déjà l'état réel du
    // document depuis la frappe/le collage — voir rewriteSplitForTracking).
    const node = view.state.doc.nodeAt(change.from)
    if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, trackedBreak: null })
  } else if (change.noeud) {
    // Une note : accepter son insertion, c'est lever l'attente ; accepter
    // sa suppression, c'est la retirer.
    const node = view.state.doc.nodeAt(change.from)
    if (node && change.type === 'deletion') tr.delete(change.from, change.to)
    else if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, suivi: null })
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
  if (change.type === 'remplacement') {
    // Rejeter le tout : la proposition disparaît (l'insertion est
    // vraiment retirée) et l'ancien texte est restauré (on retire
    // seulement sa marque de suppression). Même règle d'ordre que dans
    // acceptChange ci-dessus.
    tr.removeMark(change.deletion.from, change.deletion.to, view.state.schema.marks.deletion)
    retirerTexte(view.state, tr, change.insertion.from, change.insertion.to)
    tr.setMeta('trackChangesInternal', true)
    view.dispatch(tr)
    return
  }
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
  } else if (change.noeud) {
    // Rejeter l'insertion d'une note, c'est la retirer ; rejeter sa
    // suppression, c'est lever l'attente.
    const node = view.state.doc.nodeAt(change.from)
    if (node && change.type === 'insertion') tr.delete(change.from, change.to)
    else if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, suivi: null })
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
/** …et au moins autant de mots touchés (ajoutés ou retirés). */
const BIG_REWRITE_MIN_MOTS = 4

/** Le nombre de mots que les opérations d'un diff ajoutent ou retirent. */
function motsChanges(ops) {
  let n = 0
  for (const op of ops) {
    if (op.type === 'equal') continue
    n += op.text.split(/\s+/).filter(Boolean).length
  }
  return n
}

/** Replays a word/letter-level diff into `tr` as tracked insert/delete
 * marks anchored at `blockFrom`. Mutates `tr`. Returns true if anything
 * actually changed. */
function replayDiffOps(tr, schema, blockFrom, ops, insMark, delMark, authorMark) {
  let srcPos = blockFrom
  let changed = false
  const insererTexte = (pos, texte, marque) => {
    // Un nœud texte ProseMirror ne contient pas de saut de ligne : au
    // niveau d'un diff fin (quelques mots), un saut venu de la
    // suggestion se lit comme une espace. Le mot inséré prend la mise en
    // forme du texte qu'il remplace ou qui le précède (29/09/2026).
    const miseEnForme = marquesDuDebut(tr.doc, pos).length ? marquesDuDebut(tr.doc, pos) : marquesAvant(tr.doc, pos)
    tr.insert(pos, schema.text(texte.replace(/[\r\n]+/g, ' '), miseEnForme))
    tr.addMark(pos, pos + texte.length, marque)
    if (authorMark) tr.addMark(pos, pos + texte.length, authorMark)
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!op.text) continue
    if (op.type === 'equal') {
      srcPos += op.text.length
      continue
    }
    const suivant = ops[i + 1]
    if (op.type === 'delete' && suivant && suivant.type === 'insert' && suivant.text) {
      // Un mot remplacé par un autre : les deux moitiés partagent un
      // groupe, et le nouveau texte précède l'ancien barré — exactement ce
      // que produit une frappe par-dessus une sélection
      // (rewriteForTracking), et ce que pairReplacements réunit en une
      // seule carte « remplacement ». Signalé par Sylvain le 28/09/2026 :
      // une correction de l'IA faisait toujours deux cartes.
      const groupe = idDeGroupe(insMark.attrs.ts)
      const mFrom = tr.mapping.map(srcPos)
      const mTo = tr.mapping.map(srcPos + op.text.length)
      tr.addMark(mFrom, mTo, delMark.type.create({ ...delMark.attrs, groupe }))
      insererTexte(mFrom, suivant.text, insMark.type.create({ ...insMark.attrs, groupe }))
      srcPos += op.text.length
      changed = true
      i++ // l'insertion est consommée avec la suppression
    } else if (op.type === 'delete') {
      const mFrom = tr.mapping.map(srcPos)
      const mTo = tr.mapping.map(srcPos + op.text.length)
      tr.addMark(mFrom, mTo, delMark)
      srcPos += op.text.length
      changed = true
    } else if (op.type === 'insert') {
      insererTexte(tr.mapping.map(srcPos), op.text, insMark)
      changed = true
    }
  }
  return changed
}

/** Les marques de mise en forme du texte qui finit à `pos`. */
function marquesAvant(doc, pos) {
  const noeud = doc.resolve(pos).nodeBefore
  if (!noeud || !noeud.isText) return []
  return noeud.marks.filter((m) => MARQUES_MISE_EN_FORME.has(m.type.name))
}

/** Les marques de mise en forme du texte qui commence à `pos`. */
function marquesDuDebut(doc, pos) {
  const $pos = doc.resolve(pos)
  const noeud = $pos.nodeAfter
  if (!noeud || !noeud.isText) return []
  return noeud.marks.filter((m) => MARQUES_MISE_EN_FORME.has(m.type.name))
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
function blocsDepuisTexte(schema, nodeType, nodeAttrs, texte, insMark, authorMark, miseEnForme = []) {
  const marks = [...miseEnForme, insMark, ...(authorMark ? [authorMark] : [])]
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

  // Une réécriture entière demande **et** une part suffisante du texte
  // **et** un nombre de mots suffisant (D8 du rapport du 28/09/2026) :
  // « tapis rouge. » → « tapis bleu. » dans une phrase courte touchait 35 %
  // des signes et basculait tout le paragraphe en barré + nouveau.
  const bigRewrite =
    block.fullyCovered &&
    oldText &&
    newText &&
    diffChangeRatio(oldText, newText, ops) >= BIG_REWRITE_RATIO &&
    motsChanges(ops) >= BIG_REWRITE_MIN_MOTS

  if (bigRewrite) {
    // Le nouveau paragraphe reprend la mise en forme du **premier** mot de
    // l'ancien (D5 du rapport du 28/09/2026) : un paragraphe entièrement
    // en gras le reste. Imparfait pour un paragraphe mêlé — le diff mot à
    // mot, lui, garde tout sur les mots inchangés.
    const miseEnForme = marquesDuDebut(tr.doc, block.textFrom)
    let noeuds = blocsDepuisTexte(schema, block.nodeType, block.nodeAttrs, newText, insMark, authorMark, miseEnForme)
    // Un paragraphe réécrit en un paragraphe : un remplacement, une carte
    // (28/09/2026). En plusieurs, on garde une suppression et des
    // insertions séparées — un groupe ne réunit que deux moitiés.
    let marqueSuppression = delMark
    if (noeuds.length === 1 && block.textTo > block.textFrom) {
      const groupe = idDeGroupe(insMark.attrs.ts)
      marqueSuppression = delMark.type.create({ ...delMark.attrs, groupe })
      noeuds = blocsDepuisTexte(
        schema,
        block.nodeType,
        block.nodeAttrs,
        newText,
        insMark.type.create({ ...insMark.attrs, groupe }),
        authorMark,
        miseEnForme
      )
    }
    if (block.textTo > block.textFrom) {
      tr.addMark(tr.mapping.map(block.textFrom), tr.mapping.map(block.textTo), marqueSuppression)
    }
    const insertAt = tr.mapping.map(block.nodeEnd)
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
  // Une réponse vide ne fait rien (D7 du rapport du 28/09/2026) : le
  // serveur la refuse déjà, mais barrer toute la sélection serait le pire
  // des deux comportements.
  if (!String(suggestion || '').trim()) return
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
    if (suggestion == null || !String(suggestion).trim()) continue
    const didChange = applyParagraphDiff(tr, schema, blocks[i], suggestion, insMark, delMark, authorMark)
    changed = changed || didChange
  }

  if (!changed) return
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}
