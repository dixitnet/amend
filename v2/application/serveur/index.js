// Le serveur d'amend.ink v2 (couche application) : identité, droits, et
// fichiers du client. Il ne tient pas le contenu des documents : c'est y/hub
// (ADR 0001, « notre serveur décide qui a le droit, y/hub tient ce que dit le
// document »). Ses réponses portent des codes, jamais des phrases (règle 25).
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize, sep } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { NOM_COOKIE, creerJeton, lireJeton, lireCookie } from './session.js'
import { creerComptes } from './comptes.js'
import { creerCommentaires } from './commentaires.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { creerCourrier } from '../../adaptateurs/courrier/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
import {
  nomPersonne,
  identifiantDocument,
  roleEffectif,
  capacites,
  accesBranche,
  refusAcces,
  DUREE_SESSION_MS,
} from '../../domaine/index.js'

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
  // En ligne, pas de repli : l'absence de la base doit arrêter le serveur.
  // L'adresse publique de l'application (liens des courriers, contrôle d'origine).
  adresse: process.env.V2_ADRESSE || `http://127.0.0.1:${process.env.V2_PORT || 4300}`,
  // Courrier : sans clé, les courriers sont écrits dans le journal, jamais envoyés.
  mailgunCle: process.env.V2_MAILGUN_CLE || '',
  mailgunDomaine: process.env.V2_MAILGUN_DOMAINE || '',
  expediteur: process.env.V2_EXPEDITEUR || 'amend.ink <ne-pas-repondre@amend.ink>',
  postgres:
    process.env.V2_POSTGRES ||
    (process.env.V2_DEV === '1' ? 'postgres://amendv2:amendv2-dev@127.0.0.1:5432/amendv2_yhub' : ''),
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

/** La personne d'une requête : session signée, de moins de 30 jours, émise
 * après le dernier « déconnecter partout » (domaine, dépôt des comptes). */
function creerIdentite(CONF, comptes) {
  const personneDe = async (req) => {
    const p = lireJeton(CONF.secret, lireCookie(req.headers.cookie))
    if (!p || Date.now() - p.emis > DUREE_SESSION_MS || p.emis > Date.now() + 60_000) return null
    const valideDepuis = await comptes.sessionsValidesDepuis(p.id)
    if (valideDepuis === null || p.emis < valideDepuis) return null
    return { id: p.id, nom: p.nom }
  }
  const attributs = `Path=/; HttpOnly; SameSite=Lax${CONF.cookieSecure ? '; Secure' : ''}`
  const cookieDeSession = (p) =>
    `${NOM_COOKIE}=${creerJeton(CONF.secret, p)}; ${attributs}; Max-Age=${DUREE_SESSION_MS / 1000}`
  return { personneDe, cookieDeSession, cookieEfface: `${NOM_COOKIE}=; ${attributs}; Max-Age=0` }
}

