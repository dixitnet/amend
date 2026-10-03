// Les compteurs de relecture du bandeau (03/10/2026) : « 12 ✏️, » pour les
// modifications en attente, « 5 💬, » pour les passages commentés.
//
// Même geste que le compteur des « !! » (tkMarker.js) : un clic mène au
// suivant, dans l'ordre du document, en boucle, et sélectionne le passage
// en le centrant à l'écran. On mémorise la **position** du dernier passage
// visité plutôt qu'un rang — le document bouge entre deux clics, et une
// position retrouve « le suivant » même si des éléments ont été ajoutés ou
// retirés entre-temps.
//
// Les nombres sont ceux que les panneaux affichent déjà : une carte de
// modification (un lot de Claude n'en fait qu'une, voir
// modificationsAffichees) et un fil de commentaires (réponses exclues).

import { Plugin, TextSelection } from 'prosemirror-state'
import { changesKey, modificationsAffichees } from './changesPanel.js'
import { commentairesAncres, resolveCommentRange } from './comments.js'
import { defilerVers } from './defilement.js'
import { throttle } from './throttle.js'

const RENDER_INTERVAL_MS = 500

/** Le premier élément (triés par `from`) qui commence après `position`, ou
 * le premier de la liste quand on est au bout : on reboucle. */
export function suivantApres(elements, position) {
  return elements.find((e) => e.from > position) || elements[0] || null
}

/** Les modifications en attente, dans l'ordre du document. */
export function modificationsDuDocument(state) {
  const raw = changesKey.getState(state)?.raw ?? []
  return modificationsAffichees(raw)
    .map((c) => ({ from: c.from, to: c.to }))
    .sort((a, b) => a.from - b.from)
}

/** Les passages commentés (un par fil), dans l'ordre du document. Un
 * commentaire dont le passage a disparu n'est pas compté : la marge ne le
 * dessine pas non plus. */
export function commentairesDuDocument(state, ydoc, commentsMap) {
  const out = []
  for (const [id, commentaire] of commentairesAncres(commentsMap)) {
    const range = resolveCommentRange(state, ydoc, commentaire)
    if (range && range.to > range.from) out.push({ id, from: range.from, to: range.to })
  }
  return out.sort((a, b) => a.from - b.from)
}

/**
 * Monte les deux compteurs. `elements.modifications` et `elements.commentaires`
 * sont des éléments du bandeau ; l'un ou l'autre peut manquer (le compteur
 * de modifications ne sert à rien à qui ne peut pas les relire).
 */
export function mountCompteursRelecture({ modifications, commentaires }, { ydoc, commentsMap }) {
  let view = null
  let dernieresModifs = -1
  let derniersComms = -1
  let positionModif = -1
  let positionComm = -1

  function aller(liste, position, etablir) {
    if (!view || !liste.length) return
    const cible = suivantApres(liste, position)
    etablir(cible.from)
    const { state, dispatch } = view
    const taille = state.doc.content.size
    const de = Math.min(cible.from, taille)
    const a = Math.min(Math.max(cible.to, de), taille)
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, de, a)))
    view.focus()
    defilerVers(view, de, { fraction: 0.5 })
  }

  if (modifications) {
    modifications.addEventListener('click', () =>
      aller(modificationsDuDocument(view.state), positionModif, (p) => (positionModif = p))
    )
  }
  if (commentaires) {
    commentaires.addEventListener('click', () =>
      aller(commentairesDuDocument(view.state, ydoc, commentsMap), positionComm, (p) => (positionComm = p))
    )
  }

  function peindre(el, n, picto, un, plusieurs, action) {
    el.textContent = n > 0 ? `${n} ${picto},` : ''
    el.classList.toggle('cliquable', n > 0)
    el.title = n > 0 ? `${n} ${n > 1 ? plusieurs : un} — cliquer pour aller ${action}` : ''
  }

  function render() {
    if (!view) return
    if (modifications) {
      const n = modificationsDuDocument(view.state).length
      if (n !== dernieresModifs) {
        dernieresModifs = n
        peindre(modifications, n, '✏️', 'modification en attente', 'modifications en attente', 'à la suivante')
      }
    }
    if (commentaires) {
      const n = commentairesDuDocument(view.state, ydoc, commentsMap).length
      if (n !== derniersComms) {
        derniersComms = n
        peindre(commentaires, n, '💬', 'passage commenté', 'passages commentés', 'au suivant')
      }
    }
  }

  const rendreSouvent = throttle(render, RENDER_INTERVAL_MS)

  return new Plugin({
    view(editorView) {
      view = editorView
      const surCommentaires = () => rendreSouvent()
      commentsMap.observe(surCommentaires)
      render() // premier tracé sans attendre
      return {
        update: () => rendreSouvent(),
        destroy: () => {
          commentsMap.unobserve(surCommentaires)
          view = null
        },
      }
    },
  })
}
