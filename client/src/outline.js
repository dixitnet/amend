import { defilerVers } from './defilement.js'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { updateItemList } from './incrementalScan.js'
import { throttle } from './throttle.js'

/** Every heading within [from, to), as { pos, level, text }. `pos` is the
 * position right before the heading node (its own doc position) —
 * navigating there resolves to just inside it. */
function scanHeadingsInRange(doc, from, to) {
  const items = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'heading') {
      if (pos >= from && pos < to) items.push({ pos, level: node.attrs.level, text: node.textContent.trim() })
      return false
    }
  })
  return items
}

/** Every heading in the document, in order, as { pos, level, text }. Built
 * purely from heading levels, regardless of what the heading sits inside
 * (a plain document, a blockquote...): the outline mirrors heading levels
 * only, not document structure. */
export function getOutline(doc) {
  return scanHeadingsInRange(doc, 0, doc.content.size)
}

function signatureOf(items) {
  return items.map((i) => `${i.level}:${i.pos}:${i.text}`).join('|')
}

const outlineKey = new PluginKey('outline')
const RENDER_INTERVAL_MS = 1000

/**
 * Renders a "plan du document" panel listing every heading (levels 1-3),
 * indented by level, that jumps the editor's selection (and scrolls it
 * into view) to a heading when clicked. The heading list itself is kept
 * incrementally in plugin state (scanHeadingsInRange/updateItemList —
 * only the part of the document a transaction touched gets rescanned,
 * see incrementalScan.js and rapport-test-charge-1.md constat 2.2); the
 * panel repaint is additionally throttled to at most once a second, and
 * still skips rebuilding the DOM entirely when the list hasn't actually
 * changed (signature-based skip, same principle as changesPanel.js).
 */
/** L'indice du titre sous lequel se trouve `pos` : le dernier titre qui
 * le précède. `-1` quand le curseur est avant le premier titre — un
 * document commence souvent par un paragraphe, et ce n'est pas une
 * anomalie. */
export function indexSectionCourante(items, pos) {
  let trouve = -1
  for (let i = 0; i < items.length; i++) {
    if (items[i].pos <= pos) trouve = i
    else break
  }
  return trouve
}

/** Les titres qui mènent au titre `index` : ses ascendants, du plus général
 * au plus proche. C'est ce qui permet de voir « où l'on est » et pas
 * seulement « sous quel titre » — dans un plan à trois niveaux, la section
 * de niveau 1 compte autant que le sous-titre qu'on est en train d'écrire. */
export function cheminVers(items, index) {
  const chemin = new Set()
  if (index < 0) return chemin
  let niveau = items[index].level
  for (let i = index - 1; i >= 0 && niveau > 1; i--) {
    if (items[i].level < niveau) {
      chemin.add(i)
      niveau = items[i].level
    }
  }
  return chemin
}

