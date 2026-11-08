// Extension de BlockNote (couche 3) : la typographie française à la frappe et
// au collage. Les règles sont dans le domaine (domaine/typographie.js) ; cette
// extension ne fait que les brancher sur les points d'extension publics de
// BlockNote, avec le module de règles de saisie que BlockNote utilise
// lui-même (règle 1 révisée, 08/11/2026). Aucune interface, aucun réglage.
//
//  - Frappe : `' " . ; : ! ?` prennent leur forme typographique au moment où
//    on les tape ; un Retour arrière juste après rend ce qui a été tapé.
//  - Collage : le texte collé entre typographié, et en NFC (accents en un
//    seul signe). Le texte d'un lien (une adresse) n'est pas touché.
// Écrite comme si elle devait partir en amont : elle ne dépend que de
// BlockNote, de ProseMirror et des règles du domaine.
import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'
import { Fragment, Slice } from 'prosemirror-model'
import { InputRule, inputRules } from '@handlewithcare/prosemirror-inputrules'
import { typographier, saisie } from '../../domaine/index.js'

const OBJET = '\uFFFC' // un nœud qui n'est pas du texte, dans le texte d'un bloc

/** La règle de frappe : un des signes concernés, juste tapé. */
function regleDeFrappe(langue) {
  return new InputRule(/['".;:!?]$/, (state, match, start, end) => {
    const $debut = state.doc.resolve(start)
    const avant = $debut.parent.textBetween(0, $debut.parentOffset, undefined, OBJET)
    const r = saisie(avant, match[0], { langue })
    if (!r) return null
    return state.tr.insertText(r.ecrire, start - r.retirer, end)
  })
}

/** Le contenu collé, typographié bloc par bloc. */
export function typographierFragment(fragment, langue) {
  const noeuds = []
  let precedent = ''
  fragment.forEach((noeud) => {
    if (noeud.isText) {
      const brut = noeud.text.normalize('NFC')
      const lien = noeud.marks.some((m) => m.type.name === 'link')
      const texte = lien ? brut : typographier(brut, { langue, avant: precedent })
      noeuds.push(texte === noeud.text ? noeud : noeud.withText(texte))
      precedent = texte.slice(-1) || precedent
    } else if (noeud.isLeaf) {
      noeuds.push(noeud)
      precedent = OBJET
    } else {
      noeuds.push(noeud.copy(typographierFragment(noeud.content, langue)))
      // Un bloc repart de zéro ; un nœud en ligne (une note) compte comme un
      // objet : le signe qui le suit n'est pas en début de bloc.
      precedent = noeud.isInline ? OBJET : ''
    }
  })
  return Fragment.fromArray(noeuds)
}

function collage(langue) {
  return new Plugin({
    props: {
      transformPasted: (slice) =>
        new Slice(typographierFragment(slice.content, langue), slice.openStart, slice.openEnd),
    },
  })
}

/** Annule le dernier remplacement fait à la frappe, s'il vient d'avoir lieu :
 * le caractère tapé revient tel quel. (Le module insère le caractère tapé
 * avant de le remplacer ; défaire le remplacement suffit. Son propre
 * `undoInputRule` réinsère le caractère une seconde fois : docs/v2-veille.md.) */
const annulerRemplacement = (regles) => (state, dispatch) => {
  const dernier = regles.getState(state)
  if (!dernier) return false
  if (dispatch) {
    const tr = state.tr
    const { steps, docs } = dernier.transform
    for (let i = steps.length - 1; i >= 0; i--) tr.step(steps[i].invert(docs[i]))
    dispatch(tr)
  }
  return true
}

/** L'extension, pour la langue du document (`fr` : les règles s'appliquent ;
 * toute autre langue : rien ne change). */
export const extensionTypographie = createExtension(({ options }) => {
  const regles = inputRules({ rules: [regleDeFrappe(options.langue)] })
  return {
    key: 'typographie',
    prosemirrorPlugins: [regles, collage(options.langue)],
    keyboardShortcuts: {
      Backspace: ({ editor }) => editor.exec(annulerRemplacement(regles)),
    },
  }
})
