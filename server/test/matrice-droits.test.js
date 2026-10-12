// La matrice des droits : chaque route de l'API × chaque sorte de personne
// (anonyme, propriétaire, éditeur, correcteur, lecteur, quelqu'un sans accès,
// administrateur) → qui a le droit de quoi. Protocole de test global, §6.
//
// Deux garde-fous :
//  1. si quelqu'un ajoute une route à server.js sans la déclarer ici, le test
//     échoue (« route non couverte ») : un droit oublié se voit à la relecture,
//     pas en production ;
//  2. pour chaque case, « non » veut dire 401/403/404 (on n'apprend rien), « oui »
//     veut dire autre chose que 401/403 (la requête a franchi l'autorisation ;
//     une erreur de validation 400, 404 « introuvable » ou 501 sans Typst est
//     donc un oui).
//
// La matrice dit ce que le produit *doit* faire (claude/etude-roles-serveur.md,
// server/roles.js) — si une case échoue, c'est la route qui est à revoir avant
// la matrice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { lancerInstance } from '../../tools/instance-test.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// Les routes vivent dans server.js (pages publiées, MCP, WebSocket) et dans
// server/routes/*.js (l'API, depuis le découpage du 11/10/2026).
const DOSSIER_ROUTES = join(RACINE, 'server', 'routes')
const SERVEUR_JS = [
  readFileSync(join(RACINE, 'server', 'server.js'), 'utf8'),
  ...readdirSync(DOSSIER_ROUTES).filter((f) => f.endsWith('.js')).sort().map((f) => readFileSync(join(DOSSIER_ROUTES, f), 'utf8')),
].join('\n')

const ADMIN = 'admin@test.local'
const PROPRIO = 'proprio@test.local'
const EDITEUR = 'editeur@test.local'
const CORRECTEUR = 'correcteur@test.local'
const LECTEUR = 'lecteur@test.local'
const TIERS = 'tiers@test.local'
const COMPTES = { proprio: PROPRIO, editeur: EDITEUR, correcteur: CORRECTEUR, lecteur: LECTEUR, tiers: TIERS, admin: ADMIN }
const QUI = ['anonyme', 'proprio', 'editeur', 'correcteur', 'lecteur', 'tiers', 'admin']

// Groupes de personnes, pour que les lignes de la matrice se lisent.
const CONNECTES = ['proprio', 'editeur', 'correcteur', 'lecteur', 'tiers', 'admin']
const MEMBRES = ['proprio', 'editeur', 'correcteur', 'lecteur']
const EDITEURS = ['proprio', 'editeur']

/**
 * Une ligne = une route et une méthode. `oui` : qui passe l'autorisation.
 * `couvre` : la forme normalisée de la route dans server.js (voir
 * `routesDuServeur`). `jetable` : la route détruit ou transforme le document
 * — elle a son document à elle, et seule la première personne qui y a droit
 * s'en sert (les autres se heurtent déjà au refus ou à l'absence du document).
 */
