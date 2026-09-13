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

await import('../server.js')
await waitForServer()

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
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  assert.equal(res.status, 201)
  return res.json()
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

test('refuses an 11th simultaneous connection to the same document (MAX_USERS_PER_DOC)', async () => {
  const doc = await createDoc('Salle pleine')
  const clients = []
  for (let i = 0; i < 10; i++) {
    const ws = connect(doc.id, `User${i}`)
    clients.push(ws)
  }
  await withTimeout(Promise.all(clients.map((ws) => once(ws, 'open'))), 3000, 'first 10 opening')

  const eleventh = connect(doc.id, 'User10')
  // Same rejection shape as the unknown-document case above: a plain HTTP
  // error response instead of a completed handshake.
  await withTimeout(once(eleventh, 'error'), 2000, 'error on full room')

  for (const ws of clients) ws.close()
})

test('AI endpoint reports missing API key clearly (501)', async () => {
  const res = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Bonjour le monde', instruction: 'plus formel' }),
  })
  assert.equal(res.status, 501)
  const body = await res.json()
  assert.match(body.error, /ANTHROPIC_API_KEY/)
})

test('AI endpoint rejects empty text (400, after key check)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-real'
  const res = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '   ', instruction: 'x' }),
  })
  delete process.env.ANTHROPIC_API_KEY
  assert.equal(res.status, 400)
})

test.after(() => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  process.exit(0) // the server keeps the event loop alive; end the process explicitly
})
