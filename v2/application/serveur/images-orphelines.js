// L'analyse des images orphelines (couche application, 14/11/2026 ; Sylvain :
// B5, l'analyse seulement, rien n'est supprimé). Réservée aux administrateurs.
// Les règles sont celles du domaine (`imagesOrphelines.js`) : le nom d'une image
// se cherche dans l'état de chaque document (texte et suggestions, par y/hub).
//
//   GET /api/admin/images-orphelines   le rapport
import { nomsCites, analyserImages } from '../../domaine/index.js'

/**
 * @param {object} o
 * @param {(req: any) => Promise<{ id: string } | null>} o.personneDe
 * @param {(p: { id: string }) => Promise<boolean>} o.administrateur
 * @param {any} o.depot  le dépôt des comptes (adaptateur PostgreSQL)
 * @param {{ lireTexte: (id: string) => Promise<Uint8Array>, lireSuggestions: (id: string) => Promise<Uint8Array> }} o.collaboration
 * @param {(res: any, statut: number, corps: any) => void} o.json
 * @param {() => number} [o.maintenant]
 */
export function creerImagesOrphelines({
  personneDe,
  administrateur,
  depot,
  collaboration,
  json,
  maintenant = Date.now,
}) {
  return async function traiter(req, res, url) {
    if (url.pathname !== '/api/admin/images-orphelines') return false
    const err = (statut, code) => (json(res, statut, { code }), true)
    const p = await personneDe(req)
    if (!p) return err(401, 'session-absente')
    if (!(await administrateur(p))) return err(403, 'reserve-administrateur')
    if (req.method !== 'GET') return err(405, 'methode-refusee')
    const [images, documents] = await Promise.all([depot.toutesLesImages(), depot.tousLesDocuments()])
    const citees = new Set()
    // Les documents qu'on n'a pas pu lire : on ne sait pas ce qu'ils citent, le rapport le dit.
    const illisibles = []
    // Rien à chercher sans image : pas la peine de lire les documents.
    if (images.length)
      for (const id of documents) {
        try {
          for (const etat of [await collaboration.lireTexte(id), await collaboration.lireSuggestions(id)])
            for (const nom of nomsCites(etat)) citees.add(nom)
        } catch {
          illisibles.push(id)
        }
      }
    json(res, 200, {
      ...analyserImages({ images, citees, maintenant: maintenant() }),
      documentsLus: documents.length - illisibles.length,
      documentsIllisibles: illisibles.length,
    })
    return true
  }
}
