import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'


import { isWebSocketUpgrade, acceptWebSocket } from './ws.js'
import { verrouillerDonnees, migrerDonnees, DonneesIncompatibles } from './donnees.js'
import { routesDocuments } from './routes/documents.js'
import { routesExport } from './routes/export.js'
import { routesImages } from './routes/images.js'
import { routesStyle } from './routes/style.js'
import { routesAdmin } from './routes/admin.js'
import { routesAuth } from './routes/auth.js'
import { routesAcces } from './routes/acces.js'
import { routesAgents } from './routes/agents.js'
import { routesIa } from './routes/ia.js'
import { routesPublication } from './routes/publication.js'
import { routesVersions } from './routes/versions.js'
import { routesCorbeille } from './routes/corbeille.js'
import { routesRangement } from './routes/rangement.js'
import { Rangements } from './rangement.js'
import { routesContact } from './routes/contact.js'
import { sendJson, PAS_TRAITE } from './http.js'
import { creerLimites } from './limites.js'
import { Storage } from './storage.js'
import { Rooms } from './rooms.js'
import { Repliques } from './replique.js'
import { Metrics } from './metrics.js'
import { Uploads } from './uploads.js'
import { Users, idCompte } from './users.js'
import { Typst } from './typst.js'
import { SupportTraites } from './supportTraites.js'
import { Versions } from './versions.js'
import { Agents } from './agents.js'
import { PresenceAgents } from './presenceAgents.js'
import { Mcp } from './mcp.js'
import { Dialogue } from './dialogue.js'
import { ReglagesIa } from './reglagesIa.js'
import { UsageIa } from './usageIa.js'
import { QuotasIa } from './quotasIa.js'
import { modeCsp, politiqueApplication, poserEnTetes } from './enTetes.js'
import { Publications } from './publication.js'
import { chargerDotEnv } from './env.js'
import { creerServiceStatique } from './statique.js'
import { creerServicePages } from './pagesPubliees.js'
import { traiterMcp } from './connecteur.js'
import { isAdminEmail, readSession, definirRevocation } from './auth.js'
import { SessionsRevoquees } from './sessions.js'
import { origineAutorisee, methodeModifie } from './origine.js'
import { capabilities } from './roles.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

chargerDotEnv(join(ROOT, '.env'))
const CLIENT_DIST = join(ROOT, 'client', 'dist')
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data')
const PORT = Number(process.env.PORT) || 8787
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`

// Les plafonds (server/limites.js), créés ici parce que leurs seuils viennent du .env.
const limites = creerLimites()

const storage = new Storage(DATA_DIR)
// Un seul serveur par dossier de données (audit A24), et des données dont on
// connaît la version (audit A20) : voir donnees.js.
try {
  verrouillerDonnees(DATA_DIR)
} catch (err) {
  console.error(`[amend] ${err.message}`)
  process.exit(1)
}
const rangements = new Rangements(DATA_DIR)
const MIGRATIONS = [
  {
    // Audit du 10/10/2026 (S1) : les jetons d'invitation conservés en clair
    // ont été lisibles par les membres des documents ; on les retire. Une
    // invitation non encore acceptée devient inutilisable.
    version: 1,
    nom: 'jetons d’invitation en clair retirés du registre',
    appliquer: () => {
      const retires = storage.purgerJetonsEnClair()
      if (retires) console.log(`[amend] ${retires} jeton(s) d'invitation en clair retiré(s) du registre`)
    },
  },
  {
    // 12/10/2026 : les favoris deviennent personnels (claude/conception-dossiers-corbeille.md §4).
    // Un document étoilé devient favori de chacun de ses membres actuels, pour
    // que personne ne voie sa page changer le jour du déploiement.
    version: 2,
    nom: 'étoiles des documents converties en favoris personnels',
    appliquer: () => {
      const n = storage.migrerEtoilesVersFavoris(rangements)
      if (n) console.log(`[amend] ${n} document(s) étoilé(s) converti(s) en favoris personnels`)
    },
  },
]
try {
  migrerDonnees(DATA_DIR, MIGRATIONS, { journal: (m) => console.log(`[amend] ${m}`) })
} catch (err) {
  if (err instanceof DonneesIncompatibles) {
    console.error(`[amend] ${err.message}`)
    process.exit(1)
  }
  // Registre illisible : le serveur démarre quand même (il répondra 500 et
  // ne réécrira rien, voir fichiers.js) plutôt que de boucler au redémarrage.
  // La version n'a pas bougé : la migration sera retentée au prochain démarrage.
  console.error('[amend] registre des documents inutilisable au démarrage :', err.message)
}
// Les seuils viennent du .env (voir .env.example) et sont lus ici, pas au
// chargement du module : loadDotEnv() ne s'exécute qu'après les imports.
const users = new Users(DATA_DIR)
// « Se déconnecter partout » (S8) : l'instant avant lequel les sessions d'une adresse ne valent plus.
const sessionsRevoquees = new SessionsRevoquees(DATA_DIR)
definirRevocation((email) => sessionsRevoquees.validesDepuis(email))
// Rendu PDF (16/09/2026) — binaire appelé en sous-processus, sous plafond
// mémoire, sous délai, et un rendu à la fois (voir server/typst.js).
const typst = new Typst()
const uploads = new Uploads(DATA_DIR, {
  maxImageMo: process.env.MAX_IMAGE_MB,
  maxDocumentMo: process.env.MAX_DOC_IMAGES_MB,
})
// Plafonds par compte (audit S14, 10/10/2026) : sans eux, une adresse
// obtenue par une invitation pouvait créer des documents sans fin et remplir
// le disque d'images (100 Mo par document, autant de documents que voulu).
// Lus à l'usage (le .env n'est chargé qu'après les imports), les valeurs
// absurdes retombent sur le défaut ; les administrateurs n'en ont pas.
function plafondCompte(nom, defaut) {
  const v = Number(process.env[nom])
  return Number.isFinite(v) && v > 0 ? v : defaut
}
const documentsMaxParCompte = () => plafondCompte('DOCUMENTS_MAX_PAR_COMPTE', 200)
const imagesMaxParCompte = () => plafondCompte('IMAGES_MAX_PAR_COMPTE_MO', 500) * 1048576

