// Le serveur d'amend.ink v2 (couche application) : identité, droits, et
// fichiers du client. Il ne tient pas le contenu des documents : c'est y/hub
// (ADR 0001, « notre serveur décide qui a le droit, y/hub tient ce que dit le
// document »). Ses réponses portent des codes, jamais des phrases (règle 25).
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize, sep } from 'node:path'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { NOM_COOKIE, creerJeton, lireJeton, lireCookie } from './session.js'
import { creerComptes } from './comptes.js'
import { creerCommentaires } from './commentaires.js'
import { creerMargo } from './margo.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { creerCourrier } from '../../adaptateurs/courrier/index.js'
import { creerImages } from './images.js'
import { adresseSansSecret } from './adresse.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
import { creerIA, MODELES, MODELE_PAR_DEFAUT } from '../../adaptateurs/ia/index.js'
import { APPARENCE, apparenceRetenue } from '../../design/apparence.js'
import {
  listeAdministrateurs,
  estAdministrateur,
  numeroDeVersion,
  adresseAide,
  nomPersonne,
  identifiantDocument,
  roleEffectif,
  capacites,
  accesBranche,
  refusAcces,
  DUREE_SESSION_MS,
  AUTEUR_MARGO,
  evenementDeReponse,
  mesureValable,
  DUREE_MESURES_MS,
  PAS_MESURE_MS,
} from '../../domaine/index.js'

/** La configuration, lue dans l'environnement ; les tests passent la leur. */
const confDepuisEnv = () => ({
  port: Number(process.env.V2_PORT || 4300),
  // En ligne, pas de secret de repli : son absence doit arrêter le serveur
  // (sinon les sessions sauteraient à chaque redémarrage, sans alerte).
  secret: process.env.V2_SECRET || (process.env.V2_DEV === '1' ? randomBytes(32).toString('hex') : ''),
  jetonInterne: process.env.V2_JETON_INTERNE || '',
  // Comptes d'essai de Claude (09/11/2026) : la clé ouvre /api/essai/session,
  // et seulement pour des comptes en @essai.amend.invalid ; vide : fermé.
  jetonEssai: process.env.V2_JETON_ESSAI || '',
  // Les administrateurs de l'instance (back-office) : des adresses séparées par des virgules.
  administrateurs: process.env.V2_ADMINS || '',
  // L'adresse de l'aide (pages statiques, lot du 11/11/2026) ; vide : pas d'entrée « Aide ».
  aide: process.env.V2_AIDE_URL || '',
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
  // Margo (étape 8) : le modèle, et les clés des fournisseurs ; sans clé, Margo
  // répond « indisponible ». Le modèle par défaut est celui de la v1.
  margoModele: process.env.V2_MARGO_MODELE || MODELE_PAR_DEFAUT,
  cleAnthropic: process.env.V2_ANTHROPIC_CLE || '',
  cleScaleway: process.env.V2_SCALEWAY_CLE || '',
  postgres:
    process.env.V2_POSTGRES ||
    (process.env.V2_DEV === '1' ? 'postgres://amendv2:amendv2-dev@127.0.0.1:5432/amendv2_yhub' : ''),
})

/** Les comptes d'essai de Claude (adresses qui ne reçoivent jamais de courrier). */
const DOMAINE_ESSAI = 'essai.amend.invalid'
const LONGUEUR_MIN_CLE_ESSAI = 32

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
  // Le compilateur Typst des exports (WebAssembly) et les polices du livre :
  // avec leur vrai type, Caddy les compresse et le navigateur compile le
  // WebAssembly pendant le téléchargement.
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

// Comme Docs (`conf/default.conf`) : les fichiers construits portent une
// empreinte dans leur nom et ne changent jamais, le navigateur les garde ;
// tout le reste (la page) est revalidé, pour charger la version en service.
const ASSETS = '/assets/'
const GARDER = 'public, max-age=31536000, immutable'
const REVALIDER = 'no-cache'

