import { Plugin, TextSelection } from 'prosemirror-state'

/** Every heading in the document, in order, as { pos, level, text }. `pos`
 * is the position right before the heading node (its own doc position) —
 * navigating there resolves to just inside it. Built purely from heading
 * levels, regardless of what the heading sits inside (a plain document, a
 * blockquote...): the outline mirrors heading levels only, not document
 * structure. */
export function getOutline(doc) {
  const items = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({ pos, level: node.attrs.level, text: node.textContent.trim() })
      return false
    }
  })
  return items
}

function signatureOf(items) {
  return items.map((i) => `${i.level}:${i.pos}:${i.text}`).join('|')
}

/**
 * Renders a "plan du document" panel listing every heading (levels 1-5),
 * indented by level, that jumps the editor's selection (and scrolls it
 * into view) to a heading when clicked. Kept in sync via a plugin `view()`
 * hook, like changesPanel.js — including the same signature-based skip so
 * a transaction that doesn't touch any heading doesn't rebuild the list
 * (and doesn't risk swallowing a click mid-rebuild).
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
    const items = getOutline(view.state.doc)
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

  const plugin = new Plugin({
    view(editorView) {
      view = editorView
      render(true)
      return {
        update: () => render(false),
        destroy: () => {
          view = null
        },
      }
    },
  })

  return plugin
}
