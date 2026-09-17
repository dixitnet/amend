import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { isWebSocketUpgrade, acceptWebSocket } from './ws.js'
import { Storage } from './storage.js'
import { Rooms } from './rooms.js'
import { suggestEdit, AIConfigError, AIRequestError } from './ai.js'
import { Metrics } from './metrics.js'
import { Uploads } from './uploads.js'
import { Users } from './users.js'
import { Typst, TypstError } from './typst.js'
import { apercu } from './admin.js'
import {
  readSession,
  sessionCookieHeader,
  clearSessionCookieHeader,
  isSecureRequest,
  normalizeEmail,
  canRequestReconnectLink,
  createReconnectToken,
  consumeReconnectToken,
  isAdminEmail,
  isLoginAllowed,
} from './auth.js'
import { sendMail, courrierAvecBouton } from './mailgun.js'
import { capabilities, isValidRole } from './roles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Tiny built-in .env loader (no dependency): sets process.env vars found in
// a .env file at the project root, without overriding ones already set in
// the real environment.
function loadDotEnv(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
loadDotEnv(join(ROOT, '.env'))
const CLIENT_DIST = join(ROOT, 'client', 'dist')
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data')
const PORT = Number(process.env.PORT) || 8787
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`
const MAX_JSON_BODY = 20_000
// La requête de compaction transporte un instantané Yjs déjà fusionné
// (encodé en base64) — potentiellement bien plus gros qu'un simple champ
// de formulaire, d'où une limite à part, nettement plus large.
const MAX_COMPACT_BODY = 20_000_000
// La source Typst d'un livre entier : 531 ko mesurés sur 524 000 signes.
const MAX_TYPST_BODY = 4_000_000

const storage = new Storage(DATA_DIR)
const rooms = new Rooms(storage)
// Les seuils viennent du .env (voir .env.example) et sont lus ici, pas au
// chargement du module : loadDotEnv() ne s'exécute qu'après les imports.
const users = new Users(DATA_DIR)
// Rendu PDF (16/09/2026) — binaire appelé en sous-processus, sous plafond
// mémoire, sous délai, et un rendu à la fois (voir server/typst.js).
const typst = new Typst()
const uploads = new Uploads(DATA_DIR, {
  maxImageMo: process.env.MAX_IMAGE_MB,
  maxDocumentMo: process.env.MAX_DOC_IMAGES_MB,
})
const metrics = new Metrics(DATA_DIR)
metrics.prune()

// Plus de plafond de participants simultanés par document (le
// MAX_USERS_PER_DOC = 10 du 13/09/2026 a été retiré le 15/09) : c'était une
// prudence produit, jamais une limite mesurée, et le test de charge n°2 l'a
// démentie — 159 connexions simultanées sur 16 documents, 88 Mo de RSS sur
// les 700 autorisés et 0,1 ms de latence de boucle d'événements. Ce qui
// limite en pratique reste le navigateur de chaque participant, pas le
// serveur. Qui entre est désormais décidé par les accès au document
// (invitation), plus par un compteur.

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function readJsonBody(req, maxSize = MAX_JSON_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxSize) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

/** Même principe que readJsonBody, mais on garde les octets tels quels :
 * le dépôt d'une image est un POST binaire brut, avec le type dans
 * `content-type`. Pas de multipart, donc pas d'analyseur multipart à
 * écrire — le client n'envoie jamais qu'un fichier à la fois. */
function readBinaryBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxSize) {
        reject(Object.assign(new Error('image trop lourde'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function serveStatic(req, res, pathname) {
  if (!existsSync(CLIENT_DIST)) {
    sendJson(res, 503, {
      error:
        "Le client n'est pas encore compilé. Lance `npm run build:client` puis relance le serveur.",
    })
    return
  }
  let rel = pathname === '/' ? '/index.html' : pathname
  // Prevent path traversal outside CLIENT_DIST.
  rel = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '')
  let filePath = join(CLIENT_DIST, rel)
  if (!filePath.startsWith(CLIENT_DIST + sep) && filePath !== CLIENT_DIST) {
    filePath = join(CLIENT_DIST, 'index.html')
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback for client-side routes.
    filePath = join(CLIENT_DIST, 'index.html')
    if (!existsSync(filePath)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }
  }
  const type = MIME[extname(filePath)] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': type })
  createReadStream(filePath).pipe(res)
}

async function handleApi(req, res, url) {
  const { pathname } = url

  if (pathname === '/api/docs' && req.method === 'GET') {
    const email = readSession(req)
    return sendJson(res, 200, { docs: storage.listDocs(email) })
  }

  if (pathname === '/api/docs' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    const doc = storage.createDoc(typeof body.title === 'string' ? body.title.slice(0, 200) : '', email)
    return sendJson(res, 201, doc)
  }

  const docMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)$/)
  if (docMatch && req.method === 'GET') {
    const doc = storage.getDoc(docMatch[1])
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    const myRole = storage.roleFor(docMatch[1], email)
    if (storage.hasAccessControl(docMatch[1]) && !myRole) {
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
    return sendJson(res, 200, {
      ...doc,
      myRole: myRole || 'editeur',
      myName: compte ? compte.nom : null,
      myColor: compte ? compte.couleur : null,
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

  const starMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/star$/)
  if (starMatch && req.method === 'PATCH') {
    if (!storage.getDoc(starMatch[1])) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(starMatch[1], readSession(req))).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req)
    const doc = storage.starDoc(starMatch[1], !!body.starred)
    return sendJson(res, 200, doc)
  }

  if (docMatch && req.method === 'DELETE') {
    if (!storage.getDoc(docMatch[1])) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(docMatch[1], readSession(req))).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const ok = storage.deleteDoc(docMatch[1])
    // Sans ça, les images d'un document supprimé resteraient sur le disque
    // pour toujours — et resteraient lisibles par leur URL si l'identifiant
    // venait à être réattribué.
    uploads.supprimerDocument(docMatch[1])
    return sendJson(res, 200, { ok })
  }

  // --- Rendu PDF (16/09/2026, voir claude/proto-export-pdf-typst-pagedjs.md).
  // Le client fabrique la source Typst à partir du document ProseMirror
  // qu'il a sous la main — le serveur n'a que des mises à jour Yjs binaires,
  // et les reconstituer ici demanderait Yjs dans un backend sans dépendance.
  // Il ne reste donc à faire ici que compiler, dans un bac à sable.
  //
  // C'est aussi le premier export réellement réservé aux éditeurs : le .md
  // et le .docx sont fabriqués dans le navigateur, où masquer un bouton
  // n'est qu'une convention. Ici, c'est le serveur qui décide.
  const pdfMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/pdf$/)
  if (pdfMatch && req.method === 'POST') {
    const id = pdfMatch[1]
    const doc = storage.getDoc(id)
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(id, readSession(req))).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req, MAX_TYPST_BODY)
    try {
      const pdf = await typst.rendre(String(body.source || ''), { images: uploads.lister(id) })
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': pdf.length,
        'content-disposition': `attachment; filename="document.pdf"`,
      })
      return res.end(pdf)
    } catch (err) {
      if (err instanceof TypstError) return sendJson(res, err.status, { error: err.message })
      throw err
    }
  }

  // --- Images (16/09/2026, voir claude/etude-tableaux-images.md). Les
  // octets ne vont jamais dans le document : le nœud ne porte que l'URL
  // ci-dessous, et c'est cette route qui décide qui a le droit de la lire.
  // Servir /uploads/<id>.png sans vérifier l'accès referait exactement la
  // faille trouvée le 15/09 sur history/raw — du contenu de document
  // accessible à qui connaît une URL. ---

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
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim()
    if (!uploads.typeAccepte(mime)) {
      return sendJson(res, 415, { error: "format d'image non accepté (png ou jpeg)" })
    }
    let buffer
    try {
      buffer = await readBinaryBody(req, uploads.maxImageOctets)
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message })
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
    if (storage.hasAccessControl(id) && !storage.roleFor(id, readSession(req))) {
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
    if (storage.hasAccessControl(id) && !storage.roleFor(id, readSession(req))) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    return sendJson(res, 200, storage.getHistoryMeta(id))
  }

  const historyRawMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/history\/raw$/)
  if (historyRawMatch && req.method === 'GET') {
    const id = historyRawMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    if (storage.hasAccessControl(id) && !storage.roleFor(id, readSession(req))) {
      return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
    }
    return sendJson(res, 200, { entries: storage.getHistoryRaw(id) })
  }

  const compactMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/compact$/)
  if (compactMatch && req.method === 'POST') {
    const id = compactMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(id, readSession(req))).canManageDocument) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req, MAX_COMPACT_BODY)
    if (typeof body.baseSnapshot !== 'string' || !body.baseSnapshot) {
      return sendJson(res, 400, { error: 'baseSnapshot (base64) requis' })
    }
    if (typeof body.baseTs !== 'number' || typeof body.keepFromIndex !== 'number') {
      return sendJson(res, 400, { error: 'baseTs et keepFromIndex (nombres) requis' })
    }
    try {
      const result = await storage.compactDoc(id, {
        baseSnapshot: Buffer.from(body.baseSnapshot, 'base64'),
        baseTs: body.baseTs,
        keepFromIndex: body.keepFromIndex,
        expectedTotalBeforeCompaction: body.expectedTotalBeforeCompaction,
      })
      return sendJson(res, 200, result)
    } catch (err) {
      // Journal changé entre-temps (autre compaction, nouvelles frappes) ou
      // paramètres hors limites : le client recalcule et réessaie, ce n'est
      // pas une erreur serveur.
      return sendJson(res, 409, { error: err.message })
    }
  }

  if (pathname === '/api/style' && req.method === 'GET') {
    return sendJson(res, 200, storage.getStyle())
  }

  // --- Mise en page d'un document (16/09/2026) ---
  // La feuille de style était réglée pour toute l'instance, ce qui n'a de
  // sens que si l'instance ne fait qu'un type de document. Elle descend au
  // document ; `/api/style` garde son rôle mais change de sens — il définit
  // désormais le **style par défaut**, dont héritent les documents qui
  // n'ont pas le leur.
  const docStyleMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/style$/)
  if (docStyleMatch) {
    const id = docStyleMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (req.method === 'GET') {
      // Lire la mise en page suit l'accès au document : un correcteur la
      // voit, il ne la change pas.
      if (storage.hasAccessControl(id) && !role) {
        return sendJson(res, 403, { error: "vous n'avez pas accès à ce document" })
      }
      return sendJson(res, 200, { style: storage.getDocStyle(id), propre: storage.hasOwnStyle(id) })
    }
    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (!capabilities(role).canManageDocument) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
      if (req.method === 'DELETE') {
        // Revenir au style par défaut de l'instance.
        return sendJson(res, 200, { style: storage.resetDocStyle(id), propre: false })
      }
      const body = await readJsonBody(req)
      return sendJson(res, 200, { style: storage.setDocStyle(id, body), propre: true })
    }
  }
  if (pathname === '/api/style' && req.method === 'PUT') {
    // Feuille de style partagée par toute l'instance, pas par document —
    // réservée aux administrateurs (voir ADMIN_EMAILS, auth.js), pas aux
    // éditeurs de tel ou tel document.
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const body = await readJsonBody(req)
    return sendJson(res, 200, storage.setStyle(body))
  }

  // Point de diagnostic temporaire pour le test de charge du 13/09/2026
  // (voir README.md, section dédiée) : mémoire du processus et un indicateur
  // simple de latence de la boucle d'événements Node (le temps qu'un
  // setImmediate mette à s'exécuter — un indicateur direct de "combien de
  // travail est déjà en attente" pendant une rafale de modifications).
  // Aucune information sensible, laissé en place après le test comme un
  // petit outil de diagnostic auto-hébergé de plus, dans le même esprit que
  // le reste de l'appli.
  if (pathname === '/api/debug/stats' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    const start = process.hrtime.bigint()
    return new Promise((resolve) => {
      setImmediate(() => {
        const loopLagMs = Number(process.hrtime.bigint() - start) / 1e6
        sendJson(res, 200, {
          pid: process.pid,
          uptimeSec: process.uptime(),
          memory: process.memoryUsage(),
          loopLagMs,
        })
        resolve()
      })
    })
  }

  // Tarifs du modèle, en euros par million de jetons — lus du .env comme le
// reste des réglages (voir .env.example). Ils ne servent qu'à traduire les
// jetons déjà journalisés en une somme lisible : rien dans l'application ne
// s'appuie dessus pour décider quoi que ce soit, un tarif périmé fausse un
// affichage, jamais un comportement.
const TARIFS_IA = {
  modele: process.env.AI_MODEL || 'claude-sonnet-5',
  entreeEurParMTok: Number(process.env.AI_PRICE_INPUT_EUR) || 1.73,
  sortieEurParMTok: Number(process.env.AI_PRICE_OUTPUT_EUR) || 8.67,
}

// Vue d'ensemble du back-office (voir claude/conception-backoffice.md) :
  // lecture seule, réservée aux administrateurs comme le diagnostic. Elle
  // n'ouvre aucune action et ne renvoie aucun contenu de document.
  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    return sendJson(
      res,
      200,
      apercu({ storage, rooms, metrics, uploads, users, tarifsIA: TARIFS_IA, dataDir: DATA_DIR, waitlistPath: storage.waitlistPath })
    )
  }

  // --- Authentification (voir claude/conception-gestion-utilisateurs.md,
  // projet Amend) : reconnexion par lien magique, valable pour toute
  // adresse (pas seulement celles ayant déjà accès à un document — créer
  // un nouveau document, dont on devient éditeur, ne demande rien de plus). ---

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const email = readSession(req)
    const compte = users.get(email)
    return sendJson(res, 200, {
      email,
      admin: isAdminEmail(email),
      nom: compte ? compte.nom : null,
      couleur: compte ? compte.couleur : null,
    })
  }

  // Le nom que la personne se donne à sa première ouverture de document.
  // Une session valide suffit : on n'enregistre un nom que sur l'adresse de
  // la session elle-même, jamais sur une adresse passée en paramètre.
  if (pathname === '/api/auth/name' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    const compte = users.definirNom(email, body.nom)
    if (!compte) return sendJson(res, 400, { error: 'nom vide' })
    return sendJson(res, 200, { nom: compte.nom, couleur: compte.couleur })
  }

  if (pathname === '/api/auth/request-link' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    // Réponse volontairement identique dans tous les cas (email inconnu,
    // pas autorisé, limite de débit dépassée...) : on ne veut pas laisser
    // deviner depuis l'extérieur quels emails ont un accès. Seule une
    // adresse qui a déjà un accès quelque part, ou une administratrice,
    // reçoit réellement un lien — tout le monde d'autre n'entre que par
    // une invitation à un document précis (voir isLoginAllowed, auth.js).
    if (isLoginAllowed(email, storage) && canRequestReconnectLink(email)) {
      const token = createReconnectToken(email)
      const link = `${APP_BASE_URL}/#/login/verify/${token}`
      try {
        await sendMail({
          to: email,
          subject: 'Votre lien de connexion à Amend',
          ...courrierAvecBouton({
            titre: 'Connexion à Amend',
            intro: 'Voici votre lien de connexion. Il est valable 20 minutes et ne sert qu’une fois.',
            libelleBouton: 'Se connecter',
            lien: link,
            apres: "Si vous n'avez rien demandé, ignorez ce message : sans clic, rien ne se passe.",
          }),
        })
        metrics.log('mail', { type: 'connexion', ok: true })
      } catch (err) {
        console.error("Échec d'envoi d'email de reconnexion :", err.message)
        metrics.log('mail', { type: 'connexion', ok: false, erreur: err.message })
      }
    }
    return sendJson(res, 200, { ok: true })
  }

  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = consumeReconnectToken(String(body.token || ''))
    if (!email) return sendJson(res, 400, { error: 'lien invalide ou expiré' })
    res.setHeader('set-cookie', sessionCookieHeader(email, { secure: isSecureRequest(req) }))
    return sendJson(res, 200, { email })
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', clearSessionCookieHeader({ secure: isSecureRequest(req) }))
    return sendJson(res, 200, { ok: true })
  }

  // --- Invitation nominative (remplace les liens partagés par rôle,
  // retirés le 15/09/2026) : l'éditeur saisit une adresse, la personne
  // reçoit un mail nommant le document, et son lien ouvre directement une
  // session à son nom. C'est désormais la réception du mail qui prouve
  // l'identité, là où le lien partagé se contentait d'une adresse
  // auto-déclarée. ---

  const acceptMatch = pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]+)$/)
  if (acceptMatch && req.method === 'POST') {
    const found = storage.findInvitation(acceptMatch[1])
    if (!found) return sendJson(res, 404, { error: 'invitation inconnue' })
    if (found.expired) return sendJson(res, 410, { error: 'invitation expirée' })
    const accepted = storage.acceptInvitation(found.id, found.email)
    if (!accepted) return sendJson(res, 404, { error: 'invitation inconnue' })
    res.setHeader('set-cookie', sessionCookieHeader(found.email, { secure: isSecureRequest(req) }))
    return sendJson(res, 200, { docId: found.id, email: found.email, role: accepted.role })
  }

  // --- Gestion des accès d'un document (éditeurs seulement). ---

  const accessMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access$/)
  if (accessMatch && req.method === 'GET') {
    const id = accessMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    return sendJson(res, 200, { access: storage.getAccess(id) })
  }

  // Inviter une adresse précise (éditeurs seulement) : crée l'accès « en
  // attente » et envoie le mail. Si l'envoi échoue, l'invitation créée est
  // annulée — mieux vaut pas d'invitation du tout qu'une entrée « en
  // attente » dont personne n'a jamais reçu le lien.
  const inviteMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/invitations$/)
  if (inviteMatch && req.method === 'POST') {
    const id = inviteMatch[1]
    const doc = storage.getDoc(id)
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    const inviter = readSession(req)
    if (!capabilities(storage.roleFor(id, inviter)).canManageAccess) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    const role = String(body.role || '')
    if (!isValidRole(role)) return sendJson(res, 400, { error: 'rôle inconnu' })
    const existant = storage.getAccess(id).find((a) => a.email === email)
    if (existant && existant.status === 'actif') {
      return sendJson(res, 409, { error: 'cette personne a déjà accès au document' })
    }
    const { token, nouvelleEntree } = storage.inviteEmail(id, email, role, inviter)
    const lien = `${APP_BASE_URL}/#/invite/${token}`
    try {
      await sendMail({
        to: email,
        subject: `Invitation à collaborer sur « ${doc.title} »`,
        ...courrierAvecBouton({
          titre: `Invitation à collaborer sur « ${doc.title} »`,
          intro:
            `${inviter} vous invite à collaborer sur « ${doc.title} » dans Amend, ` +
            `comme ${capabilities(role).label.toLowerCase()}. Ce lien ouvre le document directement, ` +
            `sans mot de passe ni inscription. Il reste valable 14 jours.`,
          libelleBouton: 'Ouvrir le document',
          lien,
          apres: "Si vous n'attendiez pas cette invitation, ignorez ce message.",
        }),
      })
      metrics.log('mail', { type: 'invitation', ok: true })
    } catch (err) {
      console.error("Échec d'envoi de l'invitation :", err.message)
      metrics.log('mail', { type: 'invitation', ok: false, erreur: err.message })
      if (nouvelleEntree) storage.revokeAccess(id, email)
      return sendJson(res, 502, { error: "l'invitation n'a pas pu être envoyée" })
    }
    return sendJson(res, 200, { email, role, status: 'invite' })
  }

  const revokeMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access\/([^/]+)$/)
  if (revokeMatch && req.method === 'DELETE') {
    const id = revokeMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    storage.revokeAccess(id, decodeURIComponent(revokeMatch[2]))
    return sendJson(res, 200, { ok: true })
  }


  if (pathname === '/api/ai/suggest' && req.method === 'POST') {
    // Contrôle en deux temps depuis le 15/09/2026 : une session valide
    // (ferme la porte à un usage anonyme de la clé Anthropic du serveur),
    // puis le droit `canUseAI` sur le document concerné — la suggestion
    // consomme la clé de l'instance et écrit dans le document, deux choses
    // qu'un correcteur n'a pas à faire. Le quota par compte (modèle
    // FREE/PRO envisagé) reste à venir.
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    const docId = String(body.docId || '')
    if (!docId || !storage.getDoc(docId)) return sendJson(res, 400, { error: 'document inconnu' })
    if (!capabilities(storage.roleFor(docId, email)).canUseAI) {
      return sendJson(res, 403, { error: "votre rôle sur ce document ne permet pas d'utiliser l'IA" })
    }
    try {
      const { suggestion, usage } = await suggestEdit({}, body.text, body.instruction)
      metrics.log('ia', { email, docId, entree: usage.entree, sortie: usage.sortie })
      return sendJson(res, 200, { suggestion })
    } catch (err) {
      if (err instanceof AIConfigError) return sendJson(res, 501, { error: err.message })
      if (err instanceof AIRequestError) return sendJson(res, err.status || 502, { error: err.message })
      throw err
    }
  }

  // --- Liste d'attente publique (page d'accueil pour les visiteurs non
  // connectés) : juste stocker l'email pour l'instant, pas de gestion —
  // voir claude/conception-gestion-utilisateurs.md (projet Amend). ---
  // Le compteur est public, la liste ne l'est jamais (décision du 17/09) :
  // un nombre ne désigne personne, une liste d'adresses désigne tout le
  // monde. Deux routes distinctes, deux régimes d'accès.
  if (pathname === '/api/waitlist/count' && req.method === 'GET') {
    return sendJson(res, 200, { count: storage.waitlistCount() })
  }

  if (pathname === '/api/admin/waitlist' && req.method === 'GET') {
    if (!isAdminEmail(readSession(req))) return sendJson(res, 403, { error: 'réservé aux administrateurs' })
    return sendJson(res, 200, { inscrits: storage.waitlist() })
  }

  if (pathname === '/api/waitlist' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    storage.addToWaitlist(email)
    return sendJson(res, 200, { ok: true })
  }

  sendJson(res, 404, { error: 'not found' })
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      sendJson(res, err.status || 500, { error: err.message || 'erreur interne' })
    })
    return
  }
  serveStatic(req, res, url.pathname)
})

