// Cases à cocher : le clic sur la case bascule l'élément (15/09/2026).
// La case elle-même est un <span contenteditable="false"> produit par
// schema.js ; c'est le seul endroit qui la rende interactive, et le barré du
// texte vient du sélecteur CSS [data-checked="true"] — rien n'est stocké en
// double dans le document.

import { Plugin } from 'prosemirror-state'

export function taskListPlugin(schema) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const case_ = event.target.closest?.('.tache-case')
          if (!case_ || !view.dom.contains(case_)) return false
          const li = case_.closest('li')
          if (!li) return false
          const pos = view.posAtDOM(li, 0)
          const $pos = view.state.doc.resolve(pos)
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d)
            if (node.type !== schema.nodes.task_item) continue
            // Cocher est un changement d'attribut, pas de texte : comme les
            // niveaux de titre, il reste hors du suivi des modifications
            // (voir l'en-tête de schema.js).
            view.dispatch(
              view.state.tr
                .setNodeMarkup($pos.before(d), undefined, { ...node.attrs, checked: !node.attrs.checked })
                .setMeta('trackChangesInternal', true)
            )
            event.preventDefault()
            return true
          }
          return false
        },
      },
    },
  })
}
