// Le serveur d'amend.ink v2 (couche application) : identité, droits, et
// fichiers du client. Il ne tient pas le contenu des documents : c'est y/hub
// (ADR 0001, « notre serveur décide qui a le droit, y/hub tient ce que dit le
// document »). Ses réponses portent des codes, jamais des phrases (règle 25).
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize, sep } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { NOM_COOKIE, creerJeton, lireJeton, lireCookie } from './session.js'
import { creerTableAcces } from './acces.js'
import { creerCommentaires } from './commentaires.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/index.js'
import { nomPersonne, identifiantDocument, ROLES, roleEffectif, capacites, accesBranche } from '../../domaine/index.js'

/** La configuration, lue dans l'environnement ; les tests passent la leur. */
const confDepuisEnv = () => ({
  port: Number(process.env.V2_PORT || 4300),
  // En ligne, pas de secret de repli : son absence doit arrêter le serveur
  // (sinon les sessions sauteraient à chaque redémarrage, sans alerte).
  secret: process.env.V2_SECRET || (process.env.V2_DEV === '1' ? randomBytes(32).toString('hex') : ''),
  jetonInterne: process.env.V2_JETON_INTERNE || '',
  dev: process.env.V2_DEV === '1',
  // En ligne (HTTPS derrière Caddy), le cookie de session n'est envoyé qu'en HTTPS.
  cookieSecure: process.env.V2_COOKIE_SECURE === '1',
  collaboration: process.env.V2_COLLAB_URL || 'ws://127.0.0.1:4400/collaboration/ws/v1/amend',
  // L'API de y/hub, pour notre serveur seulement (ancres des commentaires).
  collaborationApi: process.env.V2_COLLAB_API || 'http://127.0.0.1:4400/collaboration',
  statique: process.env.V2_STATIQUE || join(import.meta.dirname, '../../dist'),
  postgres: process.env.V2_POSTGRES || 'postgres://amendv2:amendv2-dev@127.0.0.1:5432/amendv2_yhub',
})

/** Comparaison à temps constant du jeton interne. */
function jetonValide(attendu, recu) {
  const a = Buffer.from(String(attendu || ''))
  const b = Buffer.from(String(recu || ''))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
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
  const corps = brut ? JSON.parse(brut) : {}
  if (!corps || typeof corps !== 'object' || Array.isArray(corps))
    throw Object.assign(new Error('corps invalide'), { code: 'requete-invalide' })
  return corps
}

/** Les rôles qu'un développeur peut donner par la route de développement :
 * tous sauf propriétaire (un seul, le créateur ; le transfert vient à l'étape 6). */
const ROLES_DONNABLES = ROLES.filter((r) => r !== 'proprietaire')

const creerRoutes = (CONF, table) => {
  // Les noms des personnes connues, pour afficher les auteurs (suggestions,
  // commentaires) : en mémoire jusqu'aux comptes de l'étape 6.
  const noms = new Map()
  const personneDe = (req) => {
    const p = lireJeton(CONF.secret, lireCookie(req.headers.cookie))
    if (p) noms.set(p.id, p.nom)
    return p
  }
  /** Le rôle effectif d'une personne sur un document : décidé par le domaine. */
  const roleSur = (docId, idPersonne) => roleEffectif(table.rolesDe(docId, idPersonne))
  const droitsDe = (role) => ({ role, capacites: capacites(role) })

  /** Pour les routes qui visent un document : session, puis identifiant
   * valide. Rend `null` après avoir répondu l'erreur. */
  function documentVise(req, res, docBrut) {
    const p = personneDe(req)
    const doc = identifiantDocument(docBrut)
    if (p && doc.ok) return { personne: p, docId: doc.id }
    if (!p) json(res, 401, { code: 'session-absente' })
    else json(res, 400, { code: doc.code })
    return null
  }

  return {
    'GET /api/config': (req, res) => json(res, 200, { collaboration: CONF.collaboration, dev: CONF.dev }),
    // Les noms d'une liste de personnes (`?id=a&id=b`), pour une personne
    // connectée ; un identifiant inconnu revient sans nom.
    'GET /api/personnes': (req, res, url) => {
      if (!personneDe(req)) return json(res, 401, { code: 'session-absente' })
      const ids = url.searchParams.getAll('id').slice(0, 100)
      json(
        res,
        200,
        ids.map((id) => ({ id, nom: noms.get(id) ?? null })),
      )
    },
    'GET /api/moi': (req, res) => {
      const p = personneDe(req)
      return p ? json(res, 200, p) : json(res, 401, { code: 'session-absente' })
    },
    'POST /api/dev/session': async (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      const { nom } = await lireCorps(req)
      const r = nomPersonne(nom)
      if (!r.ok) return json(res, 400, { code: r.code })
      const propre = r.nom
      const id = `dev-${Buffer.from(propre.toLowerCase()).toString('base64url')}`
      const jeton = creerJeton(CONF.secret, { id, nom: propre })
      noms.set(id, propre)
      json(
        res,
        200,
        { id, nom: propre },
        {
          'set-cookie': `${NOM_COOKIE}=${jeton}; Path=/; HttpOnly; SameSite=Lax${CONF.cookieSecure ? '; Secure' : ''}`,
        },
      )
    },
    // Mes droits sur un document. Document inconnu et document sans accès se
    // confondent (404) : on ne révèle pas qu'un document existe.
    'GET /api/droits': async (req, res, url) => {
      const v = documentVise(req, res, url.searchParams.get('document'))
      if (!v) return
      const role = roleSur(v.docId, v.personne.id)
      return role ? json(res, 200, droitsDe(role)) : json(res, 404, { code: 'document-introuvable' })
    },
    // Développement seulement (étape 6 : création et invitations réelles).
    'POST /api/dev/documents': async (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      const v = documentVise(req, res, (await lireCorps(req)).document)
      if (!v) return
      if (!table.creer(v.docId, v.personne.id)) return json(res, 409, { code: 'document-existe' })
      json(res, 201, droitsDe('proprietaire'))
    },
    // Donner (ou retirer, `role: null`) un rôle sur un document : réservé à qui
    // peut inviter (domaine) ; le propriétaire n'est ni nommé ni touché ici.
    'POST /api/dev/acces': async (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      const corps = await lireCorps(req)
      const v = documentVise(req, res, corps.document)
      if (!v) return
      const monRole = roleSur(v.docId, v.personne.id)
      if (!monRole) return json(res, 404, { code: 'document-introuvable' })
      if (!capacites(monRole).includes('inviter')) return json(res, 403, { code: 'droit-insuffisant' })
      const { personne, role } = corps
      if (typeof personne !== 'string' || !personne) return json(res, 400, { code: 'parametres-absents' })
      if (role !== null && !ROLES_DONNABLES.includes(role)) return json(res, 400, { code: 'role-invalide' })
      if (table.rolesDe(v.docId, personne).includes('proprietaire'))
        return json(res, 409, { code: 'proprietaire-intouchable' })
      if (role === null) table.retirer(v.docId, personne)
      else table.donner(v.docId, personne, role)
      json(res, 200, {})
    },
    // Pour le processus de collaboration seulement (jeton interne).
    'GET /api/interne/droits': (req, res, url) => {
      if (!jetonValide(CONF.jetonInterne, req.headers['x-amend-interne'])) return json(res, 403, { code: 'interdit' })
      const docId = url.searchParams.get('document')
      const idPersonne = url.searchParams.get('personne')
      const branche = url.searchParams.get('branche')
      if (!docId || !idPersonne || !branche) return json(res, 400, { code: 'parametres-absents' })
      json(res, 200, { acces: accesBranche(capacites(roleSur(docId, idPersonne)), branche) })
    },
  }
}

