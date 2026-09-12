// "Qui est connecté" — a small row of colored initials in the top banner,
// built from the same Yjs awareness state that already drives the named,
// colored remote cursors (editor.js's buildCursor) and tracked-changes
// attribution. Deliberately counts connections, not people: the reliability
// report's constat 1.4 found the server's own presence count doesn't (and
// shouldn't) deduplicate by name, since the app's account model allows
// several people to share one account/name — showing one chip per
// connection is the honest picture, not an approximation of "headcount".

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Mounts a live "who's here" strip into `container`, fed by `provider`'s
 * awareness state (local + every remote peer currently connected to this
 * document). Returns { destroy() } to unhook the awareness listener when
 * the editor unmounts. */
export function mountPresenceBar(container, provider) {
  container.classList.add('presence-bar')

  function render() {
    const states = Array.from(provider.awareness.getStates().values())
    container.innerHTML = ''
    for (const state of states) {
      const user = state?.user
      if (!user || !user.name) continue
      const chip = document.createElement('span')
      chip.className = 'presence-avatar'
      chip.style.setProperty('--user-color', user.color || '#888')
      chip.textContent = initials(user.name)
      chip.title = user.name
      container.appendChild(chip)
    }
  }

  provider.awareness.on('change', render)
  render()

  return {
    destroy() {
      provider.awareness.off('change', render)
    },
  }
}
