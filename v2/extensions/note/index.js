// Extension de BlockNote (couche 3) : la note de bas de page (Sylvain,
// 12/11/2026, docs/v2-notes-plan.md). Un élément en ligne sans contenu
// éditable, comme les mentions de Docs : l'appel de note, posé dans la phrase,
// qui porte le texte de la note en attribut (`texte`, texte simple). Le texte
// voyage donc avec le document (collaboration, historique, suggestions,
// exports). Le numéro n'est jamais enregistré : le design le calcule à
// l'affichage, dans l'ordre du texte.
//
// À l'écran : un `<sup data-amend-note>` vide (le numéro vient du design),
// sans classe ni style (règle 19). Un clic émet l'évènement `amend-note`
// (qui remonte), avec le texte, et de quoi le modifier ou retirer la note :
// l'adaptateur ouvre la fenêtre. Au collage, un appel copié depuis amend.ink
// redevient une note.
import { createInlineContentSpec } from '@blocknote/core'

export const TYPE_NOTE = 'note'
export const EVENEMENT_NOTE = 'amend-note'

export const elementNote = createInlineContentSpec(
  { type: TYPE_NOTE, propSchema: { texte: { default: '' } }, content: 'none' },
  {
    render(note, modifier, editeur, noeud, position) {
      const appel = document.createElement('sup')
      appel.setAttribute('data-amend-note', '')
      appel.setAttribute('data-texte', note.props.texte)
      appel.setAttribute('role', 'button')
      appel.setAttribute('tabindex', '-1')
      const libelle = editeur.dictionary?.amend?.note?.appel
      if (libelle) appel.setAttribute('aria-label', libelle)
      appel.addEventListener('mousedown', (e) => e.preventDefault())
      appel.addEventListener('click', (e) => {
        e.preventDefault()
        appel.dispatchEvent(
          new CustomEvent(EVENEMENT_NOTE, {
            bubbles: true,
            detail: {
              texte: note.props.texte,
              modifier: (texte) => modifier({ type: TYPE_NOTE, props: { texte } }),
              retirer: () => {
                const p = position()
                if (p === undefined) return
                editeur.transact((tr) => tr.delete(p, p + noeud.nodeSize))
              },
            },
          }),
        )
      })
      return { dom: appel }
    },
    parse: (el) => (el.hasAttribute('data-amend-note') ? { texte: el.getAttribute('data-texte') ?? '' } : undefined),
  },
)
