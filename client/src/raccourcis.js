// Les raccourcis clavier de l'éditeur (point 23 de la feuille de route,
// 13/10/2026 : sortis de `mountEditor`). Un seul greffon `keymap`, placé avant
// `baseKeymap` : ce qui n'est pas pris ici passe la main au comportement de
// base.

import { keymap } from 'prosemirror-keymap'
import { toggleMark, chainCommands } from 'prosemirror-commands'
import { splitListItem } from 'prosemirror-schema-list'
import { undo, redo } from 'y-prosemirror'
import { goToNextCell } from 'prosemirror-tables'
import { schema } from './schema.js'
import { augmenterRetrait, reduireRetrait } from './commandesBarre.js'
import { effacementSuivi } from './trackChanges.js'
import { insererNote } from './footnotes.js'
import { commandeLien } from './liens.js'

/**
 * @param {object} options
 * @param {object} options.user                 la personne qui écrit (nom et couleur des modifications)
 * @param {() => boolean} options.peutPoserLien
 * @param {() => void} options.surRefusLien
 */
export function raccourcisClavier({ user, peutPoserLien, surRefusLien }) {
  return keymap({
    // Retour arrière et Suppr sont pris en charge ici, **avant** le
    // comportement natif du navigateur : le suivi des modifications
    // garde à l'écran du texte que le navigateur croit effacé, et lui
    // laisser la main finissait par lui faire insérer une espace
    // parasite quand on maintenait la touche enfoncée. Hors suivi, ou
    // en début de bloc (où c'est une fusion et non un effacement), ces
    // commandes passent la main à baseKeymap comme avant.
    Backspace: effacementSuivi(() => user, true),
    Delete: effacementSuivi(() => user, false),
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,
    'Mod-b': toggleMark(schema.marks.strong),
    'Mod-i': toggleMark(schema.marks.em),
    'Mod-u': toggleMark(schema.marks.underline),
    'Mod-Alt-f': (state, dispatch, v) => insererNote(v, user),
    'Mod-k': commandeLien({ peutPoser: peutPoserLien, surRefus: surRefusLien }),
    // Falls through to the plain Enter/baseKeymap handling below
    // whenever the cursor isn't inside a list item.
    // Les trois familles de liste partagent les mêmes gestes : la
    // première commande qui s'applique gagne, les autres passent la main
    // (et finalement baseKeymap, hors liste).
    Enter: chainCommands(splitListItem(schema.nodes.list_item), splitListItem(schema.nodes.task_item)),
    'Mod-]': augmenterRetrait,
    'Mod-[': reduireRetrait,
    // Tab circule de cellule en cellule ; dans une liste, il descend d'un
    // niveau (Maj+Tab remonte) ; ailleurs il ne fait rien (le retour `false`
    // laisse le navigateur gérer la tabulation normale). La cellule passe
    // avant : un tableau posé dans un élément de liste garde ses Tab.
    Tab: chainCommands(goToNextCell(1), augmenterRetrait),
    'Shift-Tab': chainCommands(goToNextCell(-1), reduireRetrait),
  })
}
