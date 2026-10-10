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

export async function logout() {
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
