// Contrôle de l'en-tête `Origin` (audit S13, 10/10/2026).
//
// Seul `SameSite=Lax` protégeait les requêtes qui modifient : un formulaire
// posé sur un autre site et dirigé vers `POST /api/invitations/<jeton de
// l'attaquant>` connecte la victime au compte de l'attaquant (fixation de
// session). Les navigateurs envoient `Origin` sur toute requête qui n'est
// pas un simple GET et sur la poignée de main d'une WebSocket : le comparer
// à nous-mêmes ferme la porte, sans jeton à gérer côté client.
//
// Règle, volontairement courte :
//   - pas d'`Origin` : ce n'est pas un navigateur qui part d'une autre page
//     (curl, scripts, tests, connecteurs) — on s'en remet à `Sec-Fetch-Site`
//     quand il est là, et on laisse passer sinon ;
//   - un `Origin` : il doit être celui de l'application (`APP_BASE_URL`),
//     ou celui de l'hôte auquel la requête s'adresse (le serveur de
//     développement de Vite, un second nom du même site) ;
//   - `Origin: null` (iframe isolée, redirection entre sites) est refusé.

const METHODES_QUI_MODIFIENT = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function methodeModifie(methode) {
  return METHODES_QUI_MODIFIENT.has(String(methode || '').toUpperCase())
}

function hoteDe(origine) {
  try {
    return new URL(origine).host
  } catch {
    return null
  }
}

/** `true` si la requête peut passer. `req` : { headers }. */
export function origineAutorisee(req, appBaseUrl) {
  const origine = req.headers.origin
  if (origine === undefined) {
    return String(req.headers['sec-fetch-site'] || '') !== 'cross-site'
  }
  const hote = hoteDe(origine)
  if (!hote) return false // « null », ou illisible
  const siennes = new Set()
  const base = hoteDe(appBaseUrl)
  if (base) siennes.add(base)
  if (req.headers.host) siennes.add(String(req.headers.host))
  return siennes.has(hote)
}
