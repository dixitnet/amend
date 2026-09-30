// « Inviter Claude » dans Gérer les accès : les routes du panneau
// (30/09/2026, server/server.js, server/agents.js). Le vrai serveur, de
// vraies sessions ; ce qui s'y teste : qui peut créer, prolonger, régénérer
// et révoquer, ce que la liste ne montre jamais, et que l'adresse rendue
// ouvre bien le connecteur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18792
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-agents-routes-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'
delete process.env.CLAUDE_AGENT
// L'adresse rendue se construit sur APP_BASE_URL : sans ça, un .env de
// développement la ferait pointer ailleurs que vers ce serveur d'essai.
process.env.APP_BASE_URL = `http://localhost:${PORT}`

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
await attendre()

function attendre() {
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 5000
    ;(function essai() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => (Date.now() > limite ? reject(err) : setTimeout(essai, 50)))
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const ADMIN = cookie('admin@example.com')
const EDITEUR = cookie('editeur@example.com')
const CORRECTEUR = cookie('correcteur@example.com')

async function unDocument() {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: ADMIN },
    body: JSON.stringify({ title: 'Vie et mort de Zan' }),
  })
  const doc = await res.json()
  const storage = new Storage(DATA_DIR)
  storage.grantAccess(doc.id, 'editeur@example.com', 'editeur')
  storage.grantAccess(doc.id, 'correcteur@example.com', 'correcteur')
  return doc
}