// Pages publiées (17/09/2026, voir server/publication.js).
const publications = new Publications(DATA_DIR)
const metrics = new Metrics(DATA_DIR)
metrics.prune()
const supportTraites = new SupportTraites(DATA_DIR)
const versions = new Versions(DATA_DIR)
// Le serveur tient une réplique de chaque document ouvert (29/09/2026,
// server/replique.js) : c'est elle qui sert l'état, vérifie les lecteurs
// et compacte le journal.
const repliques = new Repliques(storage, { versions })
const rooms = new Rooms(storage, repliques)
// Les agents invités sur un document (29/09/2026, server/agents.js et
// server/mcp.js) : une adresse secrète par invitation, un document, un rôle,
// une échéance.
const agents = new Agents(DATA_DIR)
// Claude « présent » dans la barre des participants tant qu'il travaille
// (30/09/2026, server/presenceAgents.js).
const presenceAgents = new PresenceAgents(rooms)
rooms.presenceAgents = presenceAgents
const mcp = new Mcp({ agents, storage, rooms, metrics, presence: presenceAgents })
// La fenêtre de dialogue de l'éditeur (07/10/2026, server/dialogue.js) : le
// même moteur d'outils que le connecteur, au nom d'un agent qui n'existe que
// le temps de la conversation.
// Les réglages de l'IA (modèle, limites en signes, accès — data/reglages-ia.json)
// et la consommation de chaque personne (data/usage-ia.json), 13/10/2026.
const reglagesIa = new ReglagesIa(DATA_DIR)
const usageIa = new UsageIa(DATA_DIR)
const quotas = new QuotasIa({ reglages: reglagesIa, usage: usageIa })
const dialogue = new Dialogue({ storage, rooms, quotas, estAdmin: isAdminEmail, metrics, presence: presenceAgents })

// Plus de plafond de participants simultanés par document (le
// MAX_USERS_PER_DOC = 10 du 13/09/2026 a été retiré le 15/09) : c'était une
// prudence produit, jamais une limite mesurée, et le test de charge n°2 l'a
// démentie — 159 connexions simultanées sur 16 documents, 88 Mo de RSS sur
// les 700 autorisés et 0,1 ms de latence de boucle d'événements. Ce qui
// limite en pratique reste le navigateur de chaque participant, pas le
// serveur. Qui entre est désormais décidé par les accès au document
// (invitation), plus par un compteur.

/** Tout ce dont les routes ont besoin, en un seul objet : elles ne voient ni
 * les variables de ce fichier ni ses imports (server/routes/*.js). */
const ctx = {
  agents, dialogue, mcp, metrics, presenceAgents, quotas, reglagesIa, usageIa, publications, repliques, rooms,
  rangements, sessionsRevoquees, storage, supportTraites, typst, uploads, users, versions,
  documentsMaxParCompte, imagesMaxParCompte, APP_BASE_URL, DATA_DIR,
  ...limites,
}

// Chaque module répond ou passe la main (PAS_TRAITE) ; le premier qui répond
// gagne, dans cet ordre.
const ROUTES = [routesDocuments, routesExport, routesImages, routesStyle, routesAdmin, routesAuth, routesAcces, routesAgents, routesIa, routesPublication, routesVersions, routesCorbeille, routesRangement, routesContact]

async function handleApi(req, res, url) {
  for (const route of ROUTES) {
    if ((await route(req, res, url, ctx)) !== PAS_TRAITE) return
  }
  sendJson(res, 404, { error: 'not found' })
}

const servirPublication = creerServicePages(ctx)
const serveStatic = creerServiceStatique(CLIENT_DIST)

