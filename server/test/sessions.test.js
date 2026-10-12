// Révocation des sessions (audit S8) : le store, le contrôle dans
// readSession, et le « se déconnecter partout » de bout en bout (cookie,
// WebSocket ouvert, autre appareil, nouvelle session).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

const PORT = 18812
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-sessions-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = ''
const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader, readSession } = await import('../auth.js')
const { SessionsRevoquees } = await import('../sessions.js')

for (let i = 0; i < 100; i++) {
  try {
    await fetch(`${BASE}/api/docs`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 50))
  }
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const cookieFor = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const lire = (cookie) => readSession({ headers: { cookie } })

test('le store : 0 par défaut, l’instant posé ensuite, et survie au rechargement', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sessions-unite-'))
  const a = new SessionsRevoquees(dir)
  assert.equal(a.validesDepuis('x@example.com'), 0)
  assert.equal(a.validesDepuis(''), 0)
  a.revoquer('x@example.com', 12345)
  assert.equal(a.validesDepuis('x@example.com'), 12345)
  assert.equal(a.validesDepuis('autre@example.com'), 0)
  // Un autre objet sur le même dossier voit la même chose (fichier, pas mémoire).
  assert.equal(new SessionsRevoquees(dir).validesDepuis('x@example.com'), 12345)
  // Un fichier modifié par ailleurs est relu.
  writeFileSync(join(dir, 'sessions-revoquees.json'), JSON.stringify({ 'x@example.com': 99999 }))
  assert.equal(a.validesDepuis('x@example.com'), 99999)
  rmSync(dir, { recursive: true, force: true })
})

test('un fichier illisible n’ouvre pas de sessions révoquées : il lève', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sessions-illisible-'))
  writeFileSync(join(dir, 'sessions-revoquees.json'), '{"x@example.com": 12')
  assert.throws(() => new SessionsRevoquees(dir).validesDepuis('x@example.com'))
  assert.ok(readdirSync(dir).some((f) => f.includes('illisible')), 'le fichier est mis de côté')
  rmSync(dir, { recursive: true, force: true })
})

test('se déconnecter partout : l’ancien cookie ne vaut plus, un nouveau vaut, les autres adresses ne bougent pas', async () => {
  const ancien = cookieFor('s8-alice@example.com')
  const autreAppareil = cookieFor('s8-alice@example.com')
  const bob = cookieFor('s8-bob@example.com')
  await attendre(5)
  assert.equal(lire(ancien), 's8-alice@example.com')

  const res = await fetch(`${BASE}/api/auth/logout-all`, { method: 'POST', headers: { cookie: ancien } })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('set-cookie') || '', /Max-Age=0/, 'le cookie de cet appareil est effacé')

  assert.equal(lire(ancien), null)
  assert.equal(lire(autreAppareil), null, 'l’autre appareil est déconnecté aussi')
  assert.equal(lire(bob), 's8-bob@example.com')
  assert.equal((await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie: ancien } })).json()).email, null)

  await attendre(5)
  const neuf = cookieFor('s8-alice@example.com')
  assert.equal(lire(neuf), 's8-alice@example.com', 'une session ouverte ensuite vaut normalement')
  assert.equal((await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie: neuf } })).json()).email, 's8-alice@example.com')
})

test('se déconnecter partout demande une session', async () => {
  assert.equal((await fetch(`${BASE}/api/auth/logout-all`, { method: 'POST' })).status, 401)
})

test('se déconnecter partout coupe aussi les WebSocket ouvertes', async () => {
  const cookie = cookieFor('s8-carole@example.com')
  const doc = await (
    await fetch(`${BASE}/api/docs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Doc S8' }),
    })
  ).json()
  const ws = new WebSocket(`ws://localhost:${PORT}/ws/${doc.id}?user=X`, { headers: { cookie } })
  const ouverte = await new Promise((resolve) => {
    ws.on('open', () => resolve(true))
    ws.on('error', () => resolve(false))
    ws.on('unexpected-response', () => resolve(false))
  })
  assert.equal(ouverte, true, 'la WebSocket s’ouvre avec une session valide')
  const fermee = new Promise((resolve) => ws.on('close', () => resolve(true)))
  await attendre(100)
  await fetch(`${BASE}/api/auth/logout-all`, { method: 'POST', headers: { cookie } })
  assert.equal(await Promise.race([fermee, attendre(1500).then(() => false)]), true)

  // Et l'ancien cookie n'ouvre plus de WebSocket.
  const refus = await new Promise((resolve) => {
    const w = new WebSocket(`ws://localhost:${PORT}/ws/${doc.id}?user=X`, { headers: { cookie } })
    w.on('open', () => resolve('ouverte'))
    w.on('error', () => resolve('refusee'))
    w.on('unexpected-response', () => resolve('refusee'))
    w.on('close', () => resolve('refusee'))
  })
  assert.equal(refus, 'refusee')
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await attendre(50)
  process.exit(0)
})