async function servirFichier(CONF, res, chemin) {
  const relatif = normalize(chemin).replace(/^(\.\.[/\\])+/, '')
  const fichier = join(CONF.statique, relatif === '/' ? 'index.html' : relatif)
  if (fichier !== CONF.statique && !fichier.startsWith(CONF.statique + sep))
    return json(res, 404, { code: 'introuvable' })
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

/**
 * @param {object} [CONF]
 * @param {ReturnType<typeof creerTableAcces>} [table]
 * @param {any} [depot] le dépôt des commentaires ; sans lui, leurs routes répondent 503
 */
export function creerServeur(CONF = confDepuisEnv(), table = creerTableAcces(), depot = null) {
  if (!CONF.secret) throw new Error('secret de session absent')
  const routes = creerRoutes(CONF, table)
  const commentaires = creerCommentaires({
    personneDe: (req) => lireJeton(CONF.secret, lireCookie(req.headers.cookie)),
    roleSur: (docId, idPersonne) => roleEffectif(table.rolesDe(docId, idPersonne)),
    depot,
    json,
    lireCorps,
    collaboration:
      CONF.collaborationApi && CONF.jetonInterne
        ? clientCollaboration({ url: CONF.collaborationApi, jeton: CONF.jetonInterne })
        : null,
  })
  return http.createServer(async (req, res) => {
    try {
      // L'analyse de l'adresse peut échouer (« // ») : dans le bloc protégé.
      let url
      try {
        url = new URL(req.url, 'http://local')
      } catch {
        return json(res, 400, { code: 'requete-invalide' })
      }
      const route = routes[`${req.method} ${url.pathname}`]
      if (route) return await route(req, res, url)
      if (await commentaires(req, res, url)) return
      if (Object.keys(routes).some((r) => r.endsWith(` ${url.pathname}`)))
        return json(res, 405, { code: 'methode-refusee' })
      if (url.pathname.startsWith('/api/')) return json(res, 404, { code: 'introuvable' })
      if (req.method === 'GET') return await servirFichier(CONF, res, url.pathname)
      json(res, 405, { code: 'methode-refusee' })
    } catch (err) {
      // Requête mal formée (corps trop gros, JSON illisible) : la faute du client.
      if (err.code === 'requete-trop-grosse') return json(res, 413, { code: err.code })
      if (err.code === 'requete-invalide' || err instanceof SyntaxError)
        return json(res, 400, { code: 'requete-invalide' })
      // Le reste est une erreur à nous : 500, et une trace dans le journal du service.
      console.error(`[serveur] ${req.method} ${req.url} :`, err)
      json(res, 500, { code: 'erreur-interne' })
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const CONF = confDepuisEnv()
  const depot = await ouvrirCommentaires(CONF.postgres)
  creerServeur(CONF, creerTableAcces(), depot).listen(CONF.port, '127.0.0.1', () =>
    console.log(`[serveur] http://127.0.0.1:${CONF.port}`),
  )
}
