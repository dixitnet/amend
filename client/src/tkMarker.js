import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/** The literal marker someone types to flag "come back to this later" — a
 * personal convention (their own "TK"). Deliberately kept as ordinary text
 * in the document and in any export (see mdExport.js) — nothing here
 * changes what's actually stored, only how it's drawn on screen and
 * counted in the banner. */
export const TK_MARKER = '!!'

/** Every occurrence of the marker in the document, as { from, to } doc
 * positions. Scanned one textblock (paragraph/heading/list item...) at a
 * time via its combined `textContent` — so a marker split across two
 * adjacent, differently-marked runs (e.g. half inside a tracked insertion)
 * is still found, but a match is never allowed to span two separate
 * blocks. */
export function findMarkers(doc) {
  const hits = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const text = node.textContent
    let idx = text.indexOf(TK_MARKER)
    while (idx !== -1) {
      const from = pos + 1 + idx
      hits.push({ from, to: from + TK_MARKER.length })
      idx = text.indexOf(TK_MARKER, idx + TK_MARKER.length)
    }
  })
  return hits
}

/**
 * One plugin doing two things off a single doc scan: (1) a decoration —
 * never a stored mark — that visually swaps every marker for an "alert"
 * emoji via CSS (see .tk-marker in style.css: the real "!!" stays in the
 * DOM at font-size 0, so the cursor, selection, copy/paste and the .md
 * export all still see the literal characters; only the emoji is drawn);
 * (2) a live count rendered into `container` (the banner), following the
 * same skip-if-unchanged pattern as wordcount.js/outline.js.
 */
export function mountTkMarker(container) {
  let lastCount = null

  function render(doc) {
    if (!container) return
    const count = findMarkers(doc).length
    if (count === lastCount) return
    lastCount = count
    container.textContent = count > 0 ? `⚠️ ${count}` : ''
    container.title = count > 0 ? `${count} marqueur${count > 1 ? 's' : ''} "!!" à reprendre` : ''
  }

  return new Plugin({
    props: {
      decorations(state) {
        const hits = findMarkers(state.doc)
        if (hits.length === 0) return null
        return DecorationSet.create(
          state.doc,
          hits.map((h) => Decoration.inline(h.from, h.to, { class: 'tk-marker' }))
        )
      },
    },
    view(editorView) {
      render(editorView.state.doc)
      return {
        update: (view) => render(view.state.doc),
      }
    },
  })
}
