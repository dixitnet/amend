import { defilerVers } from './defilement.js'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { touchedBlockRange } from './incrementalScan.js'
import { throttle } from './throttle.js'

/** The literal marker someone types to flag "come back to this later" — a
 * personal convention (their own "TK"). Deliberately kept as ordinary text
 * in the document and in any export (see mdExport.js) — nothing here
 * changes what's actually stored, only how it's drawn on screen and
 * counted in the banner. */
export const TK_MARKER = '!!'

/** Every occurrence of the marker within [from, to), as { from, to } doc
 * positions. Scanned one textblock (paragraph/heading/list item...) at a
 * time via its combined `textContent` — so a marker split across two
 * adjacent, differently-marked runs (e.g. half inside a tracked insertion)
 * is still found, but a match is never allowed to span two separate
 * blocks. */
export function findMarkersInRange(doc, from, to) {
  const hits = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textContent
    let idx = text.indexOf(TK_MARKER)
    while (idx !== -1) {
      const hitFrom = pos + 1 + idx
      if (hitFrom >= from && hitFrom < to) hits.push({ from: hitFrom, to: hitFrom + TK_MARKER.length })
      idx = text.indexOf(TK_MARKER, idx + TK_MARKER.length)
    }
    return false
  })
  return hits
}

/** Every occurrence of the marker in the whole document — see
 * findMarkersInRange. */
export function findMarkers(doc) {
  return findMarkersInRange(doc, 0, doc.content.size)
}

function decorationsFor(hits) {
  return hits.map((h) => Decoration.inline(h.from, h.to, { class: 'tk-marker' }))
}

const tkKey = new PluginKey('tkMarker')
const RENDER_INTERVAL_MS = 1000

/**
 * One plugin doing two things off the same incrementally-maintained
 * state (see rapport-test-charge-1.md, constat 2.2 — this used to be two
 * full-document scans per transaction): (1) a decoration — never a
 * stored mark — that visually swaps every marker for an "alert" emoji via
 * CSS (see .tk-marker in style.css: the real "!!" stays in the DOM at
 * font-size 0, so the cursor, selection, copy/paste and the .md export
 * all still see the literal characters; only the emoji is drawn); (2) a
 * live count rendered into `container` (the banner).
 *
 * The DecorationSet itself is kept in sync via `DecorationSet.map` (cheap:
 * proportional to the number of markers, not the size of the document)
 * plus a fresh, bounded rescan of just the part of the document the
 * transaction touched (see incrementalScan.js) — so it's always exactly
 * correct, never merely "close enough until the next full rescan". Only
 * the banner *repaint* is throttled (RENDER_INTERVAL_MS): the decorations
 * themselves stay perfectly live, since ProseMirror already draws them
 * as part of its normal, cheap render diffing.
 */
export function mountTkMarker(container, { onCycle } = {}) {
  let view = null
  let lastRenderedCount = null
  // Position du dernier marqueur visité, pour passer au suivant plutôt que
  // de revenir toujours au premier (demande du 15/09/2026). On mémorise la
  // *position* et non l'index : le document bouge entre deux clics, et une
  // position permet de retrouver « le marqueur suivant » même si des
  // marqueurs ont été ajoutés ou retirés entre-temps.
  let dernierePosition = -1

  /** Sélectionne le marqueur suivant dans l'ordre du document, en boucle, et
   * le centre dans la zone d'édition. Sélectionner (plutôt que placer le
   * curseur) rend le marqueur visible et permet de le remplacer en tapant
   * directement. */
  function cycler() {
    if (!view) return
    const marqueurs = findMarkers(view.state.doc)
    if (!marqueurs.length) return
    const suivant = marqueurs.find((m) => m.from > dernierePosition) || marqueurs[0]
    dernierePosition = suivant.from
    const { state, dispatch } = view
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, suivant.from, suivant.to)).scrollIntoView())
    view.focus()
    // Centrer comme le font les panneaux latéraux, plutôt que de se
    // contenter du défilement minimal de scrollIntoView.
    defilerVers(view, suivant.from, { fraction: 0.5 })
    if (onCycle) onCycle(marqueurs.indexOf(suivant) + 1, marqueurs.length)
  }

  if (container) {
    container.addEventListener('click', cycler)
  }

  function render() {
    if (!view || !container) return
    const count = tkKey.getState(view.state)?.count ?? 0
    if (count === lastRenderedCount) return
    lastRenderedCount = count
    // « 12 ⚠️, » (19/09/2026) : le même pictogramme que dans le texte, pour
    // qu'on reconnaisse d'un coup d'œil ce qui est compté, et la virgule qui
    // l'enchaîne aux deux autres compteurs du bandeau.
    container.textContent = count > 0 ? `${count} \u26a0\ufe0f,` : ''
    container.classList.toggle('cliquable', count > 0)
    container.title =
      count > 0
        ? `${count} marqueur${count > 1 ? 's' : ''} "!!" à reprendre — cliquer pour aller au suivant`
        : ''
  }

  const throttledRender = throttle(render, RENDER_INTERVAL_MS)

  return new Plugin({
    key: tkKey,
    state: {
      init(_, state) {
        const hits = findMarkers(state.doc)
        return { set: DecorationSet.create(state.doc, decorationsFor(hits)), count: hits.length }
      },
      apply(tr, value) {
        if (!tr.docChanged) return value
        let set = value.set.map(tr.mapping, tr.doc)
        const range = touchedBlockRange(tr)
        if (range) {
          set = set.remove(set.find(range.from, range.to))
          set = set.add(tr.doc, decorationsFor(findMarkersInRange(tr.doc, range.from, range.to)))
        }
        return { set, count: set.find().length }
      },
    },
    props: {
      decorations: (state) => tkKey.getState(state)?.set ?? null,
    },
    view(editorView) {
      view = editorView
      render() // first paint immediately, no need to wait a second on load
      return {
        update: () => throttledRender(),
        destroy: () => {
          view = null
        },
      }
    },
  })
}