const creerRoutes = (CONF, comptes, { personneDe, cookieDeSession }, courrier) => {
  /** Le rôle effectif d'une personne sur un document : décidé par le domaine. */
  const roleSur = async (docId, idPersonne) => roleEffectif(await comptes.rolesDe(docId, idPersonne))
  const droitsDe = (role) => ({ role, capacites: capacites(role) })

  /** Pour les routes qui visent un document : session, puis identifiant
   * valide. Rend `null` après avoir répondu l'erreur. */
  async function documentVise(req, res, docBrut) {
    const p = await personneDe(req)
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
    'GET /api/personnes': async (req, res, url) => {
      if (!(await personneDe(req))) return json(res, 401, { code: 'session-absente' })
      const ids = url.searchParams.getAll('id').slice(0, 100)
      const connus = new Map((await comptes.noms(ids)).map((p) => [p.id, p.nom]))
      json(
        res,
        200,
        ids.map((id) => ({ id, nom: connus.get(id) ?? null })),
      )
    },
    'GET /api/moi': async (req, res) => {
      const p = await personneDe(req)
      return p ? json(res, 200, p) : json(res, 401, { code: 'session-absente' })
    },
    // Développement seulement : les courriers gardés en mémoire (sans clé
    // Mailgun), pour les essais et les tests de bout en bout.
    'GET /api/dev/courriers': (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      json(res, 200, courrier.envoyes ?? [])
    },
    // Développement seulement : une personne par nom, sans courriel.
    'POST /api/dev/session': async (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      const { nom } = await lireCorps(req)
      const r = nomPersonne(nom)
      if (!r.ok) return json(res, 400, { code: r.code })
      const courriel = `${Buffer.from(r.nom.toLowerCase()).toString('hex')}@dev.amend.invalid`
      const p = await comptes.personneOuNouvelle(courriel)
      await comptes.definirNom(p.id, r.nom)
      json(res, 200, { id: p.id, nom: r.nom }, { 'set-cookie': cookieDeSession({ id: p.id, nom: r.nom }) })
    },
    // Mes droits sur un document. Document inconnu et document sans accès se
    // confondent (404) : on ne révèle pas qu'un document existe. Une personne
    // connectée qui arrive sur un document au lien ouvert y gagne le rôle du
    // lien (comme Docs ; arbitrage 6b de l'étape 6a).
    'GET /api/droits': async (req, res, url) => {
      const v = await documentVise(req, res, url.searchParams.get('document'))
      if (!v) return
      let role = await roleSur(v.docId, v.personne.id)
      if (!role && (await comptes.document(v.docId))?.roleLien) {
        await comptes.noterPassageParLien(v.docId, v.personne.id)
        role = await roleSur(v.docId, v.personne.id)
      }
      return role ? json(res, 200, droitsDe(role)) : json(res, 404, { code: 'document-introuvable' })
    },
    // Développement seulement : un document au nom choisi (adresses lisibles des essais).
    'POST /api/dev/documents': async (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      const v = await documentVise(req, res, (await lireCorps(req)).document)
      if (!v) return
      if (await comptes.document(v.docId)) return json(res, 409, { code: 'document-existe' })
      await comptes.creerDocument(v.docId, v.personne.id)
      json(res, 201, droitsDe('proprietaire'))
    },
    // Développement seulement : donner (ou retirer, `role: null`) un rôle à
    // une personne connue par son identifiant, selon les règles du domaine.
    'POST /api/dev/acces': async (req, res) => {
      if (!CONF.dev) return json(res, 404, { code: 'introuvable' })
      const corps = await lireCorps(req)
      const v = await documentVise(req, res, corps.document)
      if (!v) return
      const monRole = await roleSur(v.docId, v.personne.id)
      if (!monRole) return json(res, 404, { code: 'document-introuvable' })
      const { personne, role } = corps
      if (typeof personne !== 'string' || !personne || !(await comptes.personne(personne)))
        return json(res, 400, { code: 'parametres-absents' })
      if (role === undefined) return json(res, 400, { code: 'role-invalide' })
      const actuel = await comptes.acces(v.docId, personne)
      const refus = refusAcces(capacites(monRole), actuel, role, await comptes.proprietaires(v.docId))
      if (refus)
        return json(res, refus === 'droit-insuffisant' ? 403 : refus === 'dernier-proprietaire' ? 409 : 400, {
          code: refus,
        })
      if ((await comptes.modifierAcces(v.docId, personne, role)) === 'dernier-proprietaire')
        return json(res, 409, { code: 'dernier-proprietaire' })
      json(res, 200, {})
    },
    // Pour le processus de collaboration seulement (jeton interne).
    'GET /api/interne/droits': async (req, res, url) => {
      if (!jetonValide(CONF.jetonInterne, req.headers['x-amend-interne'])) return json(res, 403, { code: 'interdit' })
      const docId = url.searchParams.get('document')
      const idPersonne = url.searchParams.get('personne')
      const branche = url.searchParams.get('branche')
      if (!docId || !idPersonne || !branche) return json(res, 400, { code: 'parametres-absents' })
      json(res, 200, { acces: accesBranche(capacites(await roleSur(docId, idPersonne)), branche) })
    },
  }
}

