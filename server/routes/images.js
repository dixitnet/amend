// Les images collées dans un document.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { createReadStream, statSync } from 'node:fs'
import { isAdminEmail, readSession } from '../auth.js'
import { capabilities } from '../roles.js'
import { sendJson, readBinaryBody, PAS_TRAITE } from '../http.js'

export async function routesImages(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, storage, uploads, imagesMaxParCompte } = ctx

  const depotImageMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/images$/)
  if (depotImageMatch && req.method === 'POST') {
    const id = depotImageMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    // Une image est un nœud, donc hors suivi des modifications : un
    // correcteur n'en ajoute pas (même règle que les lignes de tableau, et
    // même règle que celle appliquée côté éditeur dans client/src/images.js
    // — celle-ci est la vraie, l'autre n'est qu'une commodité).
    if (!capabilities(storage.roleFor(id, email)).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const mime = String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim()
    if (!uploads.typeAccepte(mime)) {
      return sendJson(res, 415, { error: "format d'image non accepté (png ou jpeg)" })
    }
    let buffer
    try {
      buffer = await readBinaryBody(req, uploads.maxImageOctets)
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message })
    }
    // Le poids des images est celui de tous les documents du propriétaire, pas
    // d'un seul (S14) : c'est son disque qui se remplit.
    const proprio = storage.ownerOf(id)
    if (proprio && !isAdminEmail(proprio)) {
      const dejaLa = storage
        .documentsDe(proprio, { avecCorbeille: true })
        .reduce((somme, docId) => somme + uploads.octetsDocument(docId), 0)
      if (dejaLa + buffer.length > imagesMaxParCompte()) {
        return sendJson(res, 413, {
          error: `le propriétaire de ce document a atteint sa limite d’images (${Math.round(imagesMaxParCompte() / 1048576)} Mo en tout)`,
        })
      }
    }
    let enregistree
    try {
      enregistree = uploads.enregistrer(id, buffer, mime)
    } catch (err) {
      return sendJson(res, err.status || 500, { error: err.message })
    }
    metrics.log('images', { email, docId: id, octets: enregistree.octets })
    return sendJson(res, 201, {
      src: `/api/docs/${id}/images/${enregistree.nom}`,
      nom: enregistree.nom,
      octets: enregistree.octets,
    })
  }

  const imageMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/images\/([A-Za-z0-9_.-]+)$/)
  if (imageMatch && req.method === 'GET') {
    const id = imageMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    if (!storage.roleFor(id, readSession(req))) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    const chemin = uploads.chemin(id, imageMatch[2])
    if (!chemin) return sendJson(res, 404, { error: 'image introuvable' })
    // `private` : le nom d'une image est aléatoire et ne sert qu'une fois,
    // donc immuable — mais elle reste du contenu de document, jamais à
    // mettre dans un cache partagé.
    res.writeHead(200, {
      'content-type': uploads.typeDe(imageMatch[2]),
      'content-length': statSync(chemin).size,
      'cache-control': 'private, max-age=31536000, immutable',
    })
    return createReadStream(chemin).pipe(res)
  }

  return PAS_TRAITE
}