const api = (doc, chemin, { methode = 'GET', corps, moi = ADMIN } = {}) =>
  fetch(`${BASE}/api/docs/${doc.id}/agents${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', cookie: moi },
    body: corps ? JSON.stringify(corps) : undefined,
  })

const secretDe = (adresse) => adresse.split('/mcp/')[1]
let compteur = 0
const ping = (adresse) =>
  fetch(adresse, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${1 + (compteur++ % 200)}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })

test('un admin invite Claude : l’adresse est rendue une fois, ouvre le connecteur, et n’est jamais relue', async () => {
  const doc = await unDocument()
  const res = await api(doc, '', { methode: 'POST', corps: { role: 'correcteur', jours: 7 } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store', 'un secret ne se met pas en cache')
  const invitation = await res.json()
  assert.match(invitation.adresse, /\/mcp\/[A-Za-z0-9_-]{22}$/)
  assert.ok(invitation.expiresAt > Date.now() + 6 * 24 * 3600 * 1000)

  // L'adresse marche.
  const ok = await ping(invitation.adresse)
  assert.equal(ok.status, 200)

  // La liste la décrit sans jamais la porter.
  const liste = await (await api(doc, '')).json()
  assert.equal(liste.autorise, true)
  assert.equal(liste.portee, 'admins')
  assert.equal(liste.agents.length, 1)
  assert.equal(liste.agents[0].nom, 'Claude (pour admin)')
  assert.equal(liste.agents[0].role, 'correcteur')
  assert.equal(liste.agents[0].etat, 'active')
  const brut = JSON.stringify(liste)
  assert.ok(!brut.includes(secretDe(invitation.adresse)), 'le secret ne revient pas dans la liste')
  assert.ok(!brut.includes('secretHash'), 'ni son empreinte')
})

test('pendant la phase de test, seul un admin invite ; un éditeur voit la liste et peut révoquer', async () => {
  const doc = await unDocument()
  const refus = await api(doc, '', { methode: 'POST', corps: { role: 'correcteur' }, moi: EDITEUR })
  assert.equal(refus.status, 403)

  const cree = await (await api(doc, '', { methode: 'POST', corps: { role: 'lecteur' } })).json()

  // L'éditeur voit l'invitation (elle concerne tout le monde), sans pouvoir
  // en créer, la prolonger, ni la régénérer.
  const vue = await (await api(doc, '', { moi: EDITEUR })).json()
  assert.equal(vue.autorise, false)
  assert.equal(vue.agents.length, 1)
  assert.equal((await api(doc, `/${cree.id}/prolonger`, { methode: 'POST', corps: { jours: 30 }, moi: EDITEUR })).status, 403)
  assert.equal((await api(doc, `/${cree.id}/regenerer`, { methode: 'POST', moi: EDITEUR })).status, 403)

  // Mais couper l'accès lui est permis : il le voit, il peut le retirer.
  assert.equal((await ping(cree.adresse)).status, 200)
  assert.equal((await api(doc, `/${cree.id}`, { methode: 'DELETE', moi: EDITEUR })).status, 200)
  assert.equal((await ping(cree.adresse)).status, 404, 'révoquée : la même réponse que pour une adresse inconnue')
  assert.equal((await (await api(doc, '')).json()).agents.length, 0, 'une invitation révoquée disparaît de la liste')
})

test('un correcteur ne voit ni ne gère rien', async () => {
  const doc = await unDocument()
  assert.equal((await api(doc, '', { moi: CORRECTEUR })).status, 403)
  assert.equal((await api(doc, '', { methode: 'POST', corps: { role: 'lecteur' }, moi: CORRECTEUR })).status, 403)
  // Sans session non plus.
  const sans = await fetch(`${BASE}/api/docs/${doc.id}/agents`)
  assert.ok([401, 403].includes(sans.status))
})

test('la portée se règle par CLAUDE_AGENT, sans toucher au code', async () => {
  const doc = await unDocument()
  process.env.CLAUDE_AGENT = 'editeurs'
  try {
    const r = await api(doc, '', { methode: 'POST', corps: { role: 'correcteur' }, moi: EDITEUR })
    assert.equal(r.status, 200, 'les éditeurs peuvent inviter quand le .env l’ouvre')
    // Un correcteur, jamais, quelle que soit la portée.
    assert.equal((await api(doc, '', { methode: 'POST', corps: { role: 'correcteur' }, moi: CORRECTEUR })).status, 403)
    process.env.CLAUDE_AGENT = 'valeur-inconnue'
    assert.equal((await api(doc, '', { methode: 'POST', corps: { role: 'correcteur' }, moi: EDITEUR })).status, 403, 'une valeur inconnue retombe sur admins')
  } finally {
    delete process.env.CLAUDE_AGENT
  }
})

test('un agent n’est jamais éditeur, la durée est bornée', async () => {
  const doc = await unDocument()
  assert.equal((await api(doc, '', { methode: 'POST', corps: { role: 'editeur' } })).status, 400)
  assert.equal((await api(doc, '', { methode: 'POST', corps: { role: 'correcteur', jours: 0 } })).status, 400)
  assert.equal((await api(doc, '', { methode: 'POST', corps: { role: 'correcteur', jours: 400 } })).status, 400)
  assert.equal((await api(doc, '', { methode: 'POST', corps: {} })).status, 400)
  assert.equal((await (await api(doc, '')).json()).agents.length, 0, 'aucune invitation n’a été créée par erreur')
})

test('prolonger repousse l’échéance sans changer d’adresse', async () => {
  const doc = await unDocument()
  const cree = await (await api(doc, '', { methode: 'POST', corps: { role: 'correcteur', jours: 1 } })).json()
  const r = await api(doc, `/${cree.id}/prolonger`, { methode: 'POST', corps: { jours: 30 } })
  assert.equal(r.status, 200)
  const { expiresAt } = await r.json()
  assert.ok(expiresAt > Date.now() + 29 * 24 * 3600 * 1000)
  assert.equal((await ping(cree.adresse)).status, 200, 'la même adresse marche toujours')
  assert.equal((await api(doc, `/${cree.id}/prolonger`, { methode: 'POST', corps: { jours: 1000 } })).status, 400)
})

test('régénérer donne une nouvelle adresse et coupe l’ancienne au même instant', async () => {
  const doc = await unDocument()
  const cree = await (await api(doc, '', { methode: 'POST', corps: { role: 'correcteur' } })).json()
  const r = await api(doc, `/${cree.id}/regenerer`, { methode: 'POST' })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('cache-control'), 'no-store')
  const neuve = await r.json()
  assert.notEqual(secretDe(neuve.adresse), secretDe(cree.adresse))
  assert.equal(neuve.remplace, cree.id)
  assert.equal((await ping(cree.adresse)).status, 404, 'l’ancienne ne marche plus')
  assert.equal((await ping(neuve.adresse)).status, 200)
  const liste = (await (await api(doc, '')).json()).agents
  assert.equal(liste.length, 1, 'une seule ligne : l’ancienne est révoquée')
  assert.equal(liste[0].role, 'correcteur', 'le rôle est conservé')
  assert.equal(liste[0].nom, 'Claude (pour admin)', 'le nom aussi')
})

test('une invitation d’un autre document, ou inconnue, reste introuvable', async () => {
  const a = await unDocument()
  const b = await unDocument()
  const cree = await (await api(a, '', { methode: 'POST', corps: { role: 'lecteur' } })).json()
  assert.equal((await api(b, `/${cree.id}`, { methode: 'DELETE' })).status, 404, 'pas d’un document à l’autre')
  assert.equal((await ping(cree.adresse)).status, 200, 'et rien n’a été révoqué')
  assert.equal((await api(a, '/ag-00000000', { methode: 'DELETE' })).status, 404)
})

test('le journal dit qui a fait quoi, jamais l’adresse', async () => {
  const doc = await unDocument()
  const cree = await (await api(doc, '', { methode: 'POST', corps: { role: 'correcteur' } })).json()
  await api(doc, `/${cree.id}`, { methode: 'DELETE' })
  await new Promise((r) => setTimeout(r, 500))
  const fichiers = readdirSync(DATA_DIR).filter((f) => f.includes('agents') && f.endsWith('.jsonl'))
  assert.ok(fichiers.length >= 1, 'le journal des agents existe')
  const texte = fichiers.map((f) => readFileSync(join(DATA_DIR, f), 'utf8')).join('\n')
  assert.match(texte, /"outil":"invitation"/)
  assert.match(texte, /"outil":"revocation"/)
  assert.ok(!texte.includes(secretDe(cree.adresse)), 'le secret n’est dans aucun journal')
  assert.ok(!existsSync(join(DATA_DIR, 'agents.json')) || !readFileSync(join(DATA_DIR, 'agents.json'), 'utf8').includes(secretDe(cree.adresse)), 'ni dans le registre')
})

// Le serveur garde la boucle d'événements : on rend la main explicitement,
// après avoir laissé le rapport s'écrire.
test('fin : nettoyage', () => {
  try {
    rmSync(DATA_DIR, { recursive: true, force: true })
  } catch {}
  setTimeout(() => process.exit(0), 200)
})
