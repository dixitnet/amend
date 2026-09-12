import { Plugin } from 'prosemirror-state'

/** Word/character count for a doc range. Character count is the plain text
 * length (spaces included, no separators added — matches what the user
 * actually typed). Word count inserts a space between blocks first, so two
 * adjacent paragraphs' words are never fused into one at the boundary. */
export function countText(doc, from, to) {
  const chars = doc.textBetween(from, to, '', '').length
  const wordsSource = doc.textBetween(from, to, ' ', ' ').trim()
  const words = wordsSource === '' ? 0 : wordsSource.split(/\s+/).length
  return { chars, words }
}

/**
 * Renders a permanent word/character counter into `container`: the current
 * selection when it's non-empty, otherwise the whole document. Kept in sync
 * via a plugin `view()` hook (like outline.js/changesPanel.js), and skips
 * the DOM write when nothing actually changed.
 */
export function mountWordCount(container) {
  let view = null
  let last = null

  function render() {
    if (!view) return
    const { state } = view
    const { selection } = state
    const selecting = !selection.empty
    const { from, to } = selecting ? selection : { from: 0, to: state.doc.content.size }
    const { chars, words } = countText(state.doc, from, to)
    const signature = `${selecting}:${from}:${to}:${chars}:${words}`
    if (signature === last) return
    last = signature
    const wordLabel = words === 1 ? 'mot' : 'mots'
    const charLabel = chars === 1 ? 'caractère' : 'caractères'
    container.textContent = selecting
      ? `Sélection : ${words} ${wordLabel}, ${chars} ${charLabel}`
      : `${words} ${wordLabel}, ${chars} ${charLabel}`
  }

  const plugin = new Plugin({
    view(editorView) {
      view = editorView
      render()
      return {
        update: () => render(),
        destroy: () => {
          view = null
        },
      }
    },
  })

  return plugin
}
