// L'écriture et l'ouverture des commentaires au doigt (point 23 de la feuille
// de route, 13/10/2026 : sorties de `mountEditor`). Ce qui ne marche qu'avec un
// petit écran : un commentaire s'écrit dans une feuille modale, toucher un
// passage commenté ouvre son fil.

import { TextSelection, Plugin } from 'prosemirror-state'
import { addComment, commentaireAuPoint } from './comments.js'
import { ouvrirFeuille, petitEcran } from './feuille.js'
import { ouvrirFilCommentaire } from './relectureTactile.js'

/** Écrire un commentaire sur la sélection, en feuille. Modale, celle-ci :
 * on est en train d'écrire, il n'y a rien d'autre à faire. */
export function ouvrirComposeurTactile({ view, ydoc, commentsMap, user }) {
  const selection = view.state.selection
  if (selection.empty) return
  const feuille = ouvrirFeuille('Nouveau commentaire', { hauteur: 0.4, modale: true })
  const forme = document.createElement('form')
  forme.className = 'feuille-repondre'
  const zone = document.createElement('textarea')
  zone.rows = 3
  zone.placeholder = 'Votre commentaire…'
  zone.setAttribute('aria-label', 'Votre commentaire')
  zone.name = 'commentaire'
  const envoyer = document.createElement('button')
  envoyer.type = 'submit'
  envoyer.className = 'btn-accept'
  envoyer.textContent = 'Commenter'
  forme.append(zone, envoyer)
  forme.onsubmit = (e) => {
    e.preventDefault()
    if (!zone.value.trim()) return
    // La sélection a pu bouger pendant qu'on écrivait (quelqu'un d'autre
    // édite) : on la repose telle qu'elle était au moment du geste.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selection.from, selection.to)))
    addComment(view, ydoc, commentsMap, user, zone.value.trim())
    feuille.fermer()
  }
  feuille.corps.appendChild(forme)
  zone.focus()
}

/** Le greffon du petit écran : il ne décide rien, il relie. `surMiseAJour`
 * est appelé à chaque changement d'état (la barre de relecture et le bouton
 * « Commenter » s'y remettent à jour). */
export function tactilePlugin({ ydoc, commentsMap, user, surMiseAJour }) {
  return new Plugin({
    props: {
      handleClick(vue, pos) {
        if (!petitEcran()) return false
        const id = commentaireAuPoint(vue.state, ydoc, commentsMap, pos)
        if (!id) return false
        // On n'empêche pas le curseur de se poser : on ouvre **en plus**.
        // Refuser le clic laisserait le doigt sans effet visible dans le
        // texte, ce qui se sent comme un raté.
        setTimeout(() => ouvrirFilCommentaire(vue, ydoc, commentsMap, user, id), 0)
        return false
      },
    },
    view() {
      return {
        update() {
          surMiseAJour()
        },
      }
    },
  })
}
