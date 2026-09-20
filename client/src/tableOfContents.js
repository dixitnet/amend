// La table des matières — le bloc, et ce qu'on en voit en écrivant.
//
// Trois partis pris (20/09/2026), tous les trois demandés par Sylvain :
//
// 1. **Elle s'insère où l'on veut.** D'où un nœud du schéma plutôt qu'une
//    option de mise en page : un sommaire général en tête, le détail d'une
//    partie au milieu, les deux dans le même document si ça a du sens.
// 2. **Sa profondeur se règle sur le bloc lui-même**, pas dans le panneau
//    de mise en page : deux tables du même document n'ont pas forcément le
//    même propos.
// 3. **Son style est celui du texte courant.** Rien à régler, rien à
//    désaccorder : elle est faite de la même matière que le texte autour.
//
// Ce que l'on montre à l'écran est un **aperçu**, pas le résultat : les
// numéros de page n'existent qu'une fois le document composé, donc ils
// n'apparaissent qu'au PDF. Montrer des numéros faux serait pire que de
// n'en montrer aucun.

import { Plugin, PluginKey } from 'prosemirror-state'
import { NIVEAUX_TITRE } from '../../shared/style.js'
import { getOutline } from './outline.js'

export const PROFONDEUR_DEFAUT = 2

/** Les titres qu'une table de cette profondeur reprend. */
export function entrees(doc, profondeur) {
  // Une valeur hors bornes est ramenée dans les bornes, pas remplacée par
  // la valeur par défaut : 0 veut dire « le moins possible », pas « comme
  // d'habitude ». Seule une valeur qui n'est pas un nombre retombe sur le
  // défaut.
  const n = Number(profondeur)
  const max = Number.isFinite(n) ? Math.min(NIVEAUX_TITRE, Math.max(1, n)) : PROFONDEUR_DEFAUT
  return getOutline(doc).filter((t) => t.level <= max && t.text !== '')
}

/** Insère une table des matières à la position du curseur. */
export function insererTable(state, dispatch) {
  const type = state.schema.nodes.table_of_contents
  if (!type) return false
  const { $from } = state.selection
  // Un nœud de bloc se pose entre deux blocs, jamais au milieu d'une
  // phrase : on remonte au bord du bloc courant.
  const pos = $from.after($from.depth)
  if (dispatch) {
    const tr = state.tr.insert(pos, type.create({ profondeur: PROFONDEUR_DEFAUT }))
    dispatch(tr.scrollIntoView())
  }
  return true
}

/**
 * La vue du bloc dans l'éditeur. Elle se redessine quand les titres
 * changent — c'est ce qui la rend utile pendant qu'on écrit, et non
 * seulement à l'export.
 */
class VueTable {
  constructor(node, view, getPos) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('div')
    this.dom.className = 'toc-bloc'
    // `contentEditable = false` : le bloc n'est pas du texte qu'on tape,
    // c'est un objet posé dans le texte.
    this.dom.contentEditable = 'false'

    const entete = document.createElement('div')
    entete.className = 'toc-entete'
    const titre = document.createElement('span')
    titre.textContent = 'Table des matières'
    entete.appendChild(titre)

    this.reglage = document.createElement('label')
    this.reglage.className = 'toc-profondeur'
    const legende = document.createElement('span')
    legende.textContent = 'Jusqu’au titre'
    this.select = document.createElement('select')
    for (let n = 1; n <= NIVEAUX_TITRE; n++) {
      const o = document.createElement('option')
      o.value = String(n)
      o.textContent = String(n)
      this.select.appendChild(o)
    }
    this.select.value = String(node.attrs.profondeur)
    this.select.onchange = () => {
      const pos = this.getPos()
      if (pos == null) return
      const tr = this.view.state.tr.setNodeMarkup(pos, null, {
        ...this.node.attrs,
        profondeur: Number(this.select.value),
      })
      this.view.dispatch(tr)
    }
    this.reglage.append(legende, this.select)
    entete.appendChild(this.reglage)

    this.liste = document.createElement('div')
    this.liste.className = 'toc-liste'

    this.dom.append(entete, this.liste)
    this.dessiner()
    vues.add(this)
  }

  destroy() {
    vues.delete(this)
  }

  /** La liste des titres, telle qu'elle sera reprise à l'export. Cliquer
   * sur une entrée va au titre : une table des matières qu'on ne peut pas
   * suivre est une décoration. */
  dessiner() {
    const items = entrees(this.view.state.doc, this.node.attrs.profondeur)
    this.liste.textContent = ''
    if (items.length === 0) {
      const vide = document.createElement('p')
      vide.className = 'toc-vide'
      vide.textContent =
        'Aucun titre à ce niveau pour l’instant — la table se remplira toute seule.'
      this.liste.appendChild(vide)
      this.signature = ''
      return
    }
    for (const item of items) {
      const ligne = document.createElement('button')
      ligne.type = 'button'
      ligne.className = `toc-ligne toc-niveau-${item.level}`
      ligne.textContent = item.text
      ligne.onclick = () => {
        const { state, dispatch } = this.view
        const tr = state.tr.setSelection(
          state.selection.constructor.near(state.doc.resolve(item.pos + 1))
        )
        dispatch(tr.scrollIntoView())
        this.view.focus()
      }
      this.liste.appendChild(ligne)
    }
    this.signature = items.map((i) => `${i.level}:${i.text}`).join('|')
  }

  update(node) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.select.value = String(node.attrs.profondeur)
    this.rafraichir()
    return true
  }

  /** Redessine seulement si la liste a réellement changé : le bloc est
   * traversé à chaque frappe, pas la peine de reconstruire des dizaines de
   * lignes pour une virgule ajoutée dans un paragraphe. */
  rafraichir() {
    const items = entrees(this.view.state.doc, this.node.attrs.profondeur)
    const signature = items.map((i) => `${i.level}:${i.text}`).join('|')
    if (signature === this.signature) return
    this.dessiner()
  }

  stopEvent(event) {
    // Le sélecteur de profondeur est à nous, pas à ProseMirror.
    return this.reglage.contains(event.target) || this.liste.contains(event.target)
  }

  ignoreMutation() {
    return true
  }
}

const tocKey = new PluginKey('tableOfContents')

/** Les vues vivantes, pour pouvoir les rafraîchir toutes quand un titre
 * change **ailleurs** dans le document : ProseMirror n'a alors aucune
 * raison de prévenir un bloc qui, lui, n'a pas bougé. Un registre explicite
 * plutôt qu'une fouille du DOM — on sait exactement qui est en vie, et on
 * le retire à la destruction. */
const vues = new Set()

export function tableOfContentsPlugin() {
  return new Plugin({
    key: tocKey,
    props: {
      nodeViews: {
        table_of_contents: (node, view, getPos) => new VueTable(node, view, getPos),
      },
    },
    view() {
      let dernierDoc = null
      return {
        update(view) {
          if (view.state.doc === dernierDoc) return
          dernierDoc = view.state.doc
          for (const vue of vues) vue.rafraichir()
        },
      }
    },
  })
}
