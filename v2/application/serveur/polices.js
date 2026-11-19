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
//   PATCH  /api/admin/polices/famille/:nom   corps { actif } : active ou désactive une famille, y compris une famille fournie avec amend.ink (15/11/2026)
//   DELETE /api/admin/polices/famille/:nom   toute une famille (refusé si un modèle s'en sert)
//   GET    /api/polices/:id          le fichier
import { lirePolice, nomFichierPolice, famillesDePolices, POLICE_MAX_OCTETS } from '../../domaine/index.js'
import { decoder } from './adresse.js'
import { lireOctets } from './octets.js'

/** Le réglage de l'instance qui garde les familles fournies que l'on a désactivées. */
export const REGLAGE_DESACTIVEES = 'polices.desactivees'

/**
 * @param {object} o
 * @param {(req: any) => Promise<{ id: string } | null>} o.personneDe
 * @param {(p: { id: string }) => Promise<boolean>} o.administrateur
 * @param {any} o.depot  le dépôt des comptes (adaptateur PostgreSQL)
 * @param {string[]} o.reservees  les familles fournies avec amend.ink
 * @param {(famille: string) => Promise<string[]>} o.modelesUtilisant  les noms des modèles dont la police résolue est cette famille (écarts et héritage)
 * @param {(res: any, statut: number, corps: any) => void} o.json
 * @param {(req: any) => Promise<any>} o.lireJson  le corps JSON de la requête
 */
export function creerPolices({ personneDe, administrateur, depot, reservees, modelesUtilisant, json, lireJson }) {
  return async function traiter(req, res, url) {
    const m = url.pathname.match(/^\/api\/(admin\/)?polices(?:\/famille\/([^/]+)|\/([^/]+))?$/)
    if (!m) return false
    const err = (statut, code, plus = {}) => (json(res, statut, { code, ...plus }), true)
    const p = await personneDe(req)
    if (!p) return err(401, 'session-absente')
    const nomFamille = m[2] === undefined ? undefined : decoder(m[2])
    const id = m[3] === undefined ? undefined : decoder(m[3])
    if (id === null || nomFamille === null) return err(400, 'requete-invalide')

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
    if (id === undefined && nomFamille === undefined) {
      if (req.method === 'GET') {
        const familles = []
        for (const f of famillesDePolices(fichiers)) familles.push({ ...f, modeles: await modelesUtilisant(f.famille) })
        // Les familles fournies : on ne peut que les désactiver (leurs fichiers font partie de l'application).
        const off = new Set((await depot.reglage(REGLAGE_DESACTIVEES)) ?? [])
        const fournies = []
        for (const famille of reservees)
          fournies.push({ famille, actif: !off.has(famille), modeles: await modelesUtilisant(famille) })
        return (json(res, 200, { familles, fournies, max: POLICE_MAX_OCTETS }), true)
      }
      if (req.method !== 'POST') return err(405, 'methode-refusee')
      const octets = await lireOctets(req, POLICE_MAX_OCTETS)
      if (octets === null) {
        // La réponse part, puis la connexion se ferme : le reste n'est pas lu.
        req.socket?.setTimeout?.(1000)
        return err(413, 'police-trop-lourde')
      }
      const lue = lirePolice(octets)
      if (!lue.ok) return err(400, lue.code)
      // Une famille fournie avec amend.ink ne se complète ni ne se remplace.
      if (reservees.includes(lue.famille)) return err(409, 'police-reservee', { famille: lue.famille })
      if (fichiers.some((f) => f.famille === lue.famille && f.style === lue.style && f.graisse === lue.graisse))
        return err(409, 'police-en-double', { famille: lue.famille })
      const nom = nomFichierPolice(decoder(String(req.headers['x-amend-fichier'] ?? '')) ?? '') || `${lue.famille}.ttf`
      const nouveau = await depot.garderPolice({ ...lue, fichier: nom }, octets, p.id)
      if (!nouveau) return err(409, 'police-en-double', { famille: lue.famille })
      console.log(`[admin] police envoyée : ${lue.famille}, ${lue.style} (${octets.length} octets)`)
      return (json(res, 201, { id: nouveau, famille: lue.famille, style: lue.style }), true)
    }

    // Une famille entière : l'activer ou la désactiver, ou la supprimer.
    if (nomFamille !== undefined) {
      const fournie = reservees.includes(nomFamille)
      if (!fournie && !fichiers.some((f) => f.famille === nomFamille)) return err(404, 'introuvable')
      if (req.method === 'PATCH') {
        const corps = await lireJson(req).catch(() => null)
        if (typeof corps?.actif !== 'boolean') return err(400, 'requete-invalide')
        if (fournie) {
          const off = new Set((await depot.reglage(REGLAGE_DESACTIVEES)) ?? [])
          if (corps.actif) off.delete(nomFamille)
          else off.add(nomFamille)
          await depot.definirReglage(REGLAGE_DESACTIVEES, [...off].sort(), p.id)
        } else await depot.activerFamille(nomFamille, corps.actif)
        console.log(`[admin] police ${corps.actif ? 'activée' : 'désactivée'} : ${nomFamille}`)
        return (json(res, 200, {}), true)
      }
      if (req.method !== 'DELETE') return err(405, 'methode-refusee')
      // Une famille fournie ne se supprime pas : ses fichiers sont ceux de l'application.
      if (fournie) return err(409, 'police-fournie', { famille: nomFamille })
      const modeles = await modelesUtilisant(nomFamille)
      if (modeles.length) return err(409, 'police-utilisee', { famille: nomFamille, modeles })
      await depot.supprimerFamille(nomFamille)
      console.log(`[admin] famille de polices supprimée : ${nomFamille}`)
      return (json(res, 200, {}), true)
    }

    if (req.method !== 'DELETE') return err(405, 'methode-refusee')
    const fichier = fichiers.find((f) => f.id === id)
    if (!fichier) return err(404, 'introuvable')
    // Le dernier fichier d'une famille qu'un modèle utilise ne part pas : le
    // modèle ne pourrait plus se composer.
    if (fichiers.filter((f) => f.famille === fichier.famille).length === 1) {
      const modeles = await modelesUtilisant(fichier.famille)
      if (modeles.length) return err(409, 'police-utilisee', { famille: fichier.famille, modeles })
    }
    await depot.supprimerPolice(id)
    console.log(`[admin] police supprimée : ${fichier.famille}, ${fichier.style}`)
    return (json(res, 200, {}), true)
  }
}
