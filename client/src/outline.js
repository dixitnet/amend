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
 * Renders a "plan du document" panel listing every heading (levels 1-5),
 * indented by level, that jumps the editor's selection (and scrolls it
 * into view) to a heading when clicked. The heading list itself is kept
 * incrementally in plugin state (scanHeadingsInRange/updateItemList —
 * only the part of the document a transaction touched gets rescanned,
 * see incrementalScan.js and rapport-test-charge-1.md constat 2.2); the
 * panel repaint is additionally throttled to at most once a second, and
 * still skips rebuilding the DOM entirely when the list hasn't actually
 * changed (signature-based skip, same principle as changesPanel.js).
 */
export function mountOutlinePanel(container) {
  let view = null
  let lastSignature = null

  function goTo(pos) {
    if (!view) return
    // pos is right before the heading node; +1 lands just inside its text,
    // and `near` snaps to the closest valid cursor position from there.
    const $pos = view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size))
    const tr = view.state.tr.setSelection(TextSelection.near($pos))
    view.dispatch(tr)
    view.focus()
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
    const container = view.dom.closest('.editor-container')
    if (!container) return
    const coords = view.coordsAtPos(pos)
    const containerTop = container.getBoundingClientRect().top
    const margin = 16 // small gap so the heading isn't flush against the edge
    container.scrollTop += coords.top - containerTop - margin
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
    }
    container.appendChild(list)
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
        update: () => throttledRender(),
        destroy: () => {
          view = null
        },
      }
    },
  })

  return plugin
}