const LIGNES = [
  { couvre: '/api/docs', m: 'GET', oui: CONNECTES.concat('anonyme') /* la liste d'un anonyme est vide : 200 sans contenu */ },
  { couvre: '/api/docs', m: 'POST', corps: { title: 'x' }, oui: CONNECTES },
  // Un administrateur n'a pas accès aux documents des autres : il gère l'instance, il ne lit pas les textes.
  { couvre: '/api/docs/:x', m: 'GET', oui: MEMBRES },
  { couvre: '/api/docs/:x', m: 'PATCH', corps: { title: 'renommé' }, oui: EDITEURS },
  { couvre: '/api/docs/:x/star', m: 'PATCH', corps: { starred: true }, oui: MEMBRES /* favori personnel : tout membre, pour soi */ },
  { couvre: '/api/docs/:x', m: 'DELETE', jetable: true, oui: ['proprio'] },
  { couvre: '/api/docs/:x/pdf', m: 'POST', corps: { source: '= x' }, oui: EDITEURS },
  { couvre: '/api/docs/:x/images', m: 'POST', brut: { type: 'image/png', octets: 8 }, oui: EDITEURS },
  { couvre: '/api/docs/:x/images/:x', m: 'GET', chemin: (c) => `/api/docs/${c.doc}/images/absente.png`, oui: MEMBRES },
  { couvre: '/api/docs/:x/history', m: 'GET', oui: MEMBRES },
  { couvre: '/api/docs/:x/history/raw', m: 'GET', oui: MEMBRES },
  // Les versions : lire = lire le document ; nommer, renommer, supprimer, restaurer = éditeurs.
  { couvre: '/api/docs/:x/versions', m: 'GET', oui: MEMBRES },
  { couvre: '/api/docs/:x/versions', m: 'POST', corps: { nom: 'Envoi au comité' }, oui: EDITEURS },
  { couvre: '/api/docs/:x/versions', m: 'GET', chemin: (c) => `/api/docs/${c.doc}/versions/courante`, oui: MEMBRES },
  { couvre: '/api/docs/:x/versions', m: 'PATCH', chemin: (c) => `/api/docs/${c.doc}/versions/1`, corps: { nom: 'x' }, oui: EDITEURS },
  { couvre: '/api/docs/:x/versions', m: 'DELETE', chemin: (c) => `/api/docs/${c.doc}/versions/1`, oui: EDITEURS },
  { couvre: '/api/docs/:x/versions', m: 'POST', chemin: (c) => `/api/docs/${c.doc}/versions/1/restauration`, corps: {}, oui: EDITEURS },
  { couvre: '/api/docs/:x/comparaison', m: 'GET', chemin: (c) => `/api/docs/${c.doc}/comparaison?de=courante&vers=courante`, oui: MEMBRES },
  // La corbeille (12/10/2026) : la personne connectée n'y voit que ses documents ; les gestes sur un document précis sont ceux du propriétaire (un document absent de sa corbeille répond 404 à tous).
  { couvre: '/api/corbeille', m: 'GET', oui: CONNECTES },
  { couvre: '/api/corbeille', m: 'DELETE', oui: CONNECTES /* vide la corbeille de la personne, jamais celle d'un autre */ },
  { couvre: '/api/corbeille/:x', m: 'POST', chemin: (c) => `/api/corbeille/${c.doc}/restauration`, oui: ['proprio'] /* 404 pour les autres */ },
  { couvre: '/api/corbeille/:x', m: 'DELETE', chemin: (c) => `/api/corbeille/${c.doc}`, oui: ['proprio'] },
  // Le rangement est celui de la personne connectée : rien à usurper, rien à lire chez les autres.
  { couvre: '/api/rangement', m: 'GET', oui: CONNECTES },
  { couvre: '/api/rangement/dossiers', m: 'POST', corps: { nom: 'Dossier matrice' }, oui: CONNECTES },
  { couvre: '/api/rangement/dossiers/:x', m: 'PATCH', chemin: () => '/api/rangement/dossiers/d_inconnu', corps: { nom: 'x' }, oui: CONNECTES },
  { couvre: '/api/rangement/dossiers/:x', m: 'DELETE', chemin: () => '/api/rangement/dossiers/d_inconnu', oui: CONNECTES },
  { couvre: '/api/rangement/documents/:x', m: 'PUT', chemin: (c) => `/api/rangement/documents/${c.doc}`, corps: {}, oui: MEMBRES /* un document qu'on ne voit pas se range pas : 404 */ },
  { couvre: '/api/style', m: 'GET', oui: QUI /* la feuille de style par défaut est lisible de tous */ },
  { couvre: '/api/style', m: 'PUT', corps: {}, oui: ['admin'] },
  { couvre: '/api/docs/:x/style', m: 'GET', oui: MEMBRES },
  { couvre: '/api/docs/:x/style', m: 'PUT', corps: {}, oui: EDITEURS },
  { couvre: '/api/docs/:x/style', m: 'DELETE', oui: EDITEURS },
  { couvre: '/api/docs/:x/modele', m: 'PUT', corps: { modele: 'inconnu' }, oui: EDITEURS },
  { couvre: '/api/modeles', m: 'GET', oui: CONNECTES },
  { couvre: '/api/modeles', m: 'POST', corps: { nom: 'm' }, oui: CONNECTES },
  { couvre: '/api/modeles/:x', m: 'GET', chemin: () => '/api/modeles/inconnu', oui: CONNECTES },
  { couvre: '/api/modeles/:x', m: 'PUT', chemin: () => '/api/modeles/inconnu', corps: {}, oui: CONNECTES },
  { couvre: '/api/modeles/:x', m: 'DELETE', chemin: () => '/api/modeles/inconnu', oui: CONNECTES },
  { couvre: '/api/debug/stats', m: 'GET', oui: ['admin'] },
  { couvre: '/api/admin/overview', m: 'GET', oui: ['admin'] },
  { couvre: '/api/admin/ia', m: 'GET', oui: ['admin'] },
  { couvre: '/api/admin/ia', m: 'PUT', corps: {}, oui: ['admin'] },
  { couvre: '/api/admin/support/:x/traite', m: 'POST', chemin: () => '/api/admin/support/inconnu/traite', corps: {}, oui: ['admin'] },
  { couvre: '/api/admin/sauvegarde', m: 'GET', oui: ['admin'] },
  { couvre: '/api/admin/waitlist', m: 'GET', oui: ['admin'] },
  { couvre: '/api/admin/embarquer', m: 'POST', corps: { email: '' }, oui: ['admin'] },
  { couvre: '/api/auth/me', m: 'GET', oui: QUI },
  { couvre: '/api/auth/name', m: 'POST', corps: { name: 'Nom Test' }, oui: CONNECTES },
  { couvre: '/api/auth/request-link', m: 'POST', corps: { email: 'inconnu-jamais@test.local' }, oui: QUI },
  { couvre: '/api/auth/verify', m: 'POST', corps: { token: 'x' }, oui: QUI },
  { couvre: '/api/auth/logout', m: 'POST', oui: QUI },
  { couvre: '/api/invitations/:x', m: 'POST', chemin: () => '/api/invitations/jeton-inexistant', oui: QUI },
  { couvre: '/api/docs/:x/access', m: 'GET', oui: EDITEURS },
  { couvre: '/api/docs/:x/invitations', m: 'POST', corps: { email: 'invite-matrice@test.local', role: 'lecteur' }, oui: EDITEURS },
  { couvre: '/api/docs/:x/access/moi', m: 'DELETE', jetable: true, oui: ['editeur', 'correcteur', 'lecteur'] },
  { couvre: '/api/docs/:x/owner', m: 'POST', jetable: true, corps: { email: 'editeur@test.local' }, oui: ['proprio'] },
  { couvre: '/api/docs/:x/access/:x', m: 'DELETE', chemin: (c) => `/api/docs/${c.doc}/access/personne-matrice%40test.local`, oui: EDITEURS },
  { couvre: '/api/docs/:x/agents', m: 'GET', oui: EDITEURS },
  { couvre: '/api/docs/:x/agents', m: 'POST', corps: { role: 'correcteur', nom: 'Claude' }, oui: EDITEURS /* CLAUDE_AGENT=editeurs dans l'instance de test ; un administrateur sans accès au document n'y invite personne */ },
  // Lecture : toute personne connectée reçoit la réponse (« autorisé : non », au lieu d'un refus) ; ce qui compte est la valeur.
  { couvre: '/api/docs/:x/dialogue', m: 'GET', oui: CONNECTES, verifie: (qui, j) => j.autorise === EDITEURS.includes(qui) },
  { couvre: '/api/docs/:x/ia', m: 'GET', oui: CONNECTES, verifie: (qui, j) => j.corrections.autorise === EDITEURS.includes(qui) && j.margo.autorise === EDITEURS.includes(qui) },
  { couvre: '/api/ai/suggest', m: 'POST', corps: { docId: '{doc}', texte: 'x' }, oui: EDITEURS },
  { couvre: '/api/docs/:x/publication', m: 'GET', oui: MEMBRES, verifie: (qui, j) => j.autorise === EDITEURS.includes(qui) },
  { couvre: '/api/docs/:x/publication', m: 'PUT', corps: {}, oui: EDITEURS },
  { couvre: '/api/docs/:x/publication', m: 'DELETE', oui: EDITEURS },
  { couvre: '/api/support', m: 'POST', corps: { message: 'bonjour' }, oui: CONNECTES },
  { couvre: '/api/waitlist', m: 'POST', corps: { email: 'attente@test.local' }, oui: QUI },
  // En dernier : elle révoque toutes les sessions des comptes de l'essai.
  { couvre: '/api/auth/logout-all', m: 'POST', oui: CONNECTES },
]

