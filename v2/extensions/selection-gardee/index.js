// Extension de BlockNote (couche 3) : la sélection reste visible quand l'éditeur
// perd le focus (Sylvain, 17/11/2026). Le navigateur efface la sélection du
// texte dès que le focus passe dans un champ d'une autre partie de la page
// (la demande à Margo, un commentaire) : la personne ne voit plus sur quoi
// porte sa demande. Tant que l'éditeur n'a pas le focus, l'extension
// inscrit la sélection étendue auprès de l'API CSS « Custom Highlight »
// (`CSS.highlights`) sous le nom `NOM` ; l'apparence est définie dans
// `design/` (réglage `css.editeur.selectionGardee`, pseudo-élément
// `::highlight(amend-selection)`). Le texte et le document ne sont pas touchés :
// aucune décoration, donc aucun import de `prosemirror-view`. Sans l'API
// (navigateur ancien), rien ne s'affiche de plus : pas de dégradation du texte.
// Écrite comme si elle devait partir en amont : BlockNote et ProseMirror seulement.
import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'

export const NOM = 'amend-selection'

const disponible = () => typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined'

/** Efface l'inscription (focus revenu, sélection vide ou éditeur détruit). */
const effacer = () => {
  if (disponible()) CSS.highlights.delete(NOM)
}

/**
 * Inscrit la sélection de `vue` quand elle est étendue et que l'éditeur n'a pas
 * le focus ; l'efface sinon.
 * @param {import('prosemirror-view').EditorView} vue
 */
export function montrer(vue) {
  if (!disponible()) return
  const { from, to, empty } = vue.state.selection
  if (empty || vue.hasFocus()) return effacer()
  try {
    const debut = vue.domAtPos(from)
    const fin = vue.domAtPos(to)
    const plage = new Range()
    plage.setStart(debut.node, debut.offset)
    plage.setEnd(fin.node, fin.offset)
    CSS.highlights.set(NOM, new Highlight(plage))
  } catch {
    // Position hors du document affiché (changement en cours) : rien à montrer.
    effacer()
  }
}

export const extensionSelectionGardee = createExtension(() => ({
  key: 'selectionGardee',
  prosemirrorPlugins: [
    new Plugin({
      view: (vue) => {
        const surFocus = () => effacer()
        const surPerte = () => montrer(vue)
        vue.dom.addEventListener('focus', surFocus)
        vue.dom.addEventListener('blur', surPerte)
        return {
          // Le texte ou la sélection changent : la mise à jour se fait hors focus
          // (une autre personne écrit), la plage doit suivre.
          update: () => montrer(vue),
          destroy: () => {
            vue.dom.removeEventListener('focus', surFocus)
            vue.dom.removeEventListener('blur', surPerte)
            effacer()
          },
        }
      },
    }),
  ],
}))
