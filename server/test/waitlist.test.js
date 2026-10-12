// Liste d'attente (17/09/2026) : **on s'inscrit sans session, on ne lit
// qu'en administrateur**. Rien n'en sort autrement — ni les adresses, ni
// même leur nombre : un compteur public a été envisagé puis écarté, et ces
// tests sont ce qui empêchera de le rouvrir par inadvertance.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18795
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-waitlist-'))
// `= ''` et non `delete` : `loadDotEnv` ne pose une variable que si elle est
// **absente** de l'environnement (`key in process.env`). Supprimer une clé
// la rend absente — et le .env de la machine de développement la remet
// aussitôt, avec sa vraie valeur. Un test « sans Mailgun » envoyait donc de
// vrais courriers, et un test « sans clé Anthropic » appelait l'API. La
// chaîne vide, elle, reste présente et vide. (Constaté le 17/09/2026.)
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
// Ceinture et bretelles : même si une clé passait, rien ne sort de la machine.
process.env.MAILGUN_API_HOST = '127.0.0.1'
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

test('rien de la liste ne se lit sans être administrateur', async () => {
  await inscrire('a@example.com')
  await inscrire('b@example.com')
  // Il n'existe aucune route publique de lecture, pas même un compteur.
  assert.equal((await fetch(`${BASE}/api/waitlist/count`)).status, 404)
  assert.equal((await fetch(`${BASE}/api/waitlist`)).status, 404)
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

// Audit du 10/10/2026, S4 : l'inscription est publique, donc bornée.
const inscrireDepuis = (email, ip) =>
  fetch(`${BASE}/api/waitlist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  })
const lireListe = async () =>
  (await (await fetch(`${BASE}/api/admin/waitlist`, { headers: { cookie: cookie('admin@example.com') } })).json())
    .inscrits

test('une adresse de plus de 254 caractères est refusée', async () => {
  const longue = `${'a'.repeat(250)}@example.com`
  assert.equal((await inscrireDepuis(longue, '10.0.0.1')).status, 400)
  assert.ok(!(await lireListe()).some((i) => i.email === longue))
})

test("la même adresse revenue dans l'heure n'ajoute pas de ligne", async () => {
  await inscrireDepuis('repete@example.com', '10.0.0.2')
  await inscrireDepuis('repete@example.com', '10.0.0.2')
  await inscrireDepuis('repete@example.com', '10.0.0.3')
  assert.equal((await lireListe()).filter((i) => i.email === 'repete@example.com').length, 1)
})

test('cinq inscriptions par heure et par origine, pas plus', async () => {
  const statuts = []
  for (let i = 0; i < 7; i++) statuts.push((await inscrireDepuis(`flux${i}@example.com`, '10.0.0.9')).status)
  assert.deepEqual(statuts, [200, 200, 200, 200, 200, 429, 429])
  // Une autre origine n'est pas touchée.
  assert.equal((await inscrireDepuis('ailleurs@example.com', '10.0.0.10')).status, 200)
  const adresses = (await lireListe()).map((i) => i.email)
  assert.ok(!adresses.includes('flux5@example.com'))
})

test('la liste a un plafond', async () => {
  const { Storage } = await import('../storage.js')
  const st = new Storage(process.env.DATA_DIR)
  const gros = Array.from({ length: 20000 }, (_, i) => ({ email: `x${i}@example.com`, ts: 1 }))
  const { writeFileSync, readFileSync } = await import('node:fs')
  const chemin = join(process.env.DATA_DIR, 'waitlist.json')
  const avant = readFileSync(chemin, 'utf8')
  writeFileSync(chemin, JSON.stringify(gros), 'utf8')
  assert.equal(st.addToWaitlist('trop@example.com'), false)
  writeFileSync(chemin, avant, 'utf8')
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