// En-têtes de sécurité, comme Docs (10/11/2026) : la page ne s'affiche dans
// le cadre d'aucun autre site (`X-Frame-Options DENY` de son `default.conf`),
// le type annoncé fait foi et l'adresse ne part pas vers d'autres sites (valeurs
// par défaut de Django) ; les réponses de l'API n'autorisent rien
// (`default-src 'none'`, sa politique de contenu). La page elle-même n'a pas de
// politique de contenu, comme celle de Docs.
const SECURITE = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
}
const SECURITE_API = "default-src 'none'; frame-ancestors 'none'"
function poserSecurite(req, res) {
  for (const [nom, valeur] of Object.entries(SECURITE)) res.setHeader(nom, valeur)
  if (req.url?.startsWith('/api/')) res.setHeader('content-security-policy', SECURITE_API)
}

function json(res, statut, corps, entetes = {}) {
  // Le code rendu, pour le journal du back-office (voir `noterReponse`).
  res.codeRendu = corps?.code
  res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...entetes })
  res.end(JSON.stringify(corps))
}

async function lireCorps(req, max = 10_000) {
  // Les paquets sont accumulés tels quels, bornés en octets, puis décodés d'un
  // seul bloc : un caractère multi-octets coupé entre deux paquets reste entier.
  const morceaux = []
  let taille = 0
  for await (const morceau of req) {
    taille += morceau.length
    if (taille > max) throw Object.assign(new Error('trop gros'), { code: 'requete-trop-grosse' })
    morceaux.push(morceau)
  }
  const brut = Buffer.concat(morceaux).toString('utf8')
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

/** La version en service, lue au démarrage (la v2 redémarre à chaque
 * déploiement) : le commit (vérification des déploiements de l'extérieur),
 * le numéro 2.NNN (fusions dans main qui touchent v2/) et la date du commit,
 * pour le back-office. Tout à `null` hors d'un dépôt git. */
const VERSION = (() => {
  const git = (...a) =>
    execFileSync('git', a, {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  try {
    const racine = git('rev-parse', '--show-toplevel')
    return {
      commit: git('rev-parse', '--short=7', 'HEAD'),
      numero: numeroDeVersion(Number(git('-C', racine, 'rev-list', '--count', '--first-parent', 'HEAD', '--', 'v2'))),
      date: Date.parse(git('log', '-1', '--format=%cI')) || null,
    }
  } catch {
    return { commit: null, numero: null, date: null }
  }
})()
const DEMARRAGE = Date.now()

/** La clé du réglage du modèle de Margo (back-office). */
const REGLAGE_MODELE = 'margo.modele'
/** La clé du réglage de l'apparence de l'instance (back-office, 11/11/2026). */
const REGLAGE_APPARENCE = 'apparence'

const creerRoutes = (CONF, comptes, { personneDe, cookieDeSession }, courrier, ia, collaboration = null) => {
  const administrateurs = listeAdministrateurs(CONF.administrateurs)
  /** Une personne connectée est-elle administratrice de l'instance ? (son adresse, en base) */
  const administrateur = async (p) =>
    administrateurs.size > 0 && estAdministrateur((await comptes.personne(p.id))?.courriel, administrateurs)
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
    'GET /api/config': async (req, res) => {
      // L'apparence de l'instance : un réglage illisible ne bloque pas
      // l'application, qui prend l'apparence par défaut.
      const apparence = apparenceRetenue(
        await comptes.reglage(REGLAGE_APPARENCE).catch((err) => {
          console.error('[config] réglage de l’apparence illisible :', err.code ?? err.message)
          return null
        }),
      )
      json(res, 200, {
        collaboration: CONF.collaboration,
        dev: CONF.dev,
        version: VERSION.commit,
        aide: adresseAide(CONF.aide),
        apparence,
      })
    },
    // Les noms d'une liste de personnes (`?id=a&id=b`), pour une personne
    // connectée ; un identifiant inconnu revient sans nom.
    'GET /api/personnes': async (req, res, url) => {
      if (!(await personneDe(req))) return json(res, 401, { code: 'session-absente' })
      const ids = url.searchParams.getAll('id').slice(0, 100)
      const connus = new Map((await comptes.noms(ids)).map((p) => [p.id, p.nom]))
      // Margo n'est pas une personne : son nom se traduit dans l'interface.
      json(
        res,
        200,
        ids.map((id) =>
          id === AUTEUR_MARGO ? { id, nom: null, agent: 'margo' } : { id, nom: connus.get(id) ?? null },
        ),
      )
    },
    'GET /api/moi': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      return json(res, 200, { ...p, admin: await administrateur(p) })
    },
    // Back-office, rubrique Système : réservé aux administrateurs de l'instance.
    'GET /api/admin/systeme': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      if (!(await administrateur(p))) return json(res, 403, { code: 'reserve-administrateur' })
      json(res, 200, {
        version: VERSION,
        demarrage: DEMARRAGE,
        memoire: process.memoryUsage().rss,
        node: process.version,
        comptes: await comptes.statistiques(),
      })
    },
    // Back-office, suivi (Sylvain, 11/11/2026) : le journal des erreurs et des
    // refus inhabituels, et la mémoire des processus sur sept jours.
    'GET /api/admin/suivi': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      if (!(await administrateur(p))) return json(res, 403, { code: 'reserve-administrateur' })
      // Sept jours à l'écran, pour la mémoire comme pour le journal (ses 200
      // lignes les plus récentes) ; le journal est gardé 30 jours dans la base.
      const depuis = Date.now() - DUREE_MESURES_MS
      json(res, 200, { journal: await comptes.journal(depuis), mesures: await comptes.mesures(depuis) })
    },
    // Back-office, rubrique IA (étape 8, « backoffice simple », Sylvain,
    // 11/11/2026) : le modèle de Margo, parmi ceux de l'adaptateur ; ceux dont
    // le fournisseur n'a pas de clé ne se choisissent pas.
    'GET /api/admin/ia': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      if (!(await administrateur(p))) return json(res, 403, { code: 'reserve-administrateur' })
      const choisi = await comptes.reglage(REGLAGE_MODELE)
      json(res, 200, {
        modele: typeof choisi === 'string' && MODELES[choisi] ? choisi : null,
        defaut: MODELES[CONF.margoModele] ? CONF.margoModele : MODELE_PAR_DEFAUT,
        modeles: Object.keys(MODELES).map((id) => ({ id, disponible: ia.disponible(id) })),
      })
    },
    'PUT /api/admin/ia': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      if (!(await administrateur(p))) return json(res, 403, { code: 'reserve-administrateur' })
      const { modele } = await lireCorps(req)
      if (typeof modele !== 'string' || !Object.hasOwn(MODELES, modele))
        return json(res, 400, { code: 'modele-inconnu' })
      if (!ia.disponible(modele)) return json(res, 409, { code: 'modele-sans-cle' })
      await comptes.definirReglage(REGLAGE_MODELE, modele, p.id)
      console.log(`[admin] modèle de Margo : ${modele}`)
      json(res, 200, { modele })
    },
    // Back-office, rubrique Apparence (Sylvain, 11/11/2026) : le modèle
    // d'interface et la couleur de l'instance, parmi ceux du design.
    'GET /api/admin/apparence': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      if (!(await administrateur(p))) return json(res, 403, { code: 'reserve-administrateur' })
      json(res, 200, {
        apparence: apparenceRetenue(await comptes.reglage(REGLAGE_APPARENCE)),
        modeles: APPARENCE.modeles,
        couleurs: APPARENCE.couleurs,
      })
    },
    'PUT /api/admin/apparence': async (req, res) => {
      const p = await personneDe(req)
      if (!p) return json(res, 401, { code: 'session-absente' })
      if (!(await administrateur(p))) return json(res, 403, { code: 'reserve-administrateur' })
      const { modele, couleur } = await lireCorps(req)
      if (!APPARENCE.modeles.includes(modele) || !APPARENCE.couleurs.includes(couleur))
        return json(res, 400, { code: 'apparence-inconnue' })
      await comptes.definirReglage(REGLAGE_APPARENCE, { modele, couleur }, p.id)
      console.log(`[admin] apparence : ${modele}, ${couleur}`)
      json(res, 200, { apparence: { modele, couleur } })
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
    // Comptes d'essai de Claude, en ligne sans V2_DEV (Sylvain, 09/11/2026) :
    // une personne par nom, seulement en @essai.amend.invalid (jamais un vrai
    // compte, jamais de courrier), sur présentation de la clé d'essai (au
    // moins 32 signes, comparée à temps constant). Sans clé, la route n'existe pas.
    'POST /api/essai/session': async (req, res) => {
      const cle = String(CONF.jetonEssai || '')
      if (cle.length < LONGUEUR_MIN_CLE_ESSAI || !jetonValide(cle, req.headers['x-amend-essai-token']))
        return json(res, 404, { code: 'introuvable' })
      const { nom } = await lireCorps(req)
      const r = nomPersonne(nom)
      if (!r.ok) return json(res, 400, { code: r.code })
      const courriel = `${Buffer.from(r.nom.toLowerCase()).toString('hex')}@${DOMAINE_ESSAI}`
      const p = await comptes.personneOuNouvelle(courriel)
      await comptes.definirNom(p.id, r.nom)
      console.log(`[essai] session d'essai pour « ${r.nom} »`)
      json(res, 200, { id: p.id, nom: r.nom, courriel }, { 'set-cookie': cookieDeSession({ id: p.id, nom: r.nom }) })
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
      if (!role) return json(res, 404, { code: 'document-introuvable' })
      json(res, 200, { ...droitsDe(role), titre: (await comptes.document(v.docId))?.titre ?? null })
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
      if ((await comptes.modifierAcces(v.docId, personne, role, v.personne.id)) === 'dernier-proprietaire')
        return json(res, 409, { code: 'dernier-proprietaire' })
      // Comme la route de partage : les connexions ouvertes revoient leurs droits.
      await collaboration?.revoirAcces?.(v.docId, personne).catch((e) => console.error('revoir les accès :', e.message))
      json(res, 200, {})
    },
    // Pour le processus de collaboration seulement (jeton interne).
    // La collaboration relève sa mémoire (jeton interne) : gardée pour le back-office.
    'POST /api/interne/mesure': async (req, res) => {
      if (!jetonValide(CONF.jetonInterne, req.headers['x-amend-interne'])) return json(res, 403, { code: 'interdit' })
      const { processus, memoire } = await lireCorps(req)
      if (!mesureValable(processus, memoire)) return json(res, 400, { code: 'parametres-absents' })
      await comptes.mesurer(processus, memoire)
      json(res, 200, {})
    },
    'GET /api/interne/droits': async (req, res, url) => {
      if (!jetonValide(CONF.jetonInterne, req.headers['x-amend-interne'])) return json(res, 403, { code: 'interdit' })
      const docId = url.searchParams.get('document')
      const idPersonne = url.searchParams.get('personne')
      const branche = url.searchParams.get('branche')
      if (!docId || !idPersonne || !branche) return json(res, 400, { code: 'parametres-absents' })
      json(res, 200, { acces: accesBranche(capacites(await roleSur(docId, idPersonne)), branche) })
    },
    // Le contenu d'un document a changé (y/hub, après un compactage ; comme
    // \`content-updated\` de Docs) : la date de modification avance.
    'POST /api/interne/modifie': async (req, res, url) => {
      if (!jetonValide(CONF.jetonInterne, req.headers['x-amend-interne'])) return json(res, 403, { code: 'interdit' })
      const doc = identifiantDocument(url.searchParams.get('document'))
      if (!doc.ok) return json(res, 400, { code: doc.code })
      await comptes.noterModification(doc.id)
      json(res, 200, {})
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
    // Une erreur après le début de la réponse ne peut plus devenir un 502 : on coupe.
    amont.on(
      'error',
      () => (res.headersSent ? res.destroy() : json(res, 502, { code: 'collaboration-indisponible' }), fini()),
    )
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
    res.writeHead(200, {
      'content-type': TYPES[extname(fichier)] || 'application/octet-stream',
      'cache-control': relatif.startsWith(ASSETS) ? GARDER : REVALIDER,
    })
    res.end(contenu)
  } catch {
    // Un fichier construit absent (version précédente) : 404, jamais la page.
    if (relatif.startsWith(ASSETS)) return json(res, 404, { code: 'introuvable' })
    const index = await readFile(join(CONF.statique, 'index.html')).catch(() => null)
    if (!index) return json(res, 404, { code: 'introuvable' })
    res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': REVALIDER })
    res.end(index)
  }
}

