// Le retour à la ligne (Maj+Entrée) — 20/10/2026.
//
// Un `hard_break` existait déjà dans le schéma (collage, IA, import) mais
// aucune touche ne le posait : Maj+Entrée « ne faisait rien » dans le
// navigateur. Cette commande le pose, dans un paragraphe comme dans un
// titre, en suivi ou non.
//
// **Une espace avant le saut** quand la lettre qui précède n'en est pas
// une : le plan, l'en-tête courant, le sommaire, la recherche et l'IA lisent
// un saut comme une espace, mais tout autre lecteur du texte (l'export
// Markdown, un copier-coller en texte brut, un correcteur) recollerait
// « titre » et « suite » en « titresuite ». L'espace finale est invisible en
// fin de ligne, à l'écran comme dans le PDF.
//
// En suivi, le saut est un nœud suivi entier (`suivi` : insertion) et
// l'espace un texte inséré au nom de l'auteur — les deux se refusent ou
// s'acceptent ensemble (même ts), le panneau les présente séparément.

import { TextSelection } from 'prosemirror-state'
import { isTrackChangesEnabled } from './suivi/etat.js'
import { markRangeForTrackedDeletion, marquesDeMiseEnForme } from './suivi/reecriture.js'

/** Le caractère visible juste avant `pos` dans son bloc, ou '' au début du
 * bloc ou après un autre nœud (saut, note : on n'y ajoute rien). */
function caractereAvant(doc, pos) {
  const avant = doc.resolve(pos).nodeBefore
  return avant && avant.isText ? avant.text.slice(-1) : ''
}

function caractereApres(doc, pos) {
  const apres = doc.resolve(pos).nodeAfter
  return apres && apres.isText ? apres.text.slice(0, 1) : ''
}

/** Faut-il une espace entre ce qui précède et le saut ? Oui quand un mot le
 * précède et que rien ne l'en sépare déjà — ni à gauche, ni à droite (une
 * espace qui suit le curseur ferait sinon une ligne qui commence par un
 * blanc). */
function besoinDUneEspace(doc, pos) {
  const avant = caractereAvant(doc, pos)
  if (!avant || /\s/.test(avant)) return false
  return !/\s/.test(caractereApres(doc, pos))
}

/**
 * @param {() => {name: string, color: string}} getUser
 * @returns commande ProseMirror `(state, dispatch) => boolean`
 */
export function insererSautDeLigne(getUser) {
  return (state, dispatch) => {
    const type = state.schema.nodes.hard_break
    if (!type) return false
    const { $from, $to, empty } = state.selection
    // Une image sélectionnée, ou une sélection de cellules : ce n'est pas notre affaire.
    if (!(state.selection instanceof TextSelection)) return false
    if (!$from.parent.inlineContent) return false
    // Une sélection qui traverse plusieurs blocs : on ne fait rien (la prise
    // en charge de Maj+Entrée restant à nous, le navigateur ne doit pas
    // improviser sur un document partagé).
    if (!empty && !$to.sameParent($from)) return true
    if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) return true
    if (!dispatch) return true

    const suivi = isTrackChangesEnabled(state)
    const user = getUser()
    const tr = state.tr
    let pos = $from.pos
    const ts = Date.now()

    if (!empty) {
      if (suivi) {
        // Même règle que pour une frappe par-dessus une sélection : l'ancien
        // passage reste barré, le nouveau vient après.
        const delMark = state.schema.marks.deletion.create({ user: user.name, userColor: user.color, ts, groupe: null })
        markRangeForTrackedDeletion(state, tr, $from.pos, $to.pos, delMark)
        pos = tr.mapping.map($to.pos)
      } else {
        tr.delete($from.pos, $to.pos)
      }
    }

    const marquesTexte = marquesDeMiseEnForme(state)
    if (besoinDUneEspace(tr.doc, pos)) {
      const espace = state.schema.text(' ', marquesTexte)
      tr.insert(pos, espace)
      if (suivi) {
        tr.addMark(
          pos,
          pos + 1,
          state.schema.marks.insertion.create({ user: user.name, userColor: user.color, ts, groupe: null })
        )
        const auteur = state.schema.marks.authorColor?.create({ user: user.name, userColor: user.color })
        if (auteur) tr.addMark(pos, pos + 1, auteur)
      }
      pos += 1
    }

    tr.insert(
      pos,
      type.create({ suivi: suivi ? { type: 'insertion', user: user.name, userColor: user.color, ts } : null })
    )
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    // Le saut porte lui-même sa proposition : le suivi ne réécrit pas cette
    // transaction (voir insererNote, footnotes.js).
    tr.setMeta('trackChangesInternal', true)
    dispatch(tr.scrollIntoView())
    return true
  }
}
