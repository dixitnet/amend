import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { isWebSocketUpgrade, acceptWebSocket } from './ws.js'
import { Storage } from './storage.js'
import { Rooms } from './rooms.js'
import { suggestEdit, AIConfigError, AIRequestError } from './ai.js'
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
import { sendMail } from './mailgun.js'
import { capabilities } from './roles.js'

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

const storage = new Storage(DATA_DIR)
const rooms = new Rooms(storage)

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
    return sendJson(res, 200, { ...doc, myRole: myRole || 'editeur', onlineCount: rooms.presenceCount(doc.id) })
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
    return sendJson(res, 200, { ok })
  }

  // Historique léger (voir storage.js : getHistoryMeta/getHistoryRaw/
  // compactDoc) — pas de gestion de droits ici pour cette première version
  // (voir la conception plus complète dans README.md), la page d'historique
  // est accessible comme le reste de l'app à qui a l'URL du document.
  const historyMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/history$/)
  if (historyMatch && req.method === 'GET') {
    if (!storage.getDoc(historyMatch[1])) return sendJson(res, 404, { error: 'document introuvable' })
    return sendJson(res, 200, storage.getHistoryMeta(historyMatch[1]))
  }

  const historyRawMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/history\/raw$/)
  if (historyRawMatch && req.method === 'GET') {
    if (!storage.getDoc(historyRawMatch[1])) return sendJson(res, 404, { error: 'document introuvable' })
    return sendJson(res, 200, { entries: storage.getHistoryRaw(historyRawMatch[1]) })
  }

  const compactMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/compact$/)
  if (compactMatch && req.method === 'POST') {
    const id = compactMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
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

  // --- Authentification (voir claude/conception-gestion-utilisateurs.md,
  // projet Amend) : reconnexion par lien magique, valable pour toute
  // adresse (pas seulement celles ayant déjà accès à un document — créer
  // un nouveau document, dont on devient éditeur, ne demande rien de plus). ---

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    return sendJson(res, 200, { email: readSession(req) })
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
          text: `Cliquez sur ce lien pour vous connecter à Amend (valable 20 minutes) :\n\n${link}\n\nSi vous n'avez rien demandé, ignorez cet email.`,
        })
      } catch (err) {
        console.error("Échec d'envoi d'email de reconnexion :", err.message)
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

  // --- Lien d'invitation : auto-connectant, réutilisable par plusieurs
  // personnes (un par document et par rôle) ; chaque personne qui l'utilise
  // déclare sa propre adresse (pas vérifiée par possession de boîte mail à
  // ce stade — voir le document de conception). ---

  const inviteMatch = pathname.match(/^\/api\/invite\/([A-Za-z0-9_-]+)$/)
  if (inviteMatch && req.method === 'GET') {
    const found = storage.findInviteLink(inviteMatch[1])
    if (!found) return sendJson(res, 404, { error: 'lien invalide' })
    const doc = storage.getDoc(found.id)
    if (!doc) return sendJson(res, 404, { error: 'lien invalide' })
    return sendJson(res, 200, { docId: found.id, docTitle: doc.title, role: found.role })
  }

  if (inviteMatch && req.method === 'POST') {
    const found = storage.findInviteLink(inviteMatch[1])
    if (!found || !storage.getDoc(found.id)) return sendJson(res, 404, { error: 'lien invalide' })
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    storage.grantAccess(found.id, email, found.role)
    res.setHeader('set-cookie', sessionCookieHeader(email, { secure: isSecureRequest(req) }))
    return sendJson(res, 200, { docId: found.id })
  }

  // --- Gestion des accès d'un document (éditeurs seulement). ---

  const accessMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access$/)
  if (accessMatch && req.method === 'GET') {
    const id = accessMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    return sendJson(res, 200, {
      access: storage.getAccess(id),
      inviteLinks: {
        editeur: storage.getOrCreateInviteLink(id, 'editeur'),
        correcteur: storage.getOrCreateInviteLink(id, 'correcteur'),
      },
    })
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

  const regenMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/invite-link\/(editeur|correcteur)\/regenerate$/)
  if (regenMatch && req.method === 'POST') {
    const [, id, linkRole] = regenMatch
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    return sendJson(res, 200, { token: storage.regenerateInviteLink(id, linkRole) })
  }

  if (pathname === '/api/ai/suggest' && req.method === 'POST') {
    // Vérification volontairement grossière pour l'instant (n'importe
    // quelle session valide, pas de lien avec un document précis ni de
    // quota) — ferme la porte à un usage anonyme qui consommerait la clé
    // Anthropic du serveur ; un contrôle plus fin (par document, avec les
    // quotas FREE/PRO envisagés) reste à faire séparément.
    if (!readSession(req)) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    try {
      const suggestion = await suggestEdit({}, body.text, body.instruction)
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