/**
 * @param {object} [CONF]
 * @param {{ comptes: any, commentaires?: any, courrier?: any, collaboration?: any, ia?: any }} services
 *   les dépôts (adaptateur PostgreSQL), le courrier, l'accès de notre serveur à y/hub,
 *   l'IA de Margo ;
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
  const ia = services.ia ?? creerIA({ cleAnthropic: CONF.cleAnthropic, cleScaleway: CONF.cleScaleway })
  const routes = creerRoutes(CONF, comptes, identite, courrier, ia, collaboration)
  const commentaires = creerCommentaires({
    personneDe: identite.personneDe,
    roleSur: async (docId, idPersonne) => roleEffectif(await comptes.rolesDe(docId, idPersonne)),
    depot: depotCommentaires,
    json,
    lireCorps,
    collaboration,
  })
  // Le modèle de Margo : celui choisi au back-office, sinon celui de
  // l'environnement, sinon le modèle par défaut (DeepSeek, comme la v1).
  const modeleParDefaut = MODELES[CONF.margoModele] ? CONF.margoModele : MODELE_PAR_DEFAUT
  const modeleMargo = async () => {
    // Base injoignable : le modèle de l'environnement, et une trace au journal
    // (audit du 11/11/2026, 5).
    const choisi = await comptes.reglage(REGLAGE_MODELE).catch((err) => {
      console.error('[margo] réglage du modèle illisible :', err.code ?? err.message)
      return null
    })
    return typeof choisi === 'string' && MODELES[choisi] ? choisi : modeleParDefaut
  }
  const margo = creerMargo({
    personneDe: identite.personneDe,
    roleSur: async (docId, idPersonne) => roleEffectif(await comptes.rolesDe(docId, idPersonne)),
    documentDe: (docId) => comptes.document(docId),
    ia,
    modele: modeleMargo,
    modeleRepli: MODELE_PAR_DEFAUT,
    collaboration,
    depot: depotCommentaires,
    prevenirFils: commentaires.prevenir,
    json,
    lireCorps,
  })
  const images = creerImages({
    personneDe: identite.personneDe,
    roleSur: async (docId, idPersonne) => roleEffectif(await comptes.rolesDe(docId, idPersonne)),
    depot: comptes,
    json,
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
  /** Le journal du back-office : une erreur à nous ou un refus inhabituel
   * (règle du domaine), avec la méthode et le chemin, jamais un contenu. */
  function noterReponse(req, res) {
    const e = evenementDeReponse(res.statusCode, res.codeRendu)
    if (!e) return
    const chemin = adresseSansSecret(String(req.url ?? '').split('?')[0]).slice(0, 200)
    // Jamais une erreur du journal ne remonte : il ne doit rien casser.
    Promise.resolve()
      .then(() => comptes.noter(e.type, e.code, { methode: req.method, chemin }))
      .catch((err) => console.error('[serveur] journal :', err.code ?? err.message))
  }
  const serveur = http.createServer(async (req, res) => {
    poserSecurite(req, res)
    res.on('finish', () => noterReponse(req, res))
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
      if (await margo(req, res, url)) return
      if (await images(req, res, url)) return
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
      console.error(`[serveur] ${req.method} ${adresseSansSecret(req.url)} :`, err)
      json(res, 500, { code: 'erreur-interne' })
    }
  })
  /** Efface les documents restés plus de 30 jours dans la corbeille. */
  serveur.purgerCorbeille = partage.purger
  return serveur
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const CONF = confDepuisEnv()
  if (!CONF.postgres) throw new Error('base PostgreSQL absente (V2_POSTGRES)')
  const services = {
    comptes: await ouvrirComptes(CONF.postgres),
    commentaires: await ouvrirCommentaires(CONF.postgres),
    courrier: creerCourrier({ cle: CONF.mailgunCle, domaine: CONF.mailgunDomaine, expediteur: CONF.expediteur }),
  }
  const serveur = creerServeur(CONF, services)
  serveur.listen(CONF.port, '127.0.0.1', () => console.log(`[serveur] http://127.0.0.1:${CONF.port}`))
  // La corbeille se vide au démarrage, puis toutes les six heures.
  const purger = () => serveur.purgerCorbeille().catch((e) => console.error('[serveur] corbeille :', e))
  setTimeout(purger, 60_000).unref()
  setInterval(purger, 6 * 3600 * 1000).unref()
  // La mémoire du serveur, relevée pour le back-office.
  const mesurer = () =>
    services.comptes
      .mesurer('serveur', process.memoryUsage().rss)
      .catch((e) => console.error('[serveur] relevé de mémoire :', e.code ?? e.message))
  setTimeout(mesurer, 30_000).unref()
  setInterval(mesurer, PAS_MESURE_MS).unref()
}
