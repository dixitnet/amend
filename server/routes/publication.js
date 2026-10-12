// Publier un document sur le web.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { isAdminEmail, readSession } from '../auth.js'
import { peutPublier, porteePublication } from '../publication.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

// La publication poste le document entier, en blocs structurés : même ordre
// de grandeur que la source Typst. Elle lisait jusqu'ici avec la limite par
// défaut, celle d'un champ de formulaire — 20 ko, soit une dizaine de
// paragraphes. Au-delà, le corps était refusé et, comme la socket était
// coupée sans réponse (voir readJsonBody), Caddy renvoyait 502. Signalé en
// production par Sylvain le 23/09/2026.
const MAX_PUBLICATION_BODY = 4_000_000

export async function routesPublication(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, publications, storage, APP_BASE_URL } = ctx

  // --- Publier sur le web (17/09/2026, voir server/publication.js) ---
  //
  // Qui peut publier vient du .env (`PUBLICATION_WEB`) : `admins` pendant
  // la phase de test, `proprietaires` ou `editeurs` ensuite. L'ouverture
  // était prévue dès le premier jour, c'est un changement de configuration
  // et pas de code.
  const pubMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/publication$/)
  if (pubMatch) {
    const id = pubMatch[1]
    const doc = storage.getDoc(id)
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    const role = storage.roleFor(id, email)
    if (!role) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    const autorise = peutPublier({
      admin: isAdminEmail(email),
      proprietaire: storage.isOwner(id, email),
      role,
    })

    if (req.method === 'GET') {
      const etat = publications.pourDocument(id)
      return sendJson(res, 200, {
        publiee: !!etat,
        url: etat ? `${APP_BASE_URL}/p/${etat.pubId}` : null,
        publieLe: etat ? etat.publieLe : null,
        majLe: etat ? etat.majLe : null,
        // Le client n'a pas à deviner s'il doit montrer le bouton.
        autorise,
        portee: porteePublication(),
      })
    }

    if (req.method === 'PUT') {
      if (!autorise) {
        return sendJson(res, 403, { error: 'la publication est réservée aux administrateurs pour l’instant' })
      }
      const body = await readJsonBody(req, MAX_PUBLICATION_BODY)
      if (!Array.isArray(body.blocs)) return sendJson(res, 400, { error: 'document illisible' })
      if (body.blocs.length > 20000) return sendJson(res, 413, { error: 'document trop volumineux à publier' })
      const etat = publications.publier(id, { titre: body.titre || doc.title, blocs: body.blocs })
      metrics.log('publication', { email, docId: id, pubId: etat.pubId, octets: etat.octets })
      return sendJson(res, 200, { publiee: true, url: `${APP_BASE_URL}/p/${etat.pubId}`, ...etat })
    }

    if (req.method === 'DELETE') {
      if (!autorise) return sendJson(res, 403, { error: 'réservé aux administrateurs pour l’instant' })
      const retiree = publications.depublier(id)
      if (retiree) metrics.log('publication', { email, docId: id, retiree: true })
      return sendJson(res, 200, { publiee: false })
    }
  }

  return PAS_TRAITE
}
