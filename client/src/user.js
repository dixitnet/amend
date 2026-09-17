// La même palette que le serveur (server/users.js), tenue à jour à la
// main. **Aucun vert** : il est réservé à l'IA (AI_USER plus bas), qui est
// aussi l'accent de l'application — une personne qui en hériterait verrait
// ses modifications se confondre avec les siennes dans la marge.
const COLORS = ['#e07a5f', '#3d5a80', '#8d6e63', '#f2cc8f', '#9b5de5', '#00b4d8', '#e56b6f', '#c9184a']

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

// Plus rien n'écrit dans le localStorage depuis le 16/09/2026 : le nom et
// la couleur appartiennent au compte (server/users.js). Les deux clés
// laissées par l'ancienne version ne sont plus que relues une fois, pour ne
// pas redemander son nom à quelqu'un qui en avait déjà un.

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
      // La couleur proposée ici n'est qu'un repli : celle qui fait foi est
      // tirée par le serveur et revient avec l'enregistrement du nom.
      overlay.remove()
      resolve({ name, color: randomColor() })
    })
  })
}

/** L'identité de la personne pour ce document.
 *
 * Le nom et la couleur vivent sur le **compte** depuis le 16/09/2026
 * (server/users.js), plus dans le localStorage : la même personne était
 * sinon nommée et colorée différemment sur chacun de ses appareils, et dans
 * un document en suivi de modifications c'est la couleur qu'on lit d'un coup
 * d'œil. D'où l'ordre ci-dessous.
 *
 *  1. le compte a un nom → on le prend, aucune question ;
 *  2. le compte n'en a pas mais ce navigateur en a un (version d'avant) →
 *     on l'adopte et on l'enregistre sur le compte, toujours aucune
 *     question ;
 *  3. sinon → on le demande, une seule fois dans la vie du compte.
 *
 * La couleur est tirée au sort par le serveur à la création du compte et
 * n'en bouge plus. Permettre à la personne de changer l'un et l'autre reste
 * à faire (noté avec Sylvain le 16/09 : après les tests utilisateurs).
 *
 * `compte` : `{ nom, couleur }` venu des métadonnées du document, `nom`
 * valant `null` tant que rien n'a été choisi. Si l'enregistrement échoue
 * (réseau, session expirée), on continue avec le nom saisi plutôt que de
 * bloquer l'ouverture du document — il sera redemandé la prochaine fois. */
export async function getUser(compte) {
  if (compte && compte.nom) return { name: compte.nom, color: compte.couleur || randomColor() }

  const herite = readStored()
  const user = herite || (await promptForUser())
  const enregistre = await enregistrerNom(user.name)
  return enregistre ? { name: enregistre.nom, color: enregistre.couleur } : user
}

/** Enregistre le nom sur le compte ; renvoie `{nom, couleur}` ou `null`. */
async function enregistrerNom(nom) {
  try {
    const res = await fetch('/api/auth/name', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nom }),
    })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

// Vert amande — la couleur identitaire de l'appli (voir --accent dans
// style.css) — utilisée notamment pour surligner les propositions de l'IA,
// pour bien les distinguer des couleurs personnelles des autres personnes.
export const AI_USER = { name: 'IA', color: '#5f7a4a' }
