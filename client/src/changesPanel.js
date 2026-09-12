import { Plugin } from 'prosemirror-state'
import { listChanges, acceptChange, rejectChange, acceptAllChanges, rejectAllChanges } from './trackChanges.js'

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
 * local or remote, without polling).
 */
export function mountChangesPanel(container) {
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
    const changes = listChanges(view.state.doc)
    const signature = signatureOf(changes)
    if (!force && signature === lastSignature) return
    lastSignature = signature
    container.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'changes-header'
    const title = document.createElement('h3')
    title.textContent = `Modifications (${changes.length})`
    header.appendChild(title)
    if (changes.length > 1) {
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
      const acceptBtn = document.createElement('button')
      acceptBtn.textContent = 'Accepter'
      acceptBtn.className = 'btn-accept'
      acceptBtn.onclick = () => acceptChange(view, change)
      const rejectBtn = document.createElement('button')
      rejectBtn.textContent = 'Rejeter'
      rejectBtn.className = 'btn-reject'
      rejectBtn.onclick = () => rejectChange(view, change)
      actions.append(acceptBtn, rejectBtn)

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
