// La typographie à la frappe et au collage (08/10/2026).
//
// Les règles sont dans shared/typographie.js (partagées avec le serveur, qui
// les applique aux sorties de l'IA et de Claude). Ce greffon les branche sur
// l'éditeur à deux endroits :
//
//  - **la frappe** : `'`, `"`, un troisième `.`, et une espace avant
//    `; : ! ?` deviennent la bonne forme au moment où on tape. Un Retour
//    arrière juste après rend ce qu'on avait vraiment tapé : une correction
//    automatique qu'on ne peut pas défaire est une correction qu'on déteste.
//  - **le collage** : le texte collé est typographié avant d'entrer.
//
// Aucune interface, aucun réglage. Écrit à la main (comme
// markdownShortcuts.js) plutôt qu'avec prosemirror-inputrules : la
// transaction passe par le suivi des modifications, qui sait déjà qu'une
// frappe qui en remplace une autre, de la même personne et encore en
// attente, ne laisse rien de barré.

import { Plugin, PluginKey } from 'prosemirror-state'
import { Fragment, Slice } from 'prosemirror-model'
import { corrigerSaisie, typographier } from '../../shared/typographie.js'

export const typographieKey = new PluginKey('typographie')

/** Le texte d'un fragment collé, typographié bloc par bloc : le caractère
 * qui précède un nœud de texte (pour savoir si un `"` ouvre ou ferme) est le
 * dernier du nœud précédent dans le même bloc. */
export function typographierFragment(fragment) {
  const noeuds = []
  let precedent = ''
  fragment.forEach((noeud) => {
    if (noeud.isText) {
      // Une adresse (texte d'un lien) n'est pas du texte à corriger.
      const lien = noeud.marks.some((m) => m.type.name === 'link')
      const texte = lien ? noeud.text : typographier(noeud.text, { avant: precedent })
      noeuds.push(texte === noeud.text ? noeud : noeud.withText(texte))
      precedent = texte[texte.length - 1] || precedent
    } else if (noeud.isLeaf) {
      noeuds.push(noeud)
      precedent = '￼'
    } else {
      noeuds.push(noeud.copy(typographierFragment(noeud.content)))
      precedent = ''
    }
  })
  return Fragment.fromArray(noeuds)
}

/**
 * @param {{suiviActif?: (state) => boolean}} [options] `suiviActif` : le
 *   suivi des modifications est-il allumé ? Sous suivi, on ne remplace un
 *   caractère déjà là que s'il vient d'être tapé par la personne (insertion
 *   en attente) : sinon il resterait barré, et le Retour arrière ne saurait
 *   plus quoi rendre.
 */
export function typographiePlugin({ suiviActif = () => false } = {}) {
  return new Plugin({
    key: typographieKey,
    state: {
      init: () => null,
      // On retient la dernière correction tant que rien d'autre ne bouge :
      // c'est ce qui permet de la défaire d'un Retour arrière.
      apply(tr, ancien, _ancienEtat, nouvelEtat) {
        const m = tr.getMeta(typographieKey)
        // La position de fin est celle du curseur une fois la transaction
        // appliquée (le suivi peut en avoir réécrit les positions).
        if (m) return { ...m, fin: nouvelEtat.selection.from, doc: nouvelEtat.doc }
        return tr.docChanged || tr.selectionSet ? null : ancien
      },
    },
    props: {
      handleTextInput(view, from, to, texte) {
        const { state } = view
        const $from = state.doc.resolve(from)
        if (!$from.parent.isTextblock) return false
        // Dans un lien, le texte peut être une adresse.
        if ($from.marks().some((m) => m.type.name === 'link')) return false
        const decalage = $from.parentOffset
        const contexte = $from.parent.textBetween(Math.max(0, decalage - 2), decalage, undefined, '￼')
        const avantContexte =
          decalage > 2 ? $from.parent.textBetween(decalage - 3, decalage - 2, undefined, '￼') : ''
        const r = corrigerSaisie(contexte, texte, avantContexte)
        if (!r) return false
        const debut = from - r.retirer
        if (r.retirer) {
          // On ne remplace jamais ce qui est déjà barré par le suivi, ni —
          // sous suivi — un texte qui n'est pas une insertion en attente.
          const suppression = state.schema.marks.deletion
          if (suppression && state.doc.rangeHasMark(debut, from, suppression)) return false
          const insertion = state.schema.marks.insertion
          if (suiviActif(state) && insertion && !tousInseres(state.doc, debut, from, insertion)) return false
        }
        const brut = r.brut.slice(r.brut.length - r.retirer - 1)
        view.dispatch(
          state.tr
            .insertText(r.ecrire, debut, to)
            .setMeta(typographieKey, { longueur: r.ecrire.length, brut })
        )
        return true
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Backspace' || event.metaKey || event.ctrlKey || event.altKey) return false
        const { state } = view
        const info = typographieKey.getState(state)
        if (!info || info.doc !== state.doc) return false
        if (!state.selection.empty || state.selection.from !== info.fin) return false
        view.dispatch(state.tr.insertText(info.brut, info.fin - info.longueur, info.fin))
        return true
      },
      transformPasted(slice) {
        return new Slice(typographierFragment(slice.content), slice.openStart, slice.openEnd)
      },
    },
  })
}

/** Tout le texte de [de, a] porte-t-il une marque d'insertion ? */
function tousInseres(doc, de, a, insertion) {
  let tous = true
  doc.nodesBetween(de, a, (noeud) => {
    if (noeud.isText && !insertion.isInSet(noeud.marks)) tous = false
  })
  return tous
}