function rejectUpgrade(socket, status, message) {
  // Respond with a real HTTP error instead of an abrupt reset, so browsers
  // (and the WHATWG WebSocket client) reliably fire a close/error event
  // instead of hanging.
  try {
    socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`)
  } catch {
    socket.destroy()
  }
}

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost')
  const match = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]+)$/)
  if (!match || !isWebSocketUpgrade(req)) {
    rejectUpgrade(socket, 400, 'Bad Request')
    return
  }
  const docId = match[1]
  if (!storage.getDoc(docId)) {
    rejectUpgrade(socket, 404, 'Not Found')
    return
  }
  if (storage.hasAccessControl(docId) && !storage.roleFor(docId, readSession(req))) {
    rejectUpgrade(socket, 403, 'Forbidden')
    return
  }
  const user = (url.searchParams.get('user') || 'Anonyme').slice(0, 60)
  const conn = acceptWebSocket(req, socket)
  rooms.join(docId, conn, user)
  // Journal des connexions : la liste d'accès dit qui *peut* venir, elle ne
  // dit jamais qui vient (voir claude/conception-backoffice.md §3). On
  // n'enregistre que l'adresse de session, le document et la durée — jamais
  // ce qui a été écrit.
  // Une seule ligne par session, écrite à la fermeture : c'est elle qui
  // porte la durée, sans laquelle on ne peut pas savoir si deux personnes
  // étaient là *en même temps*. Les sessions interrompues par un
  // redémarrage du service sont perdues — le compte est donc un plancher.
  const debutConnexion = Date.now()
  const emailConnexion = readSession(req)
  conn.on('close', () => {
    metrics.log('connexions', { email: emailConnexion, docId, debut: debutConnexion, dureeMs: Date.now() - debutConnexion })
  })
})

server.listen(PORT, () => {
  console.log(`Amend en écoute sur http://localhost:${PORT}`)
  console.log(`Données stockées dans ${DATA_DIR}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "Astuce : définis ANTHROPIC_API_KEY (voir .env.example) pour activer les suggestions IA."
    )
  }
})

// storage.appendUpdate now buffers updates in memory for up to
// FLUSH_DELAY_MS before writing them to disk (see storage.js) — so on a
// normal stop/restart (systemd restart, Ctrl-C, `deploy.sh`...) we flush
// whatever's still buffered before actually exiting, instead of possibly
// losing the last fraction of a second's edits.
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} reçu, sauvegarde des dernières modifications avant arrêt…`)
  try {
    await storage.flushAll()
  } catch (err) {
    console.error('Erreur pendant la sauvegarde finale :', err)
  }
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
