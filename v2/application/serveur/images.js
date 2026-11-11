// Les images d'un document (couche application, lots du 11/11/2026, lot B),
// sur le modèle de Docs (`attachment_upload`, `media-auth`) : envoyer une image
// (qui écrit ou suggère : un correcteur peut proposer une image), la lire (qui
// lit le document). Les règles (types, poids, noms) sont dans le domaine ; le
// dépôt garde les octets ; réponses en codes.
//
//   POST /api/documents/:doc/images          corps : l'image (octets)  → { url }
//   GET  /api/documents/:doc/images/:nom     l'image
import { randomBytes } from 'node:crypto'
import {
  capacites,
  identifiantDocument,
  refusImage,
  typeImage,
  nomImageValide,
  IMAGE_MAX_OCTETS,
} from '../../domaine/index.js'
import { decoder } from './adresse.js'

/** Lit le corps brut, sans dépasser `max` octets (au-delà : `null`, et rien
 * de plus n'est gardé ; la connexion se ferme après la réponse). */
function lireOctets(req, max) {
  return new Promise((resolve, reject) => {
    const morceaux = []
    let taille = 0
    req.on('data', (m) => {
      taille += m.length
      if (taille > max) {
        morceaux.length = 0
        req.removeAllListeners('data')
        req.pause()
        return resolve(null)
      }
      morceaux.push(m)
    })
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(morceaux))))
    req.on('error', reject)
  })
}

/**
 * @param {object} o
 * @param {(req: any) => Promise<{ id: string } | null>} o.personneDe
 * @param {(docId: string, idPersonne: string) => Promise<string | null>} o.roleSur
 * @param {any} o.depot  le dépôt des comptes (adaptateur PostgreSQL)
 * @param {(res: any, statut: number, corps: any) => void} o.json
 */
export function creerImages({ personneDe, roleSur, depot, json }) {
  return async function traiter(req, res, url) {
    const m = url.pathname.match(/^\/api\/documents\/([^/]+)\/images(?:\/([^/]+))?$/)
    if (!m) return false
    const err = (statut, code) => (json(res, statut, { code }), true)
    const p = await personneDe(req)
    if (!p) return err(401, 'session-absente')
    const brut = decoder(m[1])
    if (brut === null) return err(400, 'requete-invalide')
    const d = identifiantDocument(brut)
    if (!d.ok) return err(400, d.code)
    const caps = capacites(await roleSur(d.id, p.id))
    if (!caps.includes('lire')) return err(404, 'document-introuvable')
    const nom = m[2]

    if (nom !== undefined) {
      if (req.method !== 'GET') return err(405, 'methode-refusee')
      if (!nomImageValide(nom)) return err(404, 'introuvable')
      const image = await depot.image(d.id, nom)
      if (!image) return err(404, 'introuvable')
      // Un nom n'est jamais réutilisé : l'image ne change pas, le navigateur la garde.
      res.writeHead(200, {
        'content-type': image.type,
        'content-length': image.octets.length,
        'cache-control': 'private, max-age=31536000, immutable',
        'content-disposition': 'inline',
      })
      return (res.end(image.octets), true)
    }

    if (req.method !== 'POST') return err(405, 'methode-refusee')
    if (!caps.includes('ecrire') && !caps.includes('suggerer')) return err(403, 'droit-insuffisant')
    const octets = await lireOctets(req, IMAGE_MAX_OCTETS)
    if (octets === null) {
      // Le reste du corps n'est pas lu : la connexion se ferme une fois la réponse partie.
      res.on('finish', () => req.destroy())
      json(res, 413, { code: 'image-trop-lourde' }, { connection: 'close' })
      return true
    }
    const refus = refusImage(octets, await depot.poidsImages(d.id))
    if (refus) return err(refus === 'image-type-refuse' || refus === 'image-vide' ? 400 : 413, refus)
    const t = typeImage(octets)
    const leNom = `${randomBytes(16).toString('hex')}.${t.extension}`
    await depot.garderImage(d.id, leNom, t.type, octets, p.id)
    json(res, 201, { url: `/api/documents/${encodeURIComponent(d.id)}/images/${leNom}` })
    return true
  }
}
