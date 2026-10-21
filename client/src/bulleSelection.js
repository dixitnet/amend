// La bulle de sélection (lot L3, 21/10/2026 — claude/vues-reference-formats.md,
// vue V1) : sélectionner un passage fait paraître, juste à côté, ce qu'on peut
// en faire — Corriger, Réduire, Clarifier, Demander à Margo, Commenter.
//
// À la souris, elle se pose **sous** la sélection : elle ne masque pas la
// ligne qu'on vient de lire. Au doigt, **au-dessus** : sous le pouce et sous la
// barre de suggestions du clavier, on ne la verrait pas (décision D12).
//
// Elle vit dans le conteneur qui défile, en position absolue, comme les
// cartes de la gouttière : le défilement ne la déplace pas, rien n'est
// recalculé en défilant. Elle se cache pendant qu'on étend la sélection à la
// souris, quand l'éditeur perd le focus, ou sur Échap.
//
// Ce module ne sait rien de ce que font les actions : la coquille (editor.js)
// les lui donne, avec la condition qui les montre (droit à l'IA, à Margo, au
// commentaire). Une bulle sans action visible ne paraît pas.

import { Plugin } from 'prosemirror-state'
import { svgIcone } from './interface/icones.js'

const ECART = 8 // px entre la sélection et la bulle
const DELAI_MS = 120

/**
 * Où poser la bulle, dans les coordonnées du conteneur qui défile.
 * Fonction pure : tout arrive en pixels de fenêtre, sauf le défilement.
 *
 * @param {object} o
 * @param {{left:number, top:number, bottom:number}} o.debut   début de la sélection (coordsAtPos)
 * @param {{left:number, top:number, bottom:number}} o.fin     fin de la sélection
 * @param {{left:number, top:number, right:number}} o.conteneur  rectangle du conteneur
 * @param {{left:number, right:number}} o.colonne  bords de la colonne de texte
 * @param {number} o.defilement  scrollTop du conteneur
 * @param {number} o.largeur     largeur de la bulle
 * @param {number} o.hauteur     hauteur de la bulle
 * @param {boolean} o.dessous    true à la souris, false au doigt
 */
export function placerBulle({ debut, fin, conteneur, colonne, defilement, largeur, hauteur, dessous }) {
  const top = dessous
    ? fin.bottom - conteneur.top + defilement + ECART
    : debut.top - conteneur.top + defilement - hauteur - ECART
  const min = colonne.left - conteneur.left
  const max = Math.max(min, colonne.right - conteneur.left - largeur)
  const left = Math.min(Math.max(debut.left - conteneur.left, min), max)
  return { top: Math.max(0, Math.round(top)), left: Math.round(left) }
}

/**
 * @param {HTMLElement} conteneur   le conteneur qui défile (.editor-container)
 * @param {object} o
 * @param {{cle:string, libelle:string, icone?:string, ia?:boolean, visible:()=>boolean, executer:()=>void}[]} o.actions
 * @param {() => boolean} o.active   la bulle a-t-elle sa place ici (hors téléphone)
 * @param {() => boolean} [o.auDoigt]
 */
export function mountBulleSelection(conteneur, { actions, active, auDoigt = () => false }) {
  const bulle = document.createElement('div')
  bulle.className = 'bulle-selection'
  bulle.setAttribute('role', 'toolbar')
  bulle.setAttribute('aria-label', 'Actions sur la sélection')
  bulle.hidden = true
  const boutons = actions.map((a) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `bulle-action${a.ia ? ' bulle-ia' : ''}`
    b.dataset.action = a.cle
    b.innerHTML = `${a.icone ? svgIcone(a.icone, 15) : ''}<span>${a.libelle}</span>`
    // Garder la sélection et le focus de l'éditeur : l'action porte sur eux.
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', () => {
      masquer()
      a.executer()
    })
    bulle.appendChild(b)
    return b
  })
  conteneur.appendChild(bulle)

  let view = null
  let timer = null
  let enGlissement = false

  // Un lecteur ne peut pas donner le focus à un texte qu'il ne peut pas
  // modifier : sa sélection est bien dans l'éditeur, sans qu'il l'ait.
  function selectionDansLaVue() {
    if (!view || view.editable) return false
    const sel = view.root.getSelection && view.root.getSelection()
    return !!sel && sel.rangeCount > 0 && !sel.isCollapsed && view.dom.contains(sel.anchorNode)
  }

  function masquer() {
    bulle.hidden = true
  }

  function rendre() {
    timer = null
    if (!view || enGlissement || !active()) return masquer()
    const { from, to, empty } = view.state.selection
    if (empty || !(view.hasFocus() || selectionDansLaVue())) return masquer()
    let visibles = 0
    actions.forEach((a, i) => {
      const v = !!a.visible()
      boutons[i].hidden = !v
      if (v) visibles++
    })
    if (!visibles) return masquer()
    let debut, fin
    try {
      debut = view.coordsAtPos(from)
      fin = view.coordsAtPos(to)
    } catch {
      return masquer()
    }
    bulle.hidden = false
    const r = view.dom.getBoundingClientRect()
    const st = getComputedStyle(view.dom)
    const { top, left } = placerBulle({
      debut,
      fin,
      conteneur: conteneur.getBoundingClientRect(),
      colonne: {
        left: r.left + (parseFloat(st.paddingLeft) || 0),
        right: r.right - (parseFloat(st.paddingRight) || 0),
      },
      defilement: conteneur.scrollTop,
      largeur: bulle.offsetWidth,
      hauteur: bulle.offsetHeight,
      dessous: !auDoigt(),
    })
    bulle.style.top = `${top}px`
    bulle.style.left = `${left}px`
  }

  function planifier() {
    clearTimeout(timer)
    timer = setTimeout(rendre, DELAI_MS)
  }

  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: () => {
          enGlissement = true
          masquer()
          // Relâcher, ou finir de glisser-déposer un passage déjà sélectionné
          // (le navigateur n'envoie alors pas de mouseup).
          const relacher = () => {
            enGlissement = false
            document.removeEventListener('mouseup', relacher)
            document.removeEventListener('dragend', relacher)
            planifier()
          }
          document.addEventListener('mouseup', relacher)
          document.addEventListener('dragend', relacher)
          return false
        },
        keydown: (_v, e) => {
          enGlissement = false
          if (e.key === 'Escape' && !bulle.hidden) {
            masquer()
            return true
          }
          return false
        },
        blur: () => {
          // Le focus passe parfois par la bulle elle-même (lecteur d'écran) :
          // on attend de voir où il se pose.
          setTimeout(() => {
            if (!bulle.contains(document.activeElement)) masquer()
          }, 0)
          return false
        },
      },
    },
    view(editorView) {
      view = editorView
      return {
        update: (v, ancien) => {
          if (!v.state.selection.eq(ancien.selection) || v.state.doc !== ancien.doc) planifier()
        },
        destroy: () => {
          clearTimeout(timer)
          bulle.remove()
          view = null
        },
      }
    },
  })
}
