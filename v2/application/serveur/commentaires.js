// Les routes des commentaires (couche application), sur le modèle de Docs
// (`ThreadViewSet`, `CommentViewSet`, `CommentPermission`) : qui peut faire
// quoi est décidé par le domaine (`peutCommenter`), le serveur le vérifie à
// chaque requête, le dépôt (adaptateur PostgreSQL) garde les fils. Réponses
// en codes. Les navigateurs ouverts sur le document sont prévenus de chaque
// changement par un flux d'événements (ils relisent alors les fils) : Docs
// passe par la présence, que le correcteur ne publie pas.
//
//   GET    /api/documents/:doc/fils                         les fils
//   GET    /api/documents/:doc/fils/evenements              flux « changement »
//   POST   /api/documents/:doc/fils                         { corps, metadonnees? }
//   DELETE /api/documents/:doc/fils/:fil
//   POST   /api/documents/:doc/fils/:fil/resoudre | rouvrir
//   POST   /api/documents/:doc/fils/:fil/commentaires       { corps }
//   PUT    /api/documents/:doc/fils/:fil/commentaires/:c    { corps }
//   DELETE /api/documents/:doc/fils/:fil/commentaires/:c
//   POST   /api/documents/:doc/fils/:fil/commentaires/:c/reactions        { emoji }
//   DELETE /api/documents/:doc/fils/:fil/commentaires/:c/reactions/:emoji
//   POST   /api/documents/:doc/fils/:fil/ancre               { debut, fin, citation }
//
// L'ancre : qui peut écrire le texte la pose dans son navigateur (comme Docs) ;
// pour le correcteur, qui ne le peut pas, le serveur la pose (Sylvain, étape
// 5, 2b) : il lit le texte principal dans y/hub, y ajoute la marque du fil,
// et y écrit la modification, attribuée au correcteur.
import { identifiantDocument, capacites, peutCommenter } from '../../domaine/index.js'

const MAX_CORPS = 64_000
const corpsValide = (corps) => Array.isArray(corps) && corps.length > 0 && JSON.stringify(corps).length <= MAX_CORPS
const emojiValide = (e) => typeof e === 'string' && e.length > 0 && e.length <= 16 && !/[\s<>]/.test(e)
/** Un segment d'adresse décodé, ou `null` s'il est mal formé (« %E0 »). */
function decoder(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}
const metaValide = (m) => m === undefined || m === null || (typeof m === 'object' && !Array.isArray(m))

/** Le battement du flux des changements (audit du 10/11/2026). */
const BATTEMENT_MS = 30_000

/**
 * @param {object} o
 * @param {(req: any) => Promise<{ id: string } | null>} o.personneDe
 * @param {(docId: string, idPersonne: string) => Promise<string | null>} o.roleSur
 * @param {any} o.depot  le dépôt des commentaires (adaptateur PostgreSQL), ou null
 * @param {(res: any, statut: number, corps: any) => void} o.json
 * @param {(req: any, max?: number) => Promise<any>} o.lireCorps
 * @param {{ lireTexte: (docId: string) => Promise<Uint8Array>, ecrireTexte: (docId: string, mise: Uint8Array, pour: string) => Promise<any> } | null} [o.collaboration]
 *   l'accès de notre serveur au texte (y/hub), pour poser les ancres
 */
