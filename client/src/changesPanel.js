import { Plugin, PluginKey } from 'prosemirror-state'
import {
  scanChangesInRange,
  updateChangeList,
  mergeAdjacentChanges,
  acceptChange,
  rejectChange,
  acceptAllChanges,
  rejectAllChanges,
} from './trackChanges.js'

// Au-delà de ce nombre de modifications en attente, le panneau devient
// difficile à suivre (voir rapport-test-charge-1.md, constat 2.3 : 1985
// entrées d'un coup à la fin d'un test de charge rendaient la liste
// impraticable bien avant ce volume) — un bandeau invite à en traiter une
// partie plutôt que de laisser la pile grossir silencieusement. Choix
// délibéré : un avertissement, pas un blocage de la frappe.
const PENDING_WARNING_THRESHOLD = 500

const changesKey = new PluginKey('changesList')

function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 10) return "à l'instant"
  if (s < 60) return `il y a ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

/**
 * Renders the "modifications en attente" sidebar and keeps it in sync with
 * the editor via a plugin `view()` hook (so it updates on every doc change,
 * local or remote, without polling). The underlying raw change list is
 * kept in plugin state (see trackChanges.js's scanChangesInRange/
 * updateChangeList) incrementally — only the part of the document a
 * transaction touched gets rescanned, not the whole document on every
 * keystroke (see rapport-test-charge-1.md, constat 2.2) — and merged into
 * display-ready entries on every render, which stays cheap since merging
 * is proportional to the number of changes, not the document's size.
 * Deliberately NOT throttled like wordcount.js/outline.js/tkMarker.js:
 * this is the panel people actually act on (accept/reject), so it stays
 * exactly as responsive as before.
 */
export function mountChangesPanel(container, { canReview = true } = {}) {
  let view = null
  // A signature of the last rendered change list, so we can skip rebuilding
  // the whole panel (and re-creating every Accepter/Rejeter button) when a
  // transaction doesn't actually touch the tracked changes — e.g. a remote
  // collaborator just moving their cursor. Without this, a re-render that
  // lands between a click's mousedown and mouseup can swap the button out
  // from under the click, which is why accept/reject sometimes silently
  // needed a second click.
  let lastSignature = null

  function signatureOf(changes) {
    return changes.map((c) => `${c.type}:${c.from}:${c.to}:${c.user}:${c.ts}`).join('|')
  }

  function render(force) {
    if (!view) return
    const raw = changesKey.getState(view.state) ?? []
    const changes = mergeAdjacentChanges(raw)
    const signature = signatureOf(changes)
    if (!force && signature === lastSignature) return
    lastSignature = signature
    container.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'changes-header'
    const title = document.createElement('h3')
    title.textContent = `Modifications (${changes.length})`
    header.appendChild(title)
    if (changes.length > 1 && canReview) {
      const bulk = document.createElement('div')
      bulk.className = 'changes-bulk'
      const acceptAll = document.createElement('button')
      acceptAll.textContent = 'Tout accepter'
      acceptAll.className = 'btn-accept'
      acceptAll.onclick = () => acceptAllChanges(view)
      const rejectAll = document.createElement('button')
      rejectAll.textContent = 'Tout rejeter'
      rejectAll.className = 'btn-reject'
      rejectAll.onclick = () => rejectAllChanges(view)
      bulk.append(acceptAll, rejectAll)
      header.appendChild(bulk)
    }
    container.appendChild(header)

    if (changes.length > PENDING_WARNING_THRESHOLD) {
      const warning = document.createElement('p')
      warning.className = 'changes-warning'
      warning.textContent =
        `${changes.length} modifications en attente — la liste devient difficile à suivre au-delà de ${PENDING_WARNING_THRESHOLD}, pensez à en accepter ou rejeter une partie.`
      container.appendChild(warning)
    }

    if (changes.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'changes-empty'
      empty.textContent = 'Aucune modification en attente.'
      container.appendChild(empty)
      return
    }

    const list = document.createElement('ul')
    list.className = 'changes-list'
    for (const change of changes) {
      const item = document.createElement('li')
      item.className = `change-item change-${change.type}`
      item.style.setProperty('--user-color', change.userColor)

      const meta = document.createElement('div')
      meta.className = 'change-meta'
      const typeLabel =
        change.type === 'insertion' ? 'ajout' : change.type === 'deletion' ? 'suppression' : 'saut de paragraphe'
      meta.innerHTML = `<strong>${escapeHtml(change.user)}</strong> · ${typeLabel} · ${relativeTime(change.ts)}`

      const text = document.createElement('div')
      text.className = 'change-text'
      text.textContent = change.text.length > 140 ? change.text.slice(0, 140) + '…' : change.text

      const actions = document.createElement('div')
      actions.className = 'change-actions'
      // Un correcteur peut proposer des modifications (suivi de
      // modifications forcé, voir editor.js) mais ne peut pas les
      // valider/invalider — seuls les éditeurs accèdent à Accepter/Rejeter
      // (voir claude/conception-gestion-utilisateurs.md, projet Amend).
      if (canReview) {
        const acceptBtn = document.createElement('button')
        acceptBtn.textContent = 'Accepter'
        acceptBtn.className = 'btn-accept'
        acceptBtn.onclick = () => acceptChange(view, change)
        const rejectBtn = document.createElement('button')
        rejectBtn.textContent = 'Rejeter'
        rejectBtn.className = 'btn-reject'
        rejectBtn.onclick = () => rejectChange(view, change)
        actions.append(acceptBtn, rejectBtn)
      }

      item.append(meta, text, actions)
      // Clicking the item itself (not Accepter/Rejeter) scrolls the editor
      // to that change, centered — a quick way to see a change in its real
      // context before deciding on it. `closest` rather than checking
      // `actions` directly so a click that lands on the button's own text
      // node (or any future control added inside .change-actions) is still
      // caught.
      item.addEventListener('click', (e) => {
        if (e.target.closest('.change-actions')) return
        scrollChangeToMiddle(change.from)
      })
      list.appendChild(item)
    }
    container.appendChild(list)
  }

  /** Scrolls `.editor-container` (the editor's own scrolling element — see
   * editor.js) so `pos` lands in the vertical middle of it, rather than
   * merely visible — same `coordsAtPos`-against-container-rect approach as
   * outline.js's scrollHeadingToTop, but centered instead of pinned to the
   * top: a change is usually short, so seeing what's around it (on both
   * sides) matters more than pinning its start edge. */
  function scrollChangeToMiddle(pos) {
    if (!view) return
    const container = view.dom.closest('.editor-container')
    if (!container) return
    const clamped = Math.min(pos, view.state.doc.content.size)
    const coords = view.coordsAtPos(clamped)
    const containerRect = container.getBoundingClientRect()
    const middle = containerRect.top + container.clientHeight / 2
    container.scrollTop += coords.top - middle
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  const plugin = new Plugin({
    key: changesKey,
    state: {
      init: (_, state) => scanChangesInRange(state.doc, 0, state.doc.content.size),
      apply: (tr, raw) => updateChangeList(raw, tr),
    },
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
