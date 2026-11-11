// Extension de BlockNote (couche 3) : les limites du mode Suggérer, contournements
// temporaires de défauts des fondations (veille ; Sylvain, 11/11/2026). Tant
// qu'elle est active (`actif()`), elle refuse :
//  - une suppression qui franchit la fin d'un paragraphe (sélection à cheval,
//    Retour arrière en début de paragraphe, Suppr en fin) : `@y/prosemirror`
//    l'enregistre comme une fusion sans noter le texte supprimé, et l'accepter
//    donne un texte faux ;
//  - la mise en forme (gras, italique, souligné, barré) : une suggestion de
//    mise en forme n'est ni appliquée ni listée, donc pas arbitrable.
// Chaque refus appelle `refuser(code)` pour que l'application le dise. À
// retirer quand les fondations traitent ces cas (scénarios H20, B6).
// Écrite comme si elle devait partir en amont : BlockNote et ProseMirror seulement.
import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'

export const A_CHEVAL = 'suggestion-a-cheval'
export const MISE_EN_FORME = 'suggestion-mise-en-forme'

/** La sélection franchit-elle la limite d'un paragraphe ? */
export function aCheval(selection) {
  return !selection.empty && !selection.$from.sameParent(selection.$to)
}

/** Retour arrière (`arriere`) ou Suppr (`avant`) fusionnerait-il deux paragraphes ? */
export function fusionnerait(selection, sens) {
  if (!selection.empty) return aCheval(selection)
  const $p = selection.$from
  if (!$p.parent.isTextblock) return false
  return sens === 'arriere' ? $p.parentOffset === 0 : $p.parentOffset === $p.parent.content.size
}

export const extensionLimitesDuSuivi = createExtension(({ options }) => {
  const actif = options.actif ?? (() => false)
  const refuser = options.refuser ?? (() => {})
  const non = (code) => (refuser(code), true)
  const suppression =
    (sens) =>
    ({ editor }) =>
      actif() && editor.transact((tr) => fusionnerait(tr.selection, sens)) ? non(A_CHEVAL) : false
  const forme = () => (actif() ? non(MISE_EN_FORME) : false)
  return {
    key: 'limitesDuSuivi',
    keyboardShortcuts: {
      Backspace: suppression('arriere'),
      'Mod-Backspace': suppression('arriere'),
      Delete: suppression('avant'),
      'Mod-Delete': suppression('avant'),
      // Entrée sur une sélection à cheval la supprime d'abord.
      Enter: ({ editor }) => (actif() && editor.transact((tr) => aCheval(tr.selection)) ? non(A_CHEVAL) : false),
      'Mod-b': forme,
      'Mod-i': forme,
      'Mod-u': forme,
      'Mod-Shift-s': forme,
      'Mod-Shift-x': forme,
    },
    prosemirrorPlugins: [
      new Plugin({
        props: {
          // Taper ou couper sur une sélection à cheval la supprime aussi.
          handleTextInput: (vue) => (actif() && aCheval(vue.state.selection) ? non(A_CHEVAL) : false),
          handlePaste: (vue) => (actif() && aCheval(vue.state.selection) ? non(A_CHEVAL) : false),
          handleDOMEvents: {
            cut: (vue, evenement) => {
              if (!actif() || !aCheval(vue.state.selection)) return false
              evenement.preventDefault()
              return non(A_CHEVAL)
            },
          },
        },
      }),
    ],
  }
})