export function creerCommentaires({ personneDe, roleSur, depot, json, lireCorps, collaboration = null }) {
  /** Les abonnés au flux d'un document. */
  const abonnes = new Map()
  function prevenir(docId) {
    for (const res of abonnes.get(docId) ?? []) res.write('data: changement\n\n')
  }

  /** Rend `true` si la requête a été traitée (même par une erreur). */
  return async function traiter(req, res, url) {
    const m = /^\/api\/documents\/([^/]+)\/fils(?:\/(.*))?$/.exec(url.pathname)
    if (!m) return false
    const p = await personneDe(req)
    if (!p) return (json(res, 401, { code: 'session-absente' }), true)
    const segments = [m[1], ...(m[2] ?? '').split('/').filter(Boolean)].map(decoder)
    if (segments.includes(null)) return (json(res, 400, { code: 'requete-invalide' }), true)
    const doc = identifiantDocument(segments[0])
    if (!doc.ok) return (json(res, 400, { code: doc.code }), true)
    const docId = doc.id
    const role = await roleSur(docId, p.id)
    // Document inconnu et document sans accès se confondent : 404.
    if (!role) return (json(res, 404, { code: 'document-introuvable' }), true)
    const caps = capacites(role)
    const peut = (action, objet) => peutCommenter(caps, p.id, action, objet)
    if (!peut('voir')) return (json(res, 403, { code: 'droit-insuffisant' }), true)
    if (!depot) return (json(res, 503, { code: 'commentaires-indisponibles' }), true)

    const [fil, sous, idC, sous2, emoji, ...trop] = segments.slice(1)
    if (trop.length) return (json(res, 404, { code: 'introuvable' }), true)
    const methode = req.method
    const refus = () => (json(res, 403, { code: 'droit-insuffisant' }), true)
    const introuvable = () => (json(res, 404, { code: 'introuvable' }), true)
    const fait = (statut = 200, corps = {}) => (prevenir(docId), json(res, statut, corps), true)

    // /fils
    if (!fil) {
      if (methode === 'GET') return (json(res, 200, await depot.fils(docId)), true)
      if (methode !== 'POST') return (json(res, 405, { code: 'methode-refusee' }), true)
      if (!peut('creer')) return refus()
      const { corps, metadonnees } = await lireCorps(req, MAX_CORPS * 2)
      if (!corpsValide(corps) || !metaValide(metadonnees))
        return (json(res, 400, { code: 'commentaire-invalide' }), true)
      return fait(201, await depot.creerFil(docId, p.id, corps, metadonnees ?? null))
    }
    // /fils/evenements
    if (fil === 'evenements' && !sous) {
      if (methode !== 'GET') return (json(res, 405, { code: 'methode-refusee' }), true)
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write(': ouvert\n\n')
      if (!abonnes.has(docId)) abonnes.set(docId, new Set())
      abonnes.get(docId).add(res)
      // Un battement toutes les 30 s : une connexion coupée sans prévenir (réseau
      // du téléphone) se voit des deux côtés, et le navigateur se reconnecte
      // (audit du 10/11/2026).
      const battement = setInterval(() => res.write(': battement\n\n'), BATTEMENT_MS)
      battement.unref?.()
      req.on('close', () => {
        clearInterval(battement)
        abonnes.get(docId)?.delete(res)
        if (!abonnes.get(docId)?.size) abonnes.delete(docId)
      })
      return true
    }
    const leFil = await depot.fil(docId, fil)
    if (!leFil) return introuvable()
    // Le fil reste à qui l'a ouvert (auteur enregistré), même si son premier
    // commentaire est supprimé (Sylvain, 10/11/2026, Q4).
    const createur = { auteur: leFil.auteur }

    // /fils/:fil
    if (!sous) {
      if (methode !== 'DELETE') return (json(res, 405, { code: 'methode-refusee' }), true)
      if (!peut('supprimer', createur)) return refus()
      await depot.supprimerFil(fil)
      return fait()
    }
    // /fils/:fil/resoudre, /rouvrir
    if ((sous === 'resoudre' || sous === 'rouvrir') && !idC) {
      if (methode !== 'POST') return (json(res, 405, { code: 'methode-refusee' }), true)
      if (!peut('resoudre', createur)) return refus()
      await depot.resoudre(fil, sous === 'resoudre', p.id)
      return fait()
    }
    // /fils/:fil/ancre : l'auteur du fil seulement.
    if (sous === 'ancre' && !idC) {
      if (methode !== 'POST') return (json(res, 405, { code: 'methode-refusee' }), true)
      if (!peut('creer') || !peut('modifier', createur)) return refus()
      if (!collaboration) return (json(res, 503, { code: 'collaboration-indisponible' }), true)
      const { debut, fin, citation } = await lireCorps(req)
      let r
      try {
        // Chargé à la première ancre seulement : BlockNote pèse ~65 Mo de mémoire
        // (mesure du 09/11/2026), inutiles au serveur tant que personne n'en pose.
        const { ancreCommentaire } = await import('../../adaptateurs/blocknote/serveur.js')
        r = ancreCommentaire(await collaboration.lireTexte(docId), { debut, fin, citation, fil })
        if (r.code === 'ok') await collaboration.ecrireTexte(docId, r.mise, p.id)
      } catch (err) {
        if (err.code === 'collaboration-indisponible' || err.name === 'TimeoutError' || err.name === 'TypeError')
          return (json(res, 503, { code: 'collaboration-indisponible' }), true)
        throw err
      }
      if (r.code === 'ancre-invalide') return (json(res, 400, { code: r.code }), true)
      if (r.code !== 'ok') return (json(res, 409, { code: r.code }), true)
      return (json(res, 200, {}), true)
    }
    if (sous !== 'commentaires') return introuvable()
    // /fils/:fil/commentaires
    if (!idC) {
      if (methode !== 'POST') return (json(res, 405, { code: 'methode-refusee' }), true)
      if (!peut('repondre')) return refus()
      const { corps, metadonnees } = await lireCorps(req, MAX_CORPS * 2)
      if (!corpsValide(corps) || !metaValide(metadonnees))
        return (json(res, 400, { code: 'commentaire-invalide' }), true)
      return fait(201, { id: await depot.ajouterCommentaire(fil, p.id, corps, metadonnees ?? null) })
    }
    const commentaire = await depot.commentaire(docId, fil, idC)
    if (!commentaire) return introuvable()
    // /fils/:fil/commentaires/:c
    if (!sous2) {
      if (methode === 'PUT') {
        if (!peut('modifier', commentaire)) return refus()
        const { corps, metadonnees } = await lireCorps(req, MAX_CORPS * 2)
        if (!corpsValide(corps) || !metaValide(metadonnees))
          return (json(res, 400, { code: 'commentaire-invalide' }), true)
        await depot.modifierCommentaire(idC, corps, metadonnees ?? null)
        return fait()
      }
      if (methode === 'DELETE') {
        if (!peut('supprimer', commentaire)) return refus()
        await depot.supprimerCommentaire(fil, idC)
        return fait()
      }
      return (json(res, 405, { code: 'methode-refusee' }), true)
    }
    if (sous2 !== 'reactions') return introuvable()
    if (!peut('reagir')) return refus()
    // /fils/:fil/commentaires/:c/reactions[/:emoji] : chacun ne touche qu'à ses réactions.
    if (!emoji && methode === 'POST') {
      const corps = await lireCorps(req)
      if (!emojiValide(corps.emoji)) return (json(res, 400, { code: 'reaction-invalide' }), true)
      await depot.reagir(idC, p.id, corps.emoji)
      return fait()
    }
    if (emoji && methode === 'DELETE') {
      if (!emojiValide(emoji)) return (json(res, 400, { code: 'reaction-invalide' }), true)
      await depot.retirerReaction(idC, p.id, emoji)
      return fait()
    }
    return (json(res, 405, { code: 'methode-refusee' }), true)
  }
}