// Ce que server.js déclare et que la matrice ne traite pas, et pourquoi.
const EXCLUES = {
  '/p/:x': 'pages publiées : publiques par construction (tests de publication)',
  '/p/:x/images/:x': 'images des pages publiées : publiques par construction',
  '/mcp/:x': 'connecteurs des agents invités : le jeton de l’adresse est le droit (agents.test.js, mcp.test.js)',
  '/ws/:x': 'WebSocket : les droits y sont vérifiés à l’ouverture (access.test.js, lecteur-serveur.test.js)',
}

/** Les routes de server.js, sous une forme normalisée (Prettier peut couper l'appel
 * `.match(...)` sur plusieurs lignes : les espaces et retours à la ligne autour du motif
 * sont tolérés) : `pathname === '/api/x'`
 * et `pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/star$/)` deviennent
 * `/api/x` et `/api/docs/:x/star`. */
export function routesDuServeur(source) {
  const routes = new Set()
  for (const m of source.matchAll(/pathname\s*===\s*'([^']+)'/g)) routes.add(m[1])
  for (const m of source.matchAll(/(?:pathname|url\.pathname)\.match\(\s*\/\^(.+?)\$\/\s*\)/g)) {
    let r = m[1].replace(/\\\//g, '/')
    r = r.replace(/\(\?:[^]*$/, '') // un suffixe facultatif (agents) : on garde le préfixe
    r = r.replace(/\([^()]*\)/g, ':x')
    routes.add(r)
  }
  return [...routes]
    .filter((r) => r.startsWith('/api/') || r.startsWith('/p/') || r.startsWith('/mcp/') || r.startsWith('/ws/'))
    .sort()
}

test('toutes les routes de server.js sont dans la matrice (ou excusées, avec la raison)', () => {
  const declarees = new Set(LIGNES.map((l) => l.couvre))
  const routes = routesDuServeur(SERVEUR_JS)
  assert.ok(routes.length > 30, `l'extraction des routes ne trouve presque rien (${routes.length}) — le motif a-t-il cassé ?`)
  const manquantes = routes.filter((r) => !declarees.has(r) && !(r in EXCLUES))
  assert.deepEqual(manquantes, [], `route(s) de server.js absente(s) de la matrice des droits : ${manquantes.join(', ')}`)
  // L'inverse : une ligne de matrice dont la route a disparu ne teste plus rien.
  const connues = new Set(routes)
  const fantomes = [...declarees].filter((r) => !connues.has(r))
  assert.deepEqual(fantomes, [], `ligne(s) de matrice sans route dans server.js : ${fantomes.join(', ')}`)
})

// ------------------------------------------------------------------ essais

let inst
let cookies
let sequence = 0
const NOTES = []

async function jeton(mail) {
  const res = await fetch(`${inst.fauxMailgun}/courriers`)
  const courriers = await res.json()
  for (const c of courriers.reverse()) {
    if (c.to === mail) {
      const m = /#\/invite\/([A-Za-z0-9_-]+)/.exec(c.text || '')
      if (m) return m[1]
    }
  }
  throw new Error(`pas de courrier d'invitation pour ${mail}`)
}

/** Un document neuf, avec ses éditeurs, correcteur et lecteur. Chaque
 * propriétaire n'invite que trois fois (le limiteur d'invitations est par
 * personne) : une ligne « jetable » a donc son propriétaire à elle. */
async function documentNeuf(proprio) {
  const cree = await inst.api('/api/docs', { cookie: cookies[proprio], methode: 'POST', corps: { title: `matrice ${++sequence}` } })
  assert.equal(cree.status, 201, `création : ${cree.status} ${cree.texte}`)
  const doc = cree.json.id
  for (const [role, mail] of [['editeur', EDITEUR], ['correcteur', CORRECTEUR], ['lecteur', LECTEUR]]) {
    const inv = await inst.api(`/api/docs/${doc}/invitations`, { cookie: cookies[proprio], methode: 'POST', corps: { email: mail, role } })
    assert.equal(inv.status, 200, `invitation ${role} : ${inv.status} ${inv.texte}`)
    const acc = await inst.api(`/api/invitations/${await jeton(mail)}`, { methode: 'POST' })
    assert.equal(acc.status, 200, `acceptation ${role} : ${acc.status} ${acc.texte}`)
  }
  return doc
}

test('démarrage de l’instance de test', async () => {
  inst = await lancerInstance({ port: 19890, comptes: [ADMIN, PROPRIO, EDITEUR, CORRECTEUR, LECTEUR, TIERS, ...Array.from({ length: 12 }, (_, i) => `proprio-${i}@test.local`)] })
  cookies = { anonyme: null, ...Object.fromEntries(Object.entries(COMPTES).map(([k, mail]) => [k, inst.cookies[mail]])) }
  for (let i = 0; i < 12; i++) cookies[`proprio-${i}`] = inst.cookies[`proprio-${i}@test.local`]
})

async function appeler(ligne, cookie, doc) {
  const contexte = { doc }
  const chemin = ligne.chemin ? ligne.chemin(contexte) : ligne.couvre.replace(':x', doc)
  const entetes = {}
  let body
  if (ligne.brut) {
    entetes['content-type'] = ligne.brut.type
    body = Buffer.alloc(ligne.brut.octets, 1)
  } else if (ligne.corps !== undefined) {
    entetes['content-type'] = 'application/json'
    body = JSON.stringify(JSON.parse(JSON.stringify(ligne.corps).replaceAll('{doc}', doc)))
  } else if (ligne.m !== 'GET' && ligne.m !== 'DELETE') {
    entetes['content-type'] = 'application/json'
    body = '{}'
  }
  if (cookie) entetes.cookie = cookie
  const res = await fetch(`${inst.base}${chemin}`, { method: ligne.m, headers: entetes, body, redirect: 'manual' })
  const texte = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(texte) } catch { /* pas du JSON */ }
  return { statut: res.status, json }
}

test('la matrice : chaque rôle ne fait que ce qu’il a le droit de faire', { timeout: 170000 }, async () => {
  const partage = await documentNeuf('proprio')
  const ecarts = []
  let jetables = 0
  let cases = 0
  for (const ligne of LIGNES) {
    let doc = partage
    let cookieProprio = cookies.proprio
    if (ligne.jetable) {
      const cle = `proprio-${jetables++}`
      doc = await documentNeuf(cle)
      cookieProprio = cookies[cle]
    }
    // Les refus d'abord : ils ne changent rien. Les oui ensuite, et — pour une
    // ligne jetable — un seul : le geste est irréversible.
    const ordre = QUI.filter((q) => !ligne.oui.includes(q)).concat(QUI.filter((q) => ligne.oui.includes(q)))
    let dejaFait = false
    for (const qui of ordre) {
      const attendu = ligne.oui.includes(qui)
      if (attendu && ligne.jetable && dejaFait) continue
      const { statut, json } = await appeler(ligne, qui === 'proprio' ? cookieProprio : cookies[qui], doc)
      cases++
      if (attendu) dejaFait = true
      const passe = statut !== 401 && statut !== 403
      const refuse = statut === 401 || statut === 403 || statut === 404
      if (attendu && !passe) ecarts.push(`${ligne.m} ${ligne.couvre} : ${qui} devrait passer, a reçu ${statut}`)
      if (!attendu && !refuse) ecarts.push(`${ligne.m} ${ligne.couvre} : ${qui} ne devrait PAS passer, a reçu ${statut}`)
      if (ligne.verifie && statut === 200 && !ligne.verifie(qui, json || {})) ecarts.push(`${ligne.m} ${ligne.couvre} : la réponse pour ${qui} dit autre chose que prévu (${JSON.stringify(json).slice(0, 120)})`)
      NOTES.push(`${ligne.m.padEnd(6)} ${ligne.couvre.padEnd(34)} ${qui.padEnd(10)} ${statut}`)
    }
  }
  if (process.env.MATRICE_DETAIL) console.log(NOTES.join('\n'))
  assert.ok(cases > 250, `trop peu de cases jouées (${cases})`)
  assert.deepEqual(ecarts, [], `\n  ${ecarts.join('\n  ')}`)
})

test.after(async () => {
  if (inst) await inst.arreter()
  process.exit(0)
})