/** Protection contre les requêtes envoyées à l'insu de la personne (CSRF),
 * en plus de `SameSite=Lax` : une requête qui modifie et vient d'une autre
 * origine est refusée. */
function origineAdmise(CONF, req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origine = req.headers.origin
  return !origine || origine === new URL(CONF.adresse).origin
}

/** Relaie une requête HTTP vers y/hub (développement seulement). */
function relayer(CONF, req, res) {
  const cible = new URL(req.url, CONF.collaborationApi.replace(/\/collaboration$/, '/'))
  return new Promise((fini) => {
    const amont = http.request(cible, { method: req.method, headers: req.headers }, (rep) => {
      res.writeHead(rep.statusCode, rep.headers)
      rep.pipe(res).on('finish', fini)
    })
    amont.on('error', () => (json(res, 502, { code: 'collaboration-indisponible' }), fini()))
    req.pipe(amont)
  })
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
 * @param {{ comptes: any, commentaires?: any, courrier?: any, collaboration?: any }} services
 *   les dépôts (adaptateur PostgreSQL), le courrier, l'accès de notre serveur à y/hub ;
 *   sans dépôt des commentaires, leurs routes répondent 503
 */
export function creerServeur(CONF = confDepuisEnv(), services = {}) {
  if (!CONF.secret) throw new Error('secret de session absent')
  const { comptes, commentaires: depotCommentaires = null } = services
  const courrier = services.courrier ?? creerCourrier({ expediteur: CONF.expediteur })
  const collaboration =
    services.collaboration ??
    (CONF.collaborationApi && CONF.jetonInterne
      ? clientCollaboration({ url: CONF.collaborationApi, jeton: CONF.jetonInterne })
      : null)
  const identite = creerIdentite(CONF, comptes)
  const routes = creerRoutes(CONF, comptes, identite, courrier)
  const commentaires = creerCommentaires({
    personneDe: identite.personneDe,
    roleSur: async (docId, idPersonne) => roleEffectif(await comptes.rolesDe(docId, idPersonne)),
    depot: depotCommentaires,
    json,
    lireCorps,
    collaboration,
  })
  const partage = creerComptes({
    CONF,
    comptes,
    commentaires: depotCommentaires,
    courrier,
    collaboration,
    personneDe: identite.personneDe,
    json,
    lireCorps,
    cookieDeSession: identite.cookieDeSession,
    cookieEfface: identite.cookieEfface,
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
      // En développement, les routes de y/hub sur la même adresse que la page,
      // comme Caddy en ligne (les cookies de session les accompagnent).
      if (CONF.dev && url.pathname.startsWith('/collaboration/')) return relayer(CONF, req, res)
      // Avant toute route : une requête qui modifie et vient d'ailleurs est refusée (audit, 09/11/2026).
      if (url.pathname.startsWith('/api/') && !origineAdmise(CONF, req))
        return json(res, 403, { code: 'origine-refusee' })
      const route = routes[`${req.method} ${url.pathname}`]
      if (route) return await route(req, res, url)
      if (await commentaires(req, res, url)) return
      if (await partage(req, res, url)) return
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
  if (!CONF.postgres) throw new Error('base PostgreSQL absente (V2_POSTGRES)')
  const services = {
    comptes: await ouvrirComptes(CONF.postgres),
    commentaires: await ouvrirCommentaires(CONF.postgres),
    courrier: creerCourrier({ cle: CONF.mailgunCle, domaine: CONF.mailgunDomaine, expediteur: CONF.expediteur }),
  }
  creerServeur(CONF, services).listen(CONF.port, '127.0.0.1', () =>
    console.log(`[serveur] http://127.0.0.1:${CONF.port}`),
  )
}