export function mountOutlinePanel(container) {
  let view = null
  let lastSignature = null
  // Les éléments du plan, dans l'ordre de la liste : la mise en évidence se
  // rejoue à chaque frappe, elle ne doit pas relire le DOM.
  let liens = []
  let indexCourant = null

  function goTo(pos) {
    if (!view) return
    // pos is right before the heading node; +1 lands just inside its text,
    // and `near` snaps to the closest valid cursor position from there.
    const $pos = view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size))
    const tr = view.state.tr.setSelection(TextSelection.near($pos))
    view.dispatch(tr)
    // Pas de `view.focus()` quand le document ne se modifie pas (24/09/2026).
    // Donner le focus fait amener au navigateur l'élément modifiable dans le
    // champ de vision — et cet élément, c'est tout le texte : la page
    // remontait à son début, écrasant le déplacement qu'on demandait juste
    // après. Sur téléphone, en lecture, on navigue pour lire ; le focus n'a
    // rien à y faire, et il ouvrirait le clavier pour rien.
    if (view.editable) view.focus()
    // Not tr.scrollIntoView(): that only scrolls the minimum distance needed
    // to bring the position into view, which in practice lands the heading
    // near the bottom of the editor when jumping forward in a long
    // document. Scroll explicitly instead, so the heading lands at the top.
    scrollHeadingToTop(pos)
  }

  /** Scrolls `.editor-container` (the editor's own scrolling element — see
   * editor.js) so the position sits near the top of it, rather than merely
   * visible. `coordsAtPos` gives viewport-relative coordinates for `pos`;
   * comparing that to the container's own bounding rect turns it into a
   * `scrollTop` delta that works regardless of current scroll position. */
  function scrollHeadingToTop(pos) {
    if (!view) return
    // La zone qui défile n'est plus toujours `.editor-container` : sur
    // téléphone c'est la page (voir defilement.js).
    defilerVers(view, pos, { marge: 16 })
  }

  function render(force) {
    if (!view) return
    const items = outlineKey.getState(view.state)
    const signature = signatureOf(items)
    if (!force && signature === lastSignature) return
    lastSignature = signature
    container.innerHTML = ''

    const title = document.createElement('h3')
    title.textContent = 'Plan du document'
    container.appendChild(title)

    if (items.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'outline-empty'
      empty.textContent = 'Aucun titre pour le moment.'
      container.appendChild(empty)
      return
    }

    const list = document.createElement('ul')
    list.className = 'outline-list'
    liens = []
    for (const item of items) {
      const li = document.createElement('li')
      li.className = `outline-item outline-level-${item.level}`
      const link = document.createElement('button')
      link.type = 'button'
      link.className = 'outline-link'
      const label = item.text || '(sans titre)'
      link.textContent = label
      link.title = label
      link.onclick = () => goTo(item.pos)
      li.appendChild(link)
      list.appendChild(li)
      liens.push(li)
    }
    container.appendChild(list)
    // La liste vient d'être refaite : la mise en évidence aussi, sinon elle
    // disparaîtrait à chaque titre ajouté.
    indexCourant = null
    majSectionCourante()
  }

  /** Met en évidence la section où se trouve le curseur, et la ramène dans
   * le champ si elle en est sortie (18/09/2026).
   *
   * Appelé à **chaque** transaction, donc volontairement sans rendu : on
   * déplace deux classes, rien de plus. Le plan lui-même n'est reconstruit
   * qu'une fois par seconde, et seulement s'il a changé — sans cette
   * séparation, suivre le curseur voudrait dire redessiner la liste à
   * chaque frappe.
   *
   * Le défilement ne se déclenche **que lorsqu'on change de section** : un
   * panneau qui se recentre pendant qu'on lit fait perdre tout repère
   * (même règle que le panneau des modifications, voir
   * claude/conception-marge-annotations.md). */
  function majSectionCourante() {
    if (!view || !liens.length) return
    const items = outlineKey.getState(view.state)
    if (items.length !== liens.length) return
    const index = indexSectionCourante(items, view.state.selection.head)
    if (index === indexCourant) return
    indexCourant = index

    const chemin = cheminVers(items, index)
    liens.forEach((li, i) => {
      li.classList.toggle('outline-courante', i === index)
      li.classList.toggle('outline-chemin', chemin.has(i))
    })
    if (index >= 0) amenerDansLeChamp(liens[index])
  }

  /** Fait défiler le plan juste ce qu'il faut pour montrer `el` — et rien
   * si on le voit déjà. `scrollIntoView` ferait défiler tous les ancêtres,
   * page comprise ; ici on ne touche qu'à la colonne du plan. */
  function amenerDansLeChamp(el) {
    const boite = container.closest('.outline-sidebar') || container
    const cadre = boite.getBoundingClientRect()
    const cible = el.getBoundingClientRect()
    const marge = 8
    if (cible.top < cadre.top + marge) {
      boite.scrollTop -= cadre.top + marge - cible.top
    } else if (cible.bottom > cadre.bottom - marge) {
      boite.scrollTop += cible.bottom - (cadre.bottom - marge)
    }
  }

  const throttledRender = throttle(() => render(false), RENDER_INTERVAL_MS)

  const plugin = new Plugin({
    key: outlineKey,
    state: {
      init: (_, state) => scanHeadingsInRange(state.doc, 0, state.doc.content.size),
      apply: (tr, items) => updateItemList(items, tr, scanHeadingsInRange),
    },
    view(editorView) {
      view = editorView
      render(true) // first paint immediately, no need to wait a second on load
      return {
        update: () => {
          throttledRender()
          // Hors du throttle : suivre le curseur doit être immédiat, c'est
          // tout l'intérêt.
          majSectionCourante()
        },
        destroy: () => {
          view = null
        },
      }
    },
  })

  return plugin
}
