// Le serveur d'amend.ink v2 (couche application) : identité, droits, et
// fichiers du client. Il ne tient pas le contenu des documents : c'est y/hub
// (ADR 0001, « notre serveur décide qui a le droit, y/hub tient ce que dit le
// document »). Ses réponses portent des codes, jamais des phrases (règle 25).
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { randomBytes } from 'node:crypto'
import { NOM_COOKIE, creerJeton, lireJeton, lireCookie } from './session.js'

const CONF = {
  port: Number(process.env.V2_PORT || 4300),
  secret: process.env.V2_SECRET || randomBytes(32).toString('hex'),
  jetonInterne: process.env.V2_JETON_INTERNE || '',
  dev: process.env.V2_DEV === '1',
  collaboration: process.env.V2_COLLAB_URL || 'ws://127.0.0.1:4400/collaboration/ws/v1/amend',
  statique: process.env.V2_STATIQUE || join(import.meta.dirname, '../../dist'),
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

function json(res, statut, corps, entetes = {}) {
  res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...entetes })
  res.end(JSON.stringify(corps))
}

async function lireCorps(req, max = 10_000) {
  let brut = ''
  for await (const morceau of req) {
    brut += morceau
    if (brut.length > max) throw Object.assign(new Error('trop gros'), { code: 'requete-trop-grosse' })
  }
  return brut ? JSON.parse(brut) : {}
}

const personneDe = (req) => lireJeton(CONF.secret, lireCookie(req.headers.cookie))

/** Étape 1 : toute personne connectée écrit dans tout document. Les vrais
 * droits (lecteur, correcteur, éditeur) arrivent à l'étape 3. */
const droitsSur = (/* docId, idPersonne */) => 'ecriture'

const routes = {
  'GET /api/config': (req, res) => json(res, 200, { collaboration: CONF.collaboration, dev: CONF.dev }),
  'GET /api/moi': (req, res) => {
    const p = personneDe(req)
    return p ? json(res, 200, p) : json(res, 401, { code: 'session-absente' })
  },
  'POST /api/dev/session': async (req, res) => {
    if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
    const { nom } = await lireCorps(req)
    const propre = String(nom || '')
      .normalize('NFC')
      .trim()
      .slice(0, 80)
    if (!propre) return json(res, 400, { code: 'nom-absent' })
    const id = `dev-${Buffer.from(propre.toLowerCase()).toString('base64url')}`
    const jeton = creerJeton(CONF.secret, { id, nom: propre })
    json(res, 200, { id, nom: propre }, { 'set-cookie': `${NOM_COOKIE}=${jeton}; Path=/; HttpOnly; SameSite=Lax` })
  },
  // Pour le processus de collaboration seulement (jeton interne).
  'GET /api/interne/droits': (req, res, url) => {
    if (!CONF.jetonInterne || req.headers['x-amend-interne'] !== CONF.jetonInterne)
      return json(res, 403, { code: 'interdit' })
    const docId = url.searchParams.get('document')
    const idPersonne = url.searchParams.get('personne')
    if (!docId || !idPersonne) return json(res, 400, { code: 'parametres-absents' })
    json(res, 200, { droit: droitsSur(docId, idPersonne) })
  },
}

async function servirFichier(res, chemin) {
  const relatif = normalize(chemin).replace(/^(\.\.[/\\])+/, '')
  const fichier = join(CONF.statique, relatif === '/' ? 'index.html' : relatif)
  if (!fichier.startsWith(CONF.statique)) return json(res, 404, { code: 'introuvable' })
  try {
    const contenu = await readFile(fichier)
    res.writeHead(200, { 'content-type': TYPES[extname(fichier)] || 'application/octet-stream' })
    res.end(contenu)
  } catch {
    const index = await readFile(join(CONF.statique, 'index.html')).catch(() => null)
    if (!index) return json(res, 404, { code: 'introuvable' })
    res.writeHead(200, { 'content-type': TYPES['.html'] })
    res.end(index)
  }
}

export function creerServeur() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local')
    const route = routes[`${req.method} ${url.pathname}`]
    try {
      if (route) return await route(req, res, url)
      if (url.pathname.startsWith('/api/')) return json(res, 404, { code: 'introuvable' })
      if (req.method === 'GET') return await servirFichier(res, url.pathname)
      json(res, 405, { code: 'methode-refusee' })
    } catch (err) {
      json(res, 400, { code: err.code || 'requete-invalide' })
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  creerServeur().listen(CONF.port, '127.0.0.1', () => console.log(`[serveur] http://127.0.0.1:${CONF.port}`))
}
