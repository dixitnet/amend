// Le rangement personnel : dossiers et placement des documents (12/10/2026,
// server/rangement.js). Chaque route ne touche qu'au rangement de la
// personne connectée — il n'y a pas d'identifiant de compte dans l'adresse,
// donc rien à usurper.

import { readSession } from '../auth.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

export async function routesRangement(req, res, url, ctx) {
  const { pathname } = url
  const { rangements, storage } = ctx

  const dossiers = pathname === '/api/rangement/dossiers'
  const dossier = pathname.match(/^\/api\/rangement\/dossiers\/([A-Za-z0-9_-]+)$/)
  const document = pathname.match(/^\/api\/rangement\/documents\/([A-Za-z0-9_-]+)$/)
  if (pathname !== '/api/rangement' && !dossiers && !dossier && !document) return PAS_TRAITE

  const email = readSession(req)
  if (!email) return sendJson(res, 401, { error: 'connexion requise' })

  /** Les documents que la personne voit, corbeille comprise : le reste de son
   * rangement est oublié à la prochaine écriture. */
  const visibles = new Set([...storage.listDocs(email).map((d) => d.id), ...storage.listCorbeille(email).map((d) => d.id)])
  const vue = (r) => ({ dossiers: r.dossiers, placement: r.placement, favoris: r.favoris })

  if (pathname === '/api/rangement') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'méthode non permise' })
    return sendJson(res, 200, vue(rangements.elaguer(rangements.lire(email), visibles)))
  }

  if (dossiers) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'méthode non permise' })
    const body = await readJsonBody(req)
    const r = rangements.creerDossier(email, body.nom, typeof body.parent === 'string' ? body.parent : null, visibles)
    return sendJson(res, 201, { dossier: r.dossier, ...vue(r.rangement) })
  }

  if (dossier) {
    const id = dossier[1]
    if (req.method === 'DELETE') return sendJson(res, 200, vue(rangements.supprimerDossier(email, id, visibles)))
    if (req.method !== 'PATCH') return sendJson(res, 405, { error: 'méthode non permise' })
    const body = await readJsonBody(req)
    let r = null
    if (typeof body.nom === 'string') r = rangements.renommerDossier(email, id, body.nom, visibles)
    if ('parent' in body) r = rangements.deplacerDossier(email, id, typeof body.parent === 'string' ? body.parent : null, visibles)
    if (!r) return sendJson(res, 400, { error: 'rien à changer : donnez un nom ou un dossier parent' })
    return sendJson(res, 200, { dossier: r.dossier, ...vue(r.rangement) })
  }

  // PUT /api/rangement/documents/:id {dossier}
  if (req.method !== 'PUT') return sendJson(res, 405, { error: 'méthode non permise' })
  if (!visibles.has(document[1])) return sendJson(res, 404, { error: 'document introuvable' })
  const body = await readJsonBody(req)
  return sendJson(res, 200, vue(rangements.placerDocument(email, document[1], typeof body.dossier === 'string' ? body.dossier : null, visibles)))
}
