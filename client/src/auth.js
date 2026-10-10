// Session (email) et jetons — côté client. Voir server/auth.js et
// claude/conception-gestion-utilisateurs.md (projet Amend).

let cachedEmail // undefined = pas encore vérifié, null = pas connecté
let generation = 0 // change à chaque ouverture ou fermeture de session

export async function getSessionEmail() {
  if (cachedEmail !== undefined) return cachedEmail
  const depart = generation
  const res = await fetch('/api/auth/me')
  const data = await res.json()
  const email = data.email || null
  // Une session ouverte pendant que cette requête était en vol (invitation
  // acceptée au chargement de la page) la rend périmée : on ne la met pas en
  // cache, sous peine de figer « non connecté » après la connexion.
  if (depart === generation) cachedEmail = email
  return email
}

export function forgetSessionCache() {
  generation++
  cachedEmail = undefined
}

/** Ce que ce navigateur garde de la personne qui part (audit C19) : les
 * conversations avec Margo (`amend.dialogue.<document>`, en sessionStorage —
 * des extraits du document) et les anciennes clés du nom et de la couleur
 * (`collabtext:name`, `collabtext:color`, d'avant les comptes). Les réglages
 * d'affichage (zoom, numéros de bloc) restent. */
export function effacerTracesLocales() {
  try {
    const cles = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const cle = sessionStorage.key(i)
      if (cle && cle.startsWith('amend.dialogue.')) cles.push(cle)
    }
    for (const cle of cles) sessionStorage.removeItem(cle)
  } catch {
    /* stockage indisponible (navigation privée, bloqué) : rien à effacer */
  }
  try {
    localStorage.removeItem('collabtext:name')
    localStorage.removeItem('collabtext:color')
  } catch {
    /* idem */
  }
}

export async function logout() {
  effacerTracesLocales()
  await fetch('/api/auth/logout', { method: 'POST' })
  forgetSessionCache()
}

export async function requestReconnectLink(email) {
  await fetch('/api/auth/request-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

/** Renvoie l'email si le jeton est valide, sinon null. */
export async function verifyReconnectToken(token) {
  const res = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) return null
  const data = await res.json()
  forgetSessionCache()
  return data.email
}

/** Déconnecte cette adresse de tous ses appareils (S8) : le serveur révoque
 * les sessions émises jusqu'ici et coupe les connexions ouvertes. */
export async function logoutEverywhere() {
  effacerTracesLocales()
  const res = await fetch('/api/auth/logout-all', { method: 'POST' })
  forgetSessionCache()
  return res.ok
}

/** Accepte une invitation nominative : le jeton porte à lui seul
 * l'identité (il a été envoyé à une adresse précise), il n'y a donc plus
 * d'email à déclarer — le serveur ouvre la session et renvoie le document.
 * Renvoie { docId } en cas de succès, { error } sinon. */
export async function acceptInvitation(token) {
  const res = await fetch(`/api/invitations/${token}`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error || 'invitation invalide' }
  forgetSessionCache()
  return { docId: data.docId, email: data.email, role: data.role }
}
