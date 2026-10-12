// Les documents : liste, création, lecture, renommage, étoile, suppression, et l'historique léger.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { isAdminEmail, readSession } from '../auth.js'
import { capabilities } from '../roles.js'
import { idCompte } from '../users.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'
import { mettreALaCorbeille, supprimerDefinitivement } from '../corbeille.js'

const HISTORY_RAW_MAX_OCTETS = 32 * 1024 * 1024

export async function routesDocuments(req, res, url, ctx) {
  const { pathname } = url
  const { rangements, rooms, storage, users, documentsMaxParCompte } = ctx

  if (pathname === '/api/docs' && req.method === 'GET') {
    const email = readSession(req)
    // Favoris et dossiers sont personnels (server/rangement.js) : chaque
    // document de la liste porte `starred` (mon favori) et `dossier` (où je
    // l'ai rangé), jamais ceux d'un autre.
    const r = rangements.elaguer(rangements.lire(email), new Set(storage.listDocs(email).map((d) => d.id)))
    const favoris = new Set(r.favoris)
    return sendJson(res, 200, {
      docs: storage
        .listDocs(email)
        .map((d) => ({ ...d, starred: favoris.has(d.id), dossier: r.placement[d.id] || null })),
    })
  }

  if (pathname === '/api/docs' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    if (!isAdminEmail(email) && storage.documentsDe(email).length >= documentsMaxParCompte()) {
      return sendJson(res, 403, {
        error: `limite de ${documentsMaxParCompte()} documents par compte atteinte — supprimez-en pour en créer d’autres`,
      })
    }
    const doc = storage.createDoc(typeof body.title === 'string' ? body.title.slice(0, 200) : '', email)
    return sendJson(res, 201, doc)
  }

  const docMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)$/)
  if (docMatch && req.method === 'GET') {
    const doc = storage.getDoc(docMatch[1])
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    const myRole = storage.roleFor(docMatch[1], email)
    if (!myRole) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    // `myName`/`myColor` voyagent avec les métadonnées du document plutôt
    // que par une requête à part : le client les récupère déjà juste avant
    // de monter l'éditeur, et c'est `myName === null` qui lui dit qu'il doit
    // demander son nom à la personne (voir client/src/main.js). Le nom vit
    // sur le compte depuis le 16/09/2026, plus dans le localStorage du
    // navigateur — sans quoi la même personne était nommée et colorée
    // différemment sur chacun de ses appareils.
    const compte = users.get(email)
    const proprio = storage.ownerOf(docMatch[1])
    return sendJson(res, 200, {
      ...doc,
      starred: rangements.estFavori(email, doc.id),
      owner: proprio,
      jeSuisProprietaire: !!email && proprio === email,
      myRole,
      // Ce que le client lit pour décider ce qu'il montre (28/09/2026) :
      // les capacités, jamais le nom du rôle — voir server/roles.js.
      myCapabilities: capabilities(myRole),
      myName: compte ? compte.nom : null,
      myColor: compte ? compte.couleur : null,
      // Écrit dans chacun de ses commentaires (S12) : le serveur le compare à
      // celui de la session pour ne laisser un lecteur toucher qu'aux siens.
      myId: idCompte(email),
      onlineCount: rooms.presenceCount(doc.id),
    })
  }
  if (docMatch && req.method === 'PATCH') {
    if (!storage.getDoc(docMatch[1])) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(docMatch[1], readSession(req))).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req)
    const doc = storage.renameDoc(docMatch[1], String(body.title || '').slice(0, 200))
    return sendJson(res, 200, doc)
  }

  // L'étoile est un favori **personnel** depuis le 12/10/2026 : tout membre
  // met en favori pour soi, sans que personne d'autre le voie (c'était une
  // propriété du document, réservée aux éditeurs).
  const starMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/star$/)
  if (starMatch && req.method === 'PATCH') {
    if (!storage.getDoc(starMatch[1])) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    if (!storage.roleFor(starMatch[1], email))
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    const body = await readJsonBody(req)
    rangements.favori(email, starMatch[1], !!body.starred)
    return sendJson(res, 200, { ...storage.getDoc(starMatch[1]), starred: !!body.starred })
  }

  // Supprimer : **le propriétaire seul** (17/09/2026). C'était jusqu'ici
  // `canManageDocument`, donc n'importe quel éditeur — pour un geste
  // irréversible, sur une instance qui n'a aucune sauvegarde. Les autres
  // voient « Quitter » (DELETE .../moi ci-dessous), qui ne retire que leur
  // propre accès.
  //
  // Depuis le 12/10/2026, « supprimer » **met à la corbeille** : rien n'est
  // effacé (server/corbeille.js). La suppression définitive est une autre
  // route, qui n'ouvre que sur un document déjà à la corbeille.
  if (docMatch && req.method === 'DELETE') {
    const doc = storage.getDoc(docMatch[1])
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    // Un document sans propriétaire est un document « ouvert » d'avant le
    // contrôle d'accès : il garde son régime d'origine (et, n'ayant personne
    // pour le restaurer, sa suppression directe).
    const proprio = storage.ownerOf(docMatch[1])
    if (proprio ? proprio !== email : !capabilities(storage.roleFor(docMatch[1], email)).canManageDocument) {
      return sendJson(res, 403, { error: 'seul le propriétaire peut supprimer ce document' })
    }
    if (doc.corbeille) return sendJson(res, 404, { error: 'document introuvable' })
    if (!proprio) return sendJson(res, 200, { ok: supprimerDefinitivement(ctx, docMatch[1], email) })
    mettreALaCorbeille(ctx, docMatch[1], email)
    return sendJson(res, 200, { ok: true, corbeille: true })
  }

  // Historique léger (voir storage.js : getHistoryMeta/getHistoryRaw/
  // compactDoc). Ces trois routes n'avaient **aucune** vérification de
  // droits jusqu'au 15/09/2026 : tenable tant que basic_auth filtrait tout
  // en amont, plus du tout une fois l'instance publique — `history/raw`
  // renvoie le journal complet, donc le contenu du document, et `compact`
  // le réécrit. Seul l'identifiant du document (12 caractères aléatoires)
  // protégeait encore, ce qui est un délai, pas une protection.
  // Lire l'historique = lire le document : même règle que GET /api/docs/:id.
  // Le compacter réécrit le journal : réservé aux éditeurs.
  const historyMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/history$/)
  if (historyMatch && req.method === 'GET') {
    const id = historyMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    if (!storage.roleFor(id, readSession(req))) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    return sendJson(res, 200, storage.getHistoryMeta(id))
  }

  const historyRawMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/history\/raw$/)
  if (historyRawMatch && req.method === 'GET') {
    const id = historyRawMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    if (!storage.roleFor(id, readSession(req))) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    // Le journal est sérialisé en base64 d'un bloc : au-delà d'une taille
    // raisonnable (il est compacté bien avant, à 4 Mo), on refuse plutôt que
    // de bâtir une réponse de centaines de mégaoctets (S18).
    const { octets } = storage.journalInfo(id)
    if (octets != null && octets > HISTORY_RAW_MAX_OCTETS) {
      return sendJson(res, 413, { error: 'le journal est trop volumineux pour être envoyé d’un bloc' })
    }
    return sendJson(res, 200, { entries: storage.getHistoryRaw(id) })
  }

  return PAS_TRAITE
}
