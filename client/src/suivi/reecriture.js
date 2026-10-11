// Suivi des modifications — la réécriture : une transaction ordinaire devient une transaction suivie (insertions et suppressions marquées au nom de l'auteur).
// (Découpé de l'ancien `trackChanges.js`, 1 630 lignes — audit du 10/10/2026, C11.
// `../trackChanges.js` réexporte tout : aucun import à changer.)

import { TextSelection } from 'prosemirror-state'
import { estNoeudSuivi, idDeGroupe, suiviDuNoeud } from './etat.js'

export function markRangeForTrackedDeletion(state, tr, from, to, delMark) {
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
  // Le nombre de morceaux (texte ou nœud) que la sélection contenait —
  // zéro pour une sélection qui ne couvre que des bords de blocs.
  return ranges.length
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
export function dansUnSeulBloc(state, from, to) {
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

  const morceaux = cibleTo > cibleFrom ? markRangeForTrackedDeletion(state, out, cibleFrom, cibleTo, delMark) : 0

  // Position du curseur une fois la frappe appliquée — calculée au moment
  // où l'on insère, pas après coup : `mapping.map(from)` rejoué à la fin
  // reporte la position *au-delà* de l'insertion, et le curseur atterrit
  // dans le texte barré (deux lettres sur trois entrelacées, constaté au
  // banc d'essai).
  let curseur = null

  if (slice.size > 0) {
    // Taper par-dessus une sélection : l'ancien passage reste barré, le
    // nouveau texte vient **après lui** (choix de Sylvain, 09/10/2026, comme
    // Google Docs et Word : « ancien barré, puis nouveau »). Avant, le
    // nouveau texte se plaçait devant et les deux se touchaient en une seule
    // chaîne illisible (« banaleordinaire »). Sans sélection (frappe au
    // curseur, rien de barré), cibleFrom et cibleTo sont confondus : rien ne
    // change.
    const insPos = out.mapping.map(cibleTo)
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
    // Touche d'effacement : le curseur se pose du côté vers lequel on
    // efface (voir plus haut). Sélection effacée d'un coup : **après** le
    // passage barré (09/10/2026, avec l'ordre « ancien barré, puis nouveau »
    // : effacer puis taper doit donner ce que taper par-dessus donne).
    curseur = out.mapping.map(effacement ? (versLArriere ? cibleFrom : cibleTo) : cibleTo)
  }

  // Une réécriture qui ne produit aucun pas ne doit **jamais** renvoyer
  // `null` quand il s'agissait d'un effacement : l'appelant appliquerait
  // alors la suppression d'origine, telle quelle, hors suivi.
  //
  // Même chose pour une sélection **déjà barrée** qu'on efface ou qu'on
  // remplace par rien : il n'y a aucun pas à faire (la marque est déjà
  // là — et si l'instant est le même, addMark ne produit rien), mais
  // laisser passer la suppression d'origine retirerait le texte pour de
  // bon. Trouvé par un test qui n'échouait qu'une fois sur trois (29/09).
  // Une sélection qui ne couvre que des bords de blocs (une fusion) n'a
  // rien à barrer : elle passe la main, hors suivi, comme avant.
  if (out.steps.length === 0) {
    if (effacement) return seulementLeCurseur(state, versLArriere ? cibleFrom : cibleTo)
    if (morceaux > 0) return seulementLeCurseur(state, cibleFrom)
    return null
  }
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
  // Texte tapé par-dessus une sélection : le plugin des commentaires doit
  // garder le passage commenté sur l'ancien texte barré (voir estRemplacement).
  if (groupe) out.setMeta('remplacementFrappe', true)
  return out
}

/** Une position où l'on peut réellement poser un curseur de texte. */
function positionUtilisable(doc, pos) {
  if (pos < 0 || pos > doc.content.size) return false
  return doc.resolve(pos).parent.inlineContent
}
