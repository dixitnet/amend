// End-to-end test of the server: REST API, the hand-rolled WebSocket
// implementation, relay behaviour and on-disk persistence/replay.
// Run with: node --test server/test

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18787
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-'))
delete process.env.ANTHROPIC_API_KEY

const BASE = `http://localhost:${PORT}`

const { Storage } = await import('../storage.js')
const { sessionCookieHeader } = await import('../auth.js')
await import('../server.js')
await waitForServer()

// L'endpoint IA exige désormais une session (voir server.js et
// claude/conception-gestion-utilisateurs.md, projet Amend) — un cookie
// valide, sans rapport avec la vérification de la clé Anthropic que ces
// deux tests visent réellement.
const AI_TEST_COOKIE = sessionCookieHeader('ai-test@example.com', { secure: false }).split(';')[0]

// Ces tests portent sur le relais WebSocket / la persistance, pas sur la
// gestion des droits (couverte séparément par access.test.js) — les
// documents créés ici passent directement par Storage plutôt que par
// POST /api/docs (qui exige désormais une session, voir
// claude/conception-gestion-utilisateurs.md, projet Amend), et restent
// donc des documents "ouverts" sans liste d'accès, comme avant cette
// fonctionnalité.
const directStorage = new Storage(process.env.DATA_DIR)

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    ;(function attempt() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => {
          if (Date.now() > deadline) reject(err)
          else setTimeout(attempt, 50)
        })
    })()
  })
}

function once(target, event) {
  return new Promise((resolve) => target.addEventListener(event, resolve, { once: true }))
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function createDoc(title) {
  return directStorage.createDoc(title)
}

function connect(docId, user) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws/${docId}?user=${encodeURIComponent(user)}`)
  ws.binaryType = 'arraybuffer'
  return ws
}

test('creates and lists documents', async () => {
  const doc = await createDoc('Mon brouillon')
  assert.ok(doc.id)
  assert.equal(doc.title, 'Mon brouillon')

  const res = await fetch(`${BASE}/api/docs`)
  const { docs } = await res.json()
  assert.ok(docs.some((d) => d.id === doc.id))
})

test('404s on an unknown document', async () => {
  const res = await fetch(`${BASE}/api/docs/does-not-exist`)
  assert.equal(res.status, 404)
})

test('relays binary updates between two live clients', async () => {
  const doc = await createDoc('Collab test')
  const alice = connect(doc.id, 'Alice')
  const bob = connect(doc.id, 'Bob')
  await withTimeout(Promise.all([once(alice, 'open'), once(bob, 'open')]), 2000, 'open')

  const payload = new Uint8Array([1, 2, 3, 4, 5])
  const received = withTimeout(once(bob, 'message'), 2000, 'bob message')
  alice.send(payload)
  const event = await received
  assert.deepEqual(new Uint8Array(event.data), payload)

  alice.close()
  bob.close()
})

test('relays JSON awareness frames but does not persist them', async () => {
  const doc = await createDoc('Awareness test')
  const alice = connect(doc.id, 'Alice')
  const bob = connect(doc.id, 'Bob')
  await withTimeout(Promise.all([once(alice, 'open'), once(bob, 'open')]), 2000, 'open')

  const msg = JSON.stringify({ type: 'awareness', payload: { cursor: 42, user: 'Alice' } })
  const received = withTimeout(once(bob, 'message'), 2000, 'bob awareness')
  alice.send(msg)
  const event = await received
  assert.equal(event.data, msg)
  alice.close()
  bob.close()

  // A client joining later must NOT receive the awareness message (it's
  // ephemeral), confirmed by there being nothing waiting within a short
  // window.
  const carol = connect(doc.id, 'Carol')
  await withTimeout(once(carol, 'open'), 2000, 'carol open')
  let gotSomething = false
  carol.addEventListener('message', () => {
    gotSomething = true
  })
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(gotSomething, false)
  carol.close()
})

test('persists binary updates and replays them to a new client', async () => {
  const doc = await createDoc('Persistence test')
  const alice = connect(doc.id, 'Alice')
  await withTimeout(once(alice, 'open'), 2000, 'alice open')

  const update1 = new Uint8Array([9, 9, 9])
  const update2 = new Uint8Array([7, 7])
  alice.send(update1)
  alice.send(update2)
  // Give the server a moment to persist both (single-threaded but async I/O
  // ordering isn't guaranteed to have completed before we open the next
  // connection otherwise).
  await new Promise((r) => setTimeout(r, 150))
  alice.close()

  const bob = connect(doc.id, 'Bob')
  const seen = []
  bob.addEventListener('message', (e) => seen.push(new Uint8Array(e.data)))
  await withTimeout(once(bob, 'open'), 2000, 'bob open')
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(seen.length, 2)
  assert.deepEqual(seen[0], update1)
  assert.deepEqual(seen[1], update2)
  bob.close()
})

test('refuses a WebSocket connection to an unknown document', async () => {
  const ws = connect('nope-nope-nope', 'Alice')
  // The server sends a plain HTTP 404 instead of completing the WebSocket
  // handshake, so the client fails the connection with an error (Node's
  // WebSocket client does not always also emit 'close' in this case).
  await withTimeout(once(ws, 'error'), 2000, 'error on unknown doc')
})

test('accepte plus de 10 connexions simultanées sur un même document', async () => {
  // Le plafond MAX_USERS_PER_DOC (10) a été retiré le 15/09/2026 après le
  // test de charge n°2 : ce test garde la trace de ce choix en vérifiant
  // qu'aucun compteur ne refuse plus personne. Qui entre est décidé par les
  // accès au document (voir access.test.js), plus par un nombre.
  const doc = await createDoc('Salle sans plafond')
  const clients = []
  for (let i = 0; i < 14; i++) clients.push(connect(doc.id, `User${i}`))
  await withTimeout(Promise.all(clients.map((ws) => once(ws, 'open'))), 5000, '14 ouvertures')
  assert.equal(clients.length, 14)

  for (const ws of clients) ws.close()
})

test('AI endpoint reports missing API key clearly (501)', async () => {
  // Le document est exigé depuis le 15/09/2026 : le droit `canUseAI` se
  // vérifie sur un document précis. Créé sans liste d'accès, il est
  // « ouvert » — tout le monde y est éditeur (voir Storage.roleFor).
  const doc = await createDoc('Doc IA')
  const res = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: AI_TEST_COOKIE },
    body: JSON.stringify({ docId: doc.id, text: 'Bonjour le monde', instruction: 'plus formel' }),
  })
  assert.equal(res.status, 501)
  const body = await res.json()
  assert.match(body.error, /ANTHROPIC_API_KEY/)
})

test('AI endpoint rejects empty text (400, after key check)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-real'
  const doc = await createDoc('Doc IA vide')
  const res = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: AI_TEST_COOKIE },
    body: JSON.stringify({ docId: doc.id, text: '   ', instruction: 'x' }),
  })
  delete process.env.ANTHROPIC_API_KEY
  assert.equal(res.status, 400)
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  // Laisse le rapporteur TAP écrire le résultat du tout dernier test avant
  // de couper le process (le serveur maintient sinon la boucle d'événements
  // ouverte indéfiniment) — sans ce court délai, un process.exit() synchrone
  // ici arrive parfois avant que le dernier "ok"/"not ok" ne soit imprimé.
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
