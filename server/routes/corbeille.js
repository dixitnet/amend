// La corbeille : voir, restaurer, supprimer pour de bon (12/10/2026,
// claude/conception-dossiers-corbeille.md §6). Le propriétaire seul, comme
// pour la mise à la corbeille elle-même.

import { isAdminEmail, readSession } from '../auth.js'
import { sendJson, PAS_TRAITE } from '../http.js'
import { supprimerDefinitivement } from '../corbeille.js'

export async function routesCorbeille(req, res, url, ctx) {
  const { pathname } = url
  const { storage, documentsMaxParCompte } = ctx

  const un = pathname.match(/^\/api\/corbeille\/([A-Za-z0-9_-]+)(?:\/(restauration))?$/)
  if (pathname !== '/api/corbeille' && !un) return PAS_TRAITE

  const email = readSession(req)
  if (!email) return sendJson(res, 401, { error: 'connexion requise' })

  // La corbeille de la personne.
  if (pathname === '/api/corbeille' && req.method === 'GET') {
    return sendJson(res, 200, { documents: storage.listCorbeille(email) })
  }

  // Vider la corbeille : tout ce qu'elle contient, définitivement.
  if (pathname === '/api/corbeille' && req.method === 'DELETE') {
    const ids = storage.listCorbeille(email).map((d) => d.id)
    for (const id of ids) supprimerDefinitivement(ctx, id, email)
    return sendJson(res, 200, { ok: true, supprimes: ids.length })
  }
  if (pathname === '/api/corbeille') return sendJson(res, 405, { error: 'méthode non permise' })

  const id = un[1]
  const action = un[2]
  // Ni l'existence d'un document, ni sa présence dans la corbeille de quelqu'un
  // d'autre ne se devinent : même réponse dans les deux cas.
  if (!storage.estALaCorbeille(id) || storage.ownerOf(id) !== email) {
    return sendJson(res, 404, { error: 'document introuvable dans la corbeille' })
  }

  if (action === 'restauration' && req.method === 'POST') {
    // Un document restauré redevient un document du compte : le quota de
    // documents s'applique de nouveau.
    if (!isAdminEmail(email) && storage.documentsDe(email).length >= documentsMaxParCompte()) {
      return sendJson(res, 403, {
        error: `limite de ${documentsMaxParCompte()} documents par compte atteinte — supprimez-en pour en restaurer d’autres`,
      })
    }
    const doc = storage.restaurerDeLaCorbeille(id)
    ctx.metrics.log('corbeille', { email, docId: id, geste: 'restaurer' })
    return sendJson(res, 200, { id, title: doc.title })
  }

  if (!action && req.method === 'DELETE') {
    return sendJson(res, 200, { ok: supprimerDefinitivement(ctx, id, email) })
  }
  return sendJson(res, 405, { error: 'méthode non permise' })
}
