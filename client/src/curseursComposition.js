// Curseurs des autres personnes masqués pendant une composition (touche morte,
// méthode de saisie) — écart 6 de la campagne de tests du 02/11/2026
// (docs/ecarts-editeur.md, docs/diagnostic-editeur-2026-11-02.md, D.6).
//
// y-prosemirror dessine le curseur d'une autre personne comme un élément non
// modifiable inséré dans le texte (`Decoration.widget`, voir buildCursor dans
// editor.js). Quand une sélection commence juste contre cet élément et qu'on
// tape une touche morte (^ puis e → ê, clavier français de Mac), la
// composition du navigateur ne retrouve plus son texte : le « ^ » reste, ou
// le texte est doublé, et ProseMirror, qui croit la composition toujours en
// cours, ignore ensuite toute frappe jusqu'au rechargement — en suivi comme
// hors suivi.
//
// Le remède : pendant une composition, ne dessiner aucun curseur distant.
// Ils disparaissent le temps d'une lettre accentuée et reviennent aussitôt.

import { Plugin } from 'prosemirror-state'
import { yCursorPluginKey } from 'y-prosemirror'
import { noterComposition } from './suivi/composition.js'

/**
 * `filtre` se passe à `yCursorPlugin(…, { awarenessStateFilter: filtre })` ;
 * `greffon` se place dans la liste des greffons de l'éditeur.
 */
export function curseursPendantComposition() {
  let composition = false
  // Même règle que le filtre par défaut de y-prosemirror (on ne dessine pas
  // son propre curseur), plus : rien pendant une composition.
  const filtre = (clientLocal, clientDistant) => clientLocal !== clientDistant && !composition
  const redessiner = (view) => {
    if (view.isDestroyed) return
    view.dispatch(view.state.tr.setMeta(yCursorPluginKey, { awarenessUpdated: true }))
  }
  const greffon = new Plugin({
    props: {
      handleDOMEvents: {
        // Avant que le navigateur ne touche au texte : les curseurs distants
        // quittent le DOM, la composition se fait sur du texte seul.
        compositionstart(view) {
          noterComposition(true)
          if (!composition) {
            composition = true
            redessiner(view)
          }
          return false
        },
        // Après coup, quand ProseMirror a fini de lire la composition.
        compositionend(view) {
          composition = false
          noterComposition(false)
          setTimeout(() => redessiner(view), 0)
          return false
        },
      },
    },
  })
  return { filtre, greffon, enComposition: () => composition }
}
