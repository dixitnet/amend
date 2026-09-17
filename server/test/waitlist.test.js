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

test("rien de la liste ne se lit sans être administrateur", async () => {
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

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
