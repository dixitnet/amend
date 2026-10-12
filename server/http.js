// Les briques HTTP communes aux routes (point 43 de la feuille de route,
// 11/10/2026) : réponse JSON, lecture des corps, origine de la requête.

import { ErreurHttp } from './erreurs.js'

/** Rendu par une route qui ne reconnaît pas la requête : la suivante essaie. */
export const PAS_TRAITE = Symbol('pas-traite')

const MAX_JSON_BODY = 20_000

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function readJsonBody(req, maxSize = MAX_JSON_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    // `depasse` plutôt que `req.destroy()` (23/09/2026). Couper la socket
    // ici empêchait la réponse 413 de partir : l'appelant la demandait sur
    // une connexion déjà morte, le client ne recevait rien, et derrière un
    // reverse proxy cela se lit « 502 Bad Gateway ». On cesse d'accumuler,
    // on laisse le reste du corps s'écouler à la poubelle, et la réponse
    // part normalement.
    let depasse = false
    req.on('data', (chunk) => {
      if (depasse) return
      size += chunk.length
      if (size > maxSize) {
        depasse = true
        chunks.length = 0
        reject(new ErreurHttp(413, 'payload too large'))
        req.resume()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (depasse) return
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new ErreurHttp(400, 'invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** Même principe que readJsonBody, mais on garde les octets tels quels :
 * le dépôt d'une image est un POST binaire brut, avec le type dans
 * `content-type`. Pas de multipart, donc pas d'analyseur multipart à
 * écrire — le client n'envoie jamais qu'un fichier à la fois. */
export function readBinaryBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    let size = 0
    let depasse = false
    const chunks = []
    req.on('data', (chunk) => {
      if (depasse) return
      size += chunk.length
      if (size > maxSize) {
        // Même défaut que readJsonBody corrigé le 23/09 : couper la socket
        // ici empêchait le 413 de partir (Caddy répondait 502). On jette la
        // suite du corps, on répond, et la connexion est fermée ensuite.
        depasse = true
        chunks.length = 0
        reject(new ErreurHttp(413, 'image trop lourde'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!depasse) resolve(Buffer.concat(chunks))
    })
    req.on('error', reject)
  })
}

/** Un segment d'adresse décodé ; `%E0` seul donne un 400 et non une 500
 * (audit du 10/10/2026, A3). */
export function decoderSegment(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    throw new ErreurHttp(400, 'adresse invalide')
  }
}

/** D'où vient la requête. Derrière Caddy, la connexion est toujours
 * locale : on lit alors le premier maillon de X-Forwarded-For, que Caddy
 * écrase avec l'adresse réelle du client. */
export function origineDe(req) {
  const ip = req.socket.remoteAddress || 'inconnue'
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    const transmis = req.headers['x-forwarded-for']
    if (transmis) return String(transmis).split(',')[0].trim().slice(0, 64) || ip
  }
  return ip
}
