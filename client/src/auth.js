// Session (email) et jetons — côté client. Voir server/auth.js et
// claude/conception-gestion-utilisateurs.md (projet Amend).

let cachedEmail // undefined = pas encore vérifié, null = pas connecté

export async function getSessionEmail() {
  if (cachedEmail !== undefined) return cachedEmail
  const res = await fetch('/api/auth/me')
  const data = await res.json()
  cachedEmail = data.email || null
  return cachedEmail
}

export function forgetSessionCache() {
  cachedEmail = undefined
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

export async function fetchInvite(token) {
  const res = await fetch(`/api/invite/${token}`)
  if (!res.ok) return null
  return res.json()
}

/** Renvoie l'id du document si l'invitation est acceptée, sinon null. */
export async function acceptInvite(token, email) {
  const res = await fetch(`/api/invite/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) return null
  const data = await res.json()
  forgetSessionCache()
  return data.docId
}
