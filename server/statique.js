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

/** La politique de cache d'un fichier du client, d'après son chemin relatif
 * (02/11/2026, docs/audit-chargement-2026-11-02.md) :
 *   - `assets/` : noms à empreinte (Vite), un contenu différent porte un autre
 *     nom → gardés un an sans revalidation ;
 *   - `index.html` (et le repli SPA) : revalidé à chaque fois (304 si inchangé),
 *     c'est lui qui désigne les fichiers de la version en cours ;
 *   - le reste de `public/` (icônes, manifeste, pages légales) : une heure. */
export function politiqueDeCache(rel) {
  if (rel.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (rel.endsWith('.html')) return 'no-cache'
  return 'public, max-age=3600'
}

/** Validateur faible tiré de la taille et de la date de modification : il
 * change à chaque build, sans relire le fichier. */
function etiquette(stat) {
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
}

/** Vrai si le navigateur a déjà cette version (If-None-Match, sinon
 * If-Modified-Since). */
function dejaAJour(req, etag, stat) {
  const inm = req.headers['if-none-match']
  if (inm) return inm.split(',').some((v) => v.trim() === etag || v.trim() === '*')
  const ims = Date.parse(req.headers['if-modified-since'] || '')
  return Number.isFinite(ims) && Math.floor(stat.mtimeMs / 1000) <= Math.floor(ims / 1000)
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
      rel = '/index.html'
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      // Un fichier de `assets/` absent est un fichier d'une version
      // précédente (un onglet resté ouvert pendant un déploiement) : un 404
      // franc, pas la page d'accueil servie comme du JavaScript.
      if (rel.startsWith('/assets/')) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end('not found')
        return
      }
      // SPA fallback for client-side routes.
      filePath = join(CLIENT_DIST, 'index.html')
      rel = '/index.html'
      if (!existsSync(filePath)) {
        sendJson(res, 404, { error: 'not found' })
        return
      }
    }
    const stat = statSync(filePath)
    const etag = etiquette(stat)
    const entetes = {
      'cache-control': politiqueDeCache(rel),
      etag,
      'last-modified': new Date(stat.mtimeMs).toUTCString(),
    }
    if (dejaAJour(req, etag, stat)) {
      res.writeHead(304, entetes)
      res.end()
      return
    }
    const type = MIME[extname(filePath)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': type, 'content-length': stat.size, ...entetes })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(filePath).pipe(res)
  }
}
