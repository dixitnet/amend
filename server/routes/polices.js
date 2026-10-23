// Les polices de l'instance (24/10/2026) : le catalogue pour tout le monde,
// la gestion pour les administrateurs. Voir server/polices.js.

import { createReadStream, statSync } from 'node:fs'
import { isAdminEmail, readSession } from '../auth.js'
import { FICHIER_MAX_OCTETS, PoliceInvalide } from '../polices.js'
import { appliquerCatalogue } from '../../shared/style.js'
import { sendJson, readBinaryBody, PAS_TRAITE } from '../http.js'

export async function routesPolices(req, res, url, ctx) {
  const { pathname } = url
  const { polices, typst, metrics } = ctx

  // Le catalogue : de quoi construire le menu de polices et les @font-face.
  // Il faut une session (les fichiers de polices ne sont pas publics : leur
  // licence est celle de l'instance), mais pas d'être administrateur.
  if (pathname === '/api/polices' && req.method === 'GET') {
    if (!readSession(req)) return sendJson(res, 401, { error: 'connexion requise' })
    res.setHeader('cache-control', 'no-cache')
    return sendJson(res, 200, { polices: polices.catalogue() })
  }

  const fichierMatch = pathname.match(/^\/api\/polices\/(i-[a-z0-9-]+)\/([A-Za-z0-9_.-]+)$/)
  if (fichierMatch && req.method === 'GET') {
    if (!readSession(req)) return sendJson(res, 401, { error: 'connexion requise' })
    const chemin = polices.chemin(fichierMatch[1], fichierMatch[2])
    if (!chemin) return sendJson(res, 404, { error: 'police introuvable' })
    // Le nom contient l'empreinte du contenu : un fichier remplacé change de nom,
    // celui-ci ne change donc jamais.
    res.writeHead(200, {
      'content-type': polices.typeDe(fichierMatch[2]),
      'content-length': statSync(chemin).size,
      'cache-control': 'private, max-age=31536000, immutable',
    })
    return createReadStream(chemin).pipe(res)
  }

  if (!pathname.startsWith('/api/admin/polices')) return PAS_TRAITE

  const admin = readSession(req)
  if (!isAdminEmail(admin)) return sendJson(res, 403, { error: 'réservé aux administrateurs' })

  if (pathname === '/api/admin/polices' && req.method === 'GET') {
    return sendJson(res, 200, polices.detail())
  }

  // Un fichier par requête, octets bruts (comme les images : pas de multipart).
  if (pathname === '/api/admin/polices' && req.method === 'POST') {
    let buffer
    try {
      buffer = await readBinaryBody(req, FICHIER_MAX_OCTETS)
    } catch (err) {
      if (err.status === 413) {
        return sendJson(res, 413, { error: `ce fichier dépasse ${Math.round(FICHIER_MAX_OCTETS / 1048576)} Mo` })
      }
      return sendJson(res, err.status || 400, { error: err.message })
    }
    let resultat
    try {
      resultat = polices.ajouter(buffer, { par: admin })
    } catch (err) {
      if (err instanceof PoliceInvalide) return sendJson(res, err.status, { error: err.message })
      throw err
    }
    // Garde-fou : la famille que nous avons lue doit être celle que Typst sait
    // nommer. Sinon le PDF retomberait en silence sur une autre police — c'est
    // précisément ce que le catalogue existe pour éviter.
    const vues = await typst.famillesVues()
    if (vues && !vues.has(resultat.police.famille.toLowerCase())) {
      polices.supprimerFichier(resultat.police.id, resultat.fichier.nom)
      appliquerCatalogue(polices.catalogue())
      return sendJson(res, 422, {
        error: `Typst ne reconnaît pas la famille « ${resultat.police.famille} » dans ce fichier : il n'a pas été gardé.`,
      })
    }
    appliquerCatalogue(polices.catalogue())
    metrics.log('polices', {
      type: 'ajout',
      email: admin,
      id: resultat.police.id,
      fichier: resultat.fichier.nom,
      octets: resultat.fichier.octets,
    })
    return sendJson(res, 201, {
      police: resultat.police,
      fichier: resultat.fichier,
      cree: resultat.cree,
      remplace: resultat.remplace,
    })
  }

  const suppression = pathname.match(/^\/api\/admin\/polices\/(i-[a-z0-9-]+)(?:\/([A-Za-z0-9_.-]+))?$/)
  if (suppression && req.method === 'DELETE') {
    const [, id, nom] = suppression
    const fait = nom ? polices.supprimerFichier(id, nom) : polices.supprimer(id)
    if (!fait) return sendJson(res, 404, { error: 'police introuvable' })
    appliquerCatalogue(polices.catalogue())
    metrics.log('polices', { type: 'suppression', email: admin, id, fichier: nom || null })
    return sendJson(res, 200, { ok: true })
  }

  return PAS_TRAITE
}
