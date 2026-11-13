// Les polices de l'instance (couche application, 13/11/2026 ; Sylvain : « un
// onglet sur la gestion des polices permettant d'uploader »). Docs n'a rien de
// tel (pas de modèles d'export). Les administrateurs de l'instance envoient
// des fichiers `.ttf` ou `.otf` ; la famille et le style sont lus dans le
// fichier (domaine) ; les octets vont dans la base, comme les images. Qui est
// connecté lit un fichier : l'export PDF, fait dans le navigateur, en a besoin.
//
//   GET    /api/admin/polices        les familles, leurs fichiers, ce qui leur manque, qui s'en sert
//   POST   /api/admin/polices        corps : le fichier (octets) ; en-tête x-amend-fichier : son nom
//   DELETE /api/admin/polices/:id    un fichier (refusé pour le dernier d'une famille utilisée)
//   GET    /api/polices/:id          le fichier
import { lirePolice, nomFichierPolice, famillesDePolices, POLICE_MAX_OCTETS } from '../../domaine/index.js'
import { decoder } from './adresse.js'

/** Lit le corps brut, sans dépasser `max` octets (au-delà : `null`). */
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
 * @param {(p: { id: string }) => Promise<boolean>} o.administrateur
 * @param {any} o.depot  le dépôt des comptes (adaptateur PostgreSQL)
 * @param {string[]} o.reservees  les familles fournies avec amend.ink
 * @param {(res: any, statut: number, corps: any) => void} o.json
 */
export function creerPolices({ personneDe, administrateur, depot, reservees, json }) {
  return async function traiter(req, res, url) {
    const m = url.pathname.match(/^\/api\/(admin\/)?polices(?:\/([^/]+))?$/)
    if (!m) return false
    const err = (statut, code, plus = {}) => (json(res, statut, { code, ...plus }), true)
    const p = await personneDe(req)
    if (!p) return err(401, 'session-absente')
    const id = m[2] === undefined ? undefined : decoder(m[2])
    if (id === null) return err(400, 'requete-invalide')

    // Le fichier, pour qui est connecté.
    if (!m[1]) {
      if (id === undefined || req.method !== 'GET') return err(405, 'methode-refusee')
      const octets = await depot.octetsPolice(id)
      if (!octets) return err(404, 'introuvable')
      // Un identifiant n'est jamais réutilisé : le navigateur garde le fichier.
      res.writeHead(200, {
        'content-type': 'font/sfnt',
        'content-length': octets.length,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      })
      res.end(octets)
      return true
    }

    if (!(await administrateur(p))) return err(403, 'reserve-administrateur')
    const fichiers = await depot.polices()
    if (id === undefined) {
      if (req.method === 'GET') {
        const familles = []
        for (const f of famillesDePolices(fichiers))
          familles.push({ ...f, modeles: await depot.modelesUtilisantPolice(f.famille) })
        return (json(res, 200, { familles, fournies: reservees, max: POLICE_MAX_OCTETS }), true)
      }
      if (req.method !== 'POST') return err(405, 'methode-refusee')
      const octets = await lireOctets(req, POLICE_MAX_OCTETS)
      if (octets === null) return err(413, 'police-trop-lourde')
      const lue = lirePolice(octets)
      if (!lue.ok) return err(400, lue.code)
      // Une famille fournie avec amend.ink ne se complète ni ne se remplace.
      if (reservees.includes(lue.famille)) return err(409, 'police-reservee', { famille: lue.famille })
      if (fichiers.some((f) => f.famille === lue.famille && f.style === lue.style && f.graisse === lue.graisse))
        return err(409, 'police-en-double', { famille: lue.famille })
      const nom = nomFichierPolice(decoder(String(req.headers['x-amend-fichier'] ?? '')) ?? '') || `${lue.famille}.ttf`
      const nouveau = await depot.garderPolice({ ...lue, fichier: nom }, octets, p.id)
      console.log(`[admin] police envoyée : ${lue.famille}, ${lue.style} (${octets.length} octets)`)
      return (json(res, 201, { id: nouveau, famille: lue.famille, style: lue.style }), true)
    }

    if (req.method !== 'DELETE') return err(405, 'methode-refusee')
    const fichier = fichiers.find((f) => f.id === id)
    if (!fichier) return err(404, 'introuvable')
    // Le dernier fichier d'une famille qu'un modèle utilise ne part pas : le
    // modèle ne pourrait plus se composer.
    if (fichiers.filter((f) => f.famille === fichier.famille).length === 1) {
      const modeles = await depot.modelesUtilisantPolice(fichier.famille)
      if (modeles.length) return err(409, 'police-utilisee', { famille: fichier.famille, modeles })
    }
    await depot.supprimerPolice(id)
    console.log(`[admin] police supprimée : ${fichier.famille}, ${fichier.style}`)
    return (json(res, 200, {}), true)
  }
}
