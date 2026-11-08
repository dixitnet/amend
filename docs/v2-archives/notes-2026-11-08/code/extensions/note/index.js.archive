// Extension de BlockNote (couche 3) : la note de bas de page, en contenu en
// ligne à texte riche (modèle a, décision de Sylvain, étape 4). La note vit à
// l'endroit de son appel : copier, couper, déplacer l'emportent, et elle se
// modifie à plusieurs comme le reste du texte. Son numéro n'est jamais stocké :
// l'affichage le calcule (design).
//
// Affichage B (décision de Sylvain) : seul l'appel se voit ; le texte de la
// note s'ouvre quand le curseur y entre. L'extension ne pose que des attributs
// sémantiques (`data-note`, `data-note-texte`, `data-ouverte`) ; l'apparence
// est dans la couche design.
// Écrite comme si elle devait partir en amont : elle ne dépend que de BlockNote
// et de ProseMirror.
import { createInlineContentSpec, createExtension } from '@blocknote/core'
import { TextSelection } from 'prosemirror-state'

export const TYPE_NOTE = 'note'

/** La note est-elle sous le curseur ? (`getPos` : sa position dans le document)
 * Lu dans l'état courant : appelé au changement de sélection, peut-être au
 * milieu d'une transaction dont on ne doit pas lire l'état d'avant. */
function curseurDans(editor, getPos) {
  const { doc, selection } = editor.prosemirrorState
  const pos = getPos()
  const noeud = pos === undefined ? null : doc.nodeAt(pos)
  if (!noeud) return false
  return selection.from > pos && selection.to < pos + noeud.nodeSize
}

/**
 * Les flèches aux bords d'une note. Le texte d'une note repliée est caché :
 * le navigateur ne sait ni y entrer ni en sortir proprement. On place donc le
 * curseur nous-mêmes : entrer dans la note par son bord, en sortir par l'autre.
 * @param {1 | -1} sens  1 : vers la droite ; -1 : vers la gauche
 */
const fleche =
  (sens) =>
  ({ editor }) =>
    editor.transact((tr) => {
      const { selection } = tr
      if (!selection.empty) return false
      const $c = selection.$from
      const dans = $c.parent.type.name === TYPE_NOTE
      let cible = null
      if (dans && sens === 1 && $c.parentOffset === $c.parent.content.size) cible = $c.after()
      else if (dans && sens === -1 && $c.parentOffset === 0) cible = $c.before()
      else if (!dans && sens === 1 && $c.nodeAfter?.type.name === TYPE_NOTE) cible = $c.pos + 1
      else if (!dans && sens === -1 && $c.nodeBefore?.type.name === TYPE_NOTE) cible = $c.pos - 1
      if (cible === null) return false
      tr.setSelection(TextSelection.create(tr.doc, cible))
      return true
    })

/** Les flèches aux bords des notes : à donner à l'éditeur avec le schéma. */
export const extensionNote = createExtension({
  key: 'note-fleches',
  keyboardShortcuts: { ArrowRight: fleche(1), ArrowLeft: fleche(-1) },
})

export const specNote = createInlineContentSpec(
  { type: TYPE_NOTE, propSchema: {}, content: 'styled' },
  {
    render(note, maj, editor, noeud, getPos) {
      const dom = document.createElement('span')
      dom.setAttribute('data-note', '')
      const contentDOM = document.createElement('span')
      contentDOM.setAttribute('data-note-texte', '')
      // Des bornes non modifiables aux deux bouts de la note : sans elles, le
      // navigateur prolonge le texte voisin (dans la note, ou hors d'elle)
      // quand on tape à la frontière.
      const borne = () => Object.assign(document.createElement('span'), { contentEditable: 'false' })
      dom.append(borne(), contentDOM, borne())
      // Hors de l'éditeur (export HTML), getPos ne rend rien : pas d'ouverture.
      if (getPos() === undefined) return { dom, contentDOM }
      const suivre = () => dom.toggleAttribute('data-ouverte', curseurDans(editor, getPos))
      const arreter = editor.onSelectionChange(suivre)
      suivre()
      return { dom, contentDOM, destroy: arreter }
    },
  },
)

/** Insère une note vide au curseur, et y place le curseur. */
export function insererNote(editor) {
  editor.transact((tr) => {
    const pos = tr.selection.from
    tr.replaceSelectionWith(tr.doc.type.schema.nodes[TYPE_NOTE].create(), false)
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  })
}

/**
 * Les notes d'un document, dans l'ordre du texte (celui de leur numéro) :
 * pour chacune, ses morceaux de texte et leurs styles.
 * @returns {Array<Array<{ texte: string, styles: Record<string, boolean> }>>}
 */
export function notesDuDocument(blocs) {
  const notes = []
  const contenu = (liste) => {
    for (const c of liste || [])
      if (c.type === TYPE_NOTE) notes.push(c.content.map((t) => ({ texte: t.text, styles: t.styles })))
  }
  const parcourir = (blocs) => {
    for (const b of blocs) {
      if (Array.isArray(b.content)) contenu(b.content)
      else if (b.content?.type === 'tableContent')
        for (const ligne of b.content.rows) for (const cellule of ligne.cells) contenu(cellule.content ?? cellule)
      parcourir(b.children || [])
    }
  }
  parcourir(blocs)
  return notes
}
