// Les fichiers du client compilé (`client/dist`), avec le repli d'application
// à page unique pour les routes du client. Extrait de `server.js` (audit du
// 10/10/2026, A7).

import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { sendJson } from './http.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  // Sans ce type, le manifeste part en application/octet-stream et les
  // navigateurs l'ignorent en silence — l'icône d'écran d'accueil ne
  // s'installe jamais, sans le moindre message.
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  // Sans ces deux types, robots.txt et security.txt partaient en
  // application/octet-stream (03/10/2026) : un robot d'indexation peut
  // alors les ignorer.
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
}

export function creerServiceStatique(CLIENT_DIST) {
  return function serveStatic(req, res, pathname) {
    if (!existsSync(CLIENT_DIST)) {
      sendJson(res, 503, {
        error: "Le client n'est pas encore compilé. Lance `npm run build:client` puis relance le serveur.",
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
}
