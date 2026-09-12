const COLORS = ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#9b5de5', '#00b4d8', '#e56b6f', '#588157']

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

function readStored() {
  try {
    const name = localStorage.getItem('collabtext:name') || ''
    const color = localStorage.getItem('collabtext:color') || ''
    return name ? { name, color: color || randomColor() } : null
  } catch {
    return null
  }
}

function store(user) {
  try {
    localStorage.setItem('collabtext:name', user.name)
    localStorage.setItem('collabtext:color', user.color)
  } catch {
    // localStorage unavailable (private mode, embedded context...) — the
    // name just won't be remembered for next time.
  }
}

/** The current browser's stored identity, if we've already asked for one. */
export function getStoredUser() {
  return readStored()
}

/**
 * Asks for a display name via an in-page form (not window.prompt(), which
 * some browser/embedded contexts block or refuse) and returns a Promise
 * that resolves once the person submits it.
 */
export function promptForUser() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'name-modal-overlay'
    overlay.innerHTML = `
      <form class="name-modal">
        <h2>Ton nom</h2>
        <p>Affiché aux autres personnes qui éditent ce texte.</p>
        <input type="text" maxlength="40" placeholder="ex. Sylvain" autofocus />
        <button type="submit">Continuer</button>
      </form>
    `
    document.body.appendChild(overlay)
    const form = overlay.querySelector('form')
    const input = overlay.querySelector('input')
    input.focus()
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const name = (input.value || 'Anonyme').trim().slice(0, 40) || 'Anonyme'
      const user = { name, color: randomColor() }
      store(user)
      overlay.remove()
      resolve(user)
    })
  })
}

/** Returns the stored identity, or asks for one if there isn't one yet. */
export async function getUser() {
  return readStored() || promptForUser()
}

// Vert amande — la couleur identitaire de l'appli (voir --accent dans
// style.css) — utilisée notamment pour surligner les propositions de l'IA,
// pour bien les distinguer des couleurs personnelles des autres personnes.
export const AI_USER = { name: 'IA', color: '#5f7a4a' }
