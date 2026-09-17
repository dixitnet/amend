// Liste d'attente (17/09/2026) : le compteur est public, la liste ne l'est
// jamais. C'est la seule chose qui compte vraiment ici — une page d'accueil
// qui affiche « 42 personnes attendent » est engageante, une API qui rend
// 42 adresses email à qui la demande est une fuite.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18795
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-waitlist-'))
delete process.env.ANTHROPIC_API_KEY
delete process.env.MAILGUN_API_KEY
delete process.env.MAILGUN_DOMAIN
process.env.ADMIN_EMAILS = 'admin@example.com'

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
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

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]

const inscrire = (email) =>
  fetch(`${BASE}/api/waitlist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  })

test('le compteur est public et ne révèle aucune adresse', async () => {
  await inscrire('a@example.com')
  await inscrire('b@example.com')
  const res = await fetch(`${BASE}/api/waitlist/count`)
  assert.equal(res.status, 200)
  const corps = await res.json()
  assert.equal(corps.count, 2)
  // Rien d'autre que le nombre ne sort par cette porte.
  assert.deepEqual(Object.keys(corps), ['count'])
  assert.ok(!JSON.stringify(corps).includes('@'))
})

test('le compteur déduplique — le fichier, lui, empile', async () => {
  const avant = (await (await fetch(`${BASE}/api/waitlist/count`)).json()).count
  await inscrire('a@example.com')
  await inscrire('a@example.com')
  const apres = (await (await fetch(`${BASE}/api/waitlist/count`)).json()).count
  assert.equal(apres, avant, 'une adresse déjà inscrite a fait monter le compteur')
})

test('la liste est refusée sans session et à un simple utilisateur', async () => {
  assert.equal((await fetch(`${BASE}/api/admin/waitlist`)).status, 403)
  const res = await fetch(`${BASE}/api/admin/waitlist`, { headers: { cookie: cookie('quidam@example.com') } })
  assert.equal(res.status, 403)
  assert.ok(!JSON.stringify(await res.json()).includes('@example.com'))
})

test('un administrateur obtient la liste, dates comprises', async () => {
  const res = await fetch(`${BASE}/api/admin/waitlist`, { headers: { cookie: cookie('admin@example.com') } })
  assert.equal(res.status, 200)
  const { inscrits } = await res.json()
  assert.ok(Array.isArray(inscrits))
  assert.ok(inscrits.some((i) => i.email === 'b@example.com'))
  assert.ok(inscrits.every((i) => typeof i.ts === 'number'))
})

test('une adresse invalide est refusée', async () => {
  assert.equal((await inscrire('pas-une-adresse')).status, 400)
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