const MODE_CSP = modeCsp(process.env.CSP_MODE)
const POLITIQUE_CSP = politiqueApplication(APP_BASE_URL)

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  poserEnTetes(res, { mode: MODE_CSP, politique: POLITIQUE_CSP, chemin: url.pathname })
  // Ce serveur ne parle pas OAuth : les connecteurs qui sondent ces adresses
  // doivent recevoir un 404 net, pas la page d'accueil du repli SPA — qu'un
  // client lirait comme une réponse valide.
  if (/^\/\.well-known\/(oauth-|openid-configuration)/.test(url.pathname)) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    return res.end('{"error":"not found"}')
  }
  if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
    traiterMcp(req, res, url, ctx).catch((err) => {
      if (res.headersSent) return res.end()
      res.writeHead(err.status || 500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: err.status ? err.message : 'erreur interne' }))
    })
    return
  }
  if (url.pathname.startsWith('/p/') && req.method === 'GET') {
    if (servirPublication(req, res, url.pathname)) return
  }
  if (url.pathname.startsWith('/api/')) {
    // Une requête qui modifie doit venir de nous-mêmes (S13) — pas d'une
    // autre page qui aurait poussé le navigateur de la personne.
    if (methodeModifie(req.method) && !origineAutorisee(req, APP_BASE_URL)) {
      return sendJson(res, 403, { error: 'origine de la requête refusée' })
    }
    handleApi(req, res, url).catch((err) => {
      // Une erreur inattendue (sans `status`) se journalise et ne montre pas
      // son message au client : chemins, messages Yjs… (audit A3, S17).
      // Les erreurs voulues (413, 400…) portent un `status` et gardent le leur.
      if (!err.status) console.error(`[amend] erreur sur ${req.method} ${url.pathname} :`, err)
      if (res.headersSent) return res.end()
      sendJson(res, err.status || 500, { error: err.status ? err.message : 'erreur interne' })
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
  if (!storage.roleFor(docId, readSession(req))) {
    rejectUpgrade(socket, 403, 'Forbidden')
    return
  }
  // Une WebSocket ouverte depuis une autre page porterait le cookie de la
  // personne (S13) : la poignée de main n'est acceptée que de chez nous.
  if (!origineAutorisee(req, APP_BASE_URL)) {
    rejectUpgrade(socket, 403, 'Forbidden')
    return
  }
  const user = (url.searchParams.get('user') || 'Anonyme').slice(0, 60)
  const conn = acceptWebSocket(req, socket)
  // Ce que cette personne peut faire, et le nom de son compte : la salle
  // s'en sert pour ne laisser passer d'un lecteur que ses commentaires.
  const emailSession = readSession(req)
  const compteSession = users.get(emailSession)
  let vecteur = null
  try {
    const sv = url.searchParams.get('sv')
    if (sv) vecteur = Buffer.from(sv, 'base64')
  } catch {
    vecteur = null
  }
  rooms.join(
    docId,
    conn,
    user,
    { capabilities: capabilities(storage.roleFor(docId, emailSession)), nom: compteSession ? compteSession.nom : user, email: emailSession, id: idCompte(emailSession) },
    { vecteur }
  )
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

// Port déjà pris ou autre erreur d'écoute : sans ce gestionnaire, Node
// plante sans dire pourquoi (le LaunchAgent a redémarré 6 638 fois sur
// EADDRINUSE sans qu'aucune ligne ne l'explique — audit A3).
server.on('error', (err) => {
  console.error(
    err && err.code === 'EADDRINUSE'
      ? `[amend] le port ${PORT} est déjà utilisé : un autre serveur tourne-t-il encore ?`
      : `[amend] erreur du serveur HTTP :`,
    err && err.code === 'EADDRINUSE' ? '' : err
  )
  process.exit(1)
})

// Écoute sur la boucle locale par défaut (S19) : Caddy est sur la même
// machine, et un port 8787 que le pare-feu laisserait passer permettrait de
// contourner le proxy — donc de falsifier `X-Forwarded-*`, dont dépend
// `origineDe`. `HOST=0.0.0.0` pour un conteneur ou un autre proxy.
const HOST = process.env.HOST || '127.0.0.1'
server.listen(PORT, HOST, () => {
  console.log(`amend.ink en écoute sur http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  console.log(`Données stockées dans ${DATA_DIR}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "Astuce : définis ANTHROPIC_API_KEY (voir .env.example) pour activer les suggestions IA."
    )
  }
  // Typst, et ce qu'il aura sous la main pour composer. Une famille de
  // polices absente est remplacée **en silence** : sans cette ligne, un PDF
  // qui ne ressemble pas aux réglages choisis n'a aucune explication
  // visible nulle part (constaté le 18/09).
  typst.disponible().then((version) => {
    if (!version) {
      console.log('Typst est introuvable : l’export PDF répondra 501.')
      return
    }
    console.log(`Typst : ${version}`)
    typst.policesManquantes().then((manquantes) => {
      if (!manquantes || !manquantes.length) return
      console.log(
        `Polices absentes de cette machine, remplacées en silence par Typst : ${manquantes.join(', ')}.\n` +
          '  Sur Debian : sudo apt install fonts-dejavu fonts-liberation fonts-roboto'
      )
    })
  })
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
  repliques.fermer()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
