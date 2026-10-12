// Les versions d'un document : lister, nommer, comparer, restaurer
// (11/10/2026, claude/conception-compactage-versions.md §6).
//
// Lire une version, c'est lire le document : mêmes droits que
// GET /api/docs/:id. Nommer, supprimer, restaurer : les éditeurs — ce sont
// eux qui décident de ce que le document devient.

import * as Y from 'yjs'
import { readSession } from '../auth.js'
import { capabilities } from '../roles.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'
import { blocsDeInstantane, blocsPlats, comparer, restaurerEnAvant } from '../comparaison.js'

const NOM_MAX = 80
/** Les versions nommées sont le choix d'une personne ; il en faut une borne,
 * mais large. */
const NOMMEES_MAX = 200

const nomPropre = (nom) =>
  String(nom ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOM_MAX)

export async function routesVersions(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, rooms, storage, users, versions } = ctx

  const m = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/versions(?:\/(\d+|courante))?(?:\/(restauration))?$/)
  const cmp = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/comparaison$/)
  if (!m && !cmp) return PAS_TRAITE

  const id = (m || cmp)[1]
  const email = readSession(req)
  if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
  const role = storage.roleFor(id, email)
  if (!role) return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
  const peutEcrire = capabilities(role).canManageDocument
  const refuserLecteur = () => sendJson(res, 403, { error: 'réservé aux éditeurs' })

  const nomDe = (adresse) => {
    if (!adresse) return null
    const compte = users.get(adresse)
    return (compte && compte.nom) || null
  }
  const fiche = (v) => ({ ts: v.ts, origine: v.origine, nom: v.nom, par: nomDe(v.par), octets: v.octets })
  const instantane = () => rooms.lireDocument(id, (doc) => Buffer.from(Y.encodeStateAsUpdate(doc)))
  /** Les blocs d'une version (`ts`) ou du document tel qu'il est (`courante`). */
  const blocsDe = async (ts) => {
    if (ts === 'courante') return rooms.lireDocument(id, blocsPlats)
    const octets = versions.lire(id, ts)
    return octets ? blocsDeInstantane(octets) : null
  }

  // --- Comparer deux états --------------------------------------------------
  if (cmp) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'méthode non permise' })
    const de = url.searchParams.get('de') || ''
    const vers = url.searchParams.get('vers') || 'courante'
    const valide = (t) => t === 'courante' || /^\d+$/.test(t)
    if (!valide(de) || !valide(vers)) return sendJson(res, 400, { error: 'versions à comparer invalides' })
    const [a, b] = [await blocsDe(de), await blocsDe(vers)]
    if (!a || !b) return sendJson(res, 404, { error: 'version introuvable' })
    return sendJson(res, 200, { de, vers, ...comparer(a, b) })
  }

  const ts = m[2]
  const action = m[3]

  // --- La liste, et nommer l'état actuel -----------------------------------------
  if (!ts) {
    if (req.method === 'GET') {
      return sendJson(res, 200, { versions: versions.lister(id).map(fiche), peutEcrire })
    }
    if (req.method === 'POST') {
      if (!peutEcrire) return refuserLecteur()
      const body = await readJsonBody(req)
      const nom = nomPropre(body.nom)
      if (!nom) return sendJson(res, 400, { error: 'donnez un nom à cette version' })
      if (versions.lister(id).filter((v) => v.nom).length >= NOMMEES_MAX) {
        return sendJson(res, 403, {
          error: `limite de ${NOMMEES_MAX} versions nommées atteinte — supprimez-en pour en nommer d’autres`,
        })
      }
      const v = versions.enregistrer(id, await instantane(), { origine: 'nommee', par: email, nom })
      if (!v) return sendJson(res, 500, { error: 'version non enregistrée' })
      metrics.log('versions', { email, docId: id, geste: 'nommer' })
      return sendJson(res, 201, fiche({ ...v, octets: versions.trouver(id, v.ts)?.octets ?? 0 }))
    }
    return sendJson(res, 405, { error: 'méthode non permise' })
  }

  // --- Une version -------------------------------------------------------------
  if (!action) {
    if (req.method === 'GET') {
      const blocs = await blocsDe(ts)
      if (!blocs) return sendJson(res, 404, { error: 'version introuvable' })
      const f = ts === 'courante' ? null : versions.trouver(id, ts)
      return sendJson(res, 200, {
        ts: f ? f.ts : null,
        courante: ts === 'courante',
        nom: f ? f.nom : null,
        blocs: blocs.map(({ n, nom, niveau, texte }) => ({ n, nom, niveau, texte })),
      })
    }
    if (ts === 'courante') return sendJson(res, 400, { error: 'la version actuelle n’est pas une version enregistrée' })
    if (req.method === 'PATCH') {
      if (!peutEcrire) return refuserLecteur()
      const body = await readJsonBody(req)
      const v = versions.renommer(id, ts, nomPropre(body.nom) || null)
      if (!v) return sendJson(res, 404, { error: 'version introuvable' })
      return sendJson(res, 200, fiche(v))
    }
    if (req.method === 'DELETE') {
      if (!peutEcrire) return refuserLecteur()
      if (!versions.supprimer(id, ts)) return sendJson(res, 404, { error: 'version introuvable' })
      metrics.log('versions', { email, docId: id, geste: 'supprimer' })
      return sendJson(res, 200, { ok: true })
    }
    return sendJson(res, 405, { error: 'méthode non permise' })
  }

  // --- Restaurer « en avant » ---------------------------------------------------
  if (req.method !== 'POST' || ts === 'courante') return sendJson(res, 405, { error: 'méthode non permise' })
  if (!peutEcrire) return refuserLecteur()
  const cible = await blocsDe(ts)
  if (!cible) return sendJson(res, 404, { error: 'version introuvable' })
  const body = await readJsonBody(req)
  const compte = users.get(email)
  const auteur = { name: (compte && compte.nom) || email, color: (compte && compte.couleur) || '#6b7280' }

  // Toujours une répétition d'abord, sur une copie : elle dit ce qui sera
  // proposé (et ce qui ne le sera pas) sans rien toucher. Restaurer pour de
  // vrai ne fait rien de plus que ce qu'elle a annoncé.
  const repetition = await rooms.lireDocument(id, (doc) => {
    const copie = new Y.Doc()
    try {
      Y.applyUpdate(copie, Y.encodeStateAsUpdate(doc))
      return restaurerEnAvant(copie, cible, auteur)
    } finally {
      copie.destroy()
    }
  })
  const rien = repetition.stats.modifies + repetition.stats.ajoutes + repetition.stats.supprimes === 0
  if (body.simuler || rien) return sendJson(res, 200, { ...repetition, simule: !!body.simuler, rien })

  // L'état d'avant est gardé d'abord : si la restauration ne plaît pas, on
  // sait où revenir (en avant, encore une fois).
  const avant = versions.enregistrer(id, await instantane(), { origine: 'avant-restauration', par: email })
  const reel = await rooms.ecrireDocument(id, (doc) => restaurerEnAvant(doc, cible, auteur))
  metrics.log('versions', { email, docId: id, geste: 'restaurer', ...reel.stats })
  return sendJson(res, 200, { ...reel, simule: false, rien: false, versionAvant: avant ? avant.ts : null })
}
