import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { isWebSocketUpgrade, acceptWebSocket } from './ws.js'
import { Storage } from './storage.js'
import { Rooms } from './rooms.js'
import { suggestEdit, AIConfigError, AIRequestError } from './ai.js'

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
const MAX_JSON_BODY = 20_000

const storage = new Storage(DATA_DIR)
const rooms = new Rooms(storage)

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_JSON_BODY) {
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
    return sendJson(res, 200, { docs: storage.listDocs() })
  }

  if (pathname === '/api/docs' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const doc = storage.createDoc(typeof body.title === 'string' ? body.title.slice(0, 200) : '')
    return sendJson(res, 201, doc)
  }

  const docMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)$/)
  if (docMatch && req.method === 'GET') {
    const doc = storage.getDoc(docMatch[1])
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    return sendJson(res, 200, { ...doc, onlineCount: rooms.presenceCount(doc.id) })
  }
  if (docMatch && req.method === 'PATCH') {
    const body = await readJsonBody(req)
    const doc = storage.renameDoc(docMatch[1], String(body.title || '').slice(0, 200))
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    return sendJson(res, 200, doc)
  }

  const starMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/star$/)
  if (starMatch && req.method === 'PATCH') {
    const body = await readJsonBody(req)
    const doc = storage.starDoc(starMatch[1], !!body.starred)
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    return sendJson(res, 200, doc)
  }

  if (pathname === '/api/style' && req.method === 'GET') {
    return sendJson(res, 200, storage.getStyle())
  }
  if (pathname === '/api/style' && req.method === 'PUT') {
    const body = await readJsonBody(req)
    return sendJson(res, 200, storage.setStyle(body))
  }

  if (pathname === '/api/ai/suggest' && req.method === 'POST') {
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
