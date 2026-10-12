// Quotas par compte et petits garde-fous (audit S14, S18, S19).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'

const PORT = 18814
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-quotas-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'chef@example.com'
process.env.DOCUMENTS_MAX_PAR_COMPTE = '3'
process.env.IMAGES_MAX_PAR_COMPTE_MO = '0.0003' // ≈ 315 octets
const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
for (let i = 0; i < 100; i++) {
  try {
    await fetch(`${BASE}/api/docs`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 50))
  }
}

const cookieFor = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const creer = (cookie, title = 'Doc') =>
  fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title }),
  })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const deposer = (docId, cookie) =>
  fetch(`${BASE}/api/docs/${docId}/images`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', cookie },
    body: PNG,
  })

test('S14 : un compte ne crée pas plus de documents que son plafond ; un administrateur n’en a pas', async () => {
  const cookie = cookieFor('quota-docs@example.com')
  for (let i = 0; i < 3; i++) assert.equal((await creer(cookie, `Doc ${i}`)).status, 201)
  const refus = await creer(cookie, 'de trop')
  assert.equal(refus.status, 403)
  assert.match((await refus.json()).error, /3 documents/)
  // Un autre compte n'est pas concerné.
  assert.equal((await creer(cookieFor('quota-autre@example.com'))).status, 201)
  // Un administrateur non plus.
  const chef = cookieFor('chef@example.com')
  for (let i = 0; i < 5; i++) assert.equal((await creer(chef)).status, 201)
})

test('S14 : les images de tous les documents du propriétaire comptent ensemble', async () => {
  const cookie = cookieFor('quota-images@example.com')
  const a = await (await creer(cookie, 'A')).json()
  const b = await (await creer(cookie, 'B')).json()
  // ≈ 315 octets au total, ~67 par image : quatre images tiennent, la cinquième non,
  // qu'elle aille dans le même document ou dans l'autre.
  let ok = 0
  for (let i = 0; i < 4; i++) {
    const res = await deposer(i % 2 ? a.id : b.id, cookie)
    if (res.status === 201) ok++
  }
  assert.equal(ok, 4)
  const refus = await deposer(a.id, cookie)
  assert.equal(refus.status, 413)
  assert.match((await refus.json()).error, /limite d’images/)
})

test('S18 : l’historique brut d’un journal énorme est refusé (413), un journal normal passe', async () => {
  const cookie = cookieFor('quota-histo@example.com')
  const doc = await (await creer(cookie, 'Histo')).json()
  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}/history/raw`, { headers: { cookie } })).status, 200)
  // Un journal de 33 Mo : le fichier suffit, l'enveloppe n'est pas décodée avant la mesure.
  const dir = process.env.DATA_DIR
  mkdirSync(dir, { recursive: true })
  const journal = join(dir, `${doc.id}.log`)
  const taille = 33 * 1024 * 1024
  writeFileSync(journal, Buffer.alloc(taille))
  const res = await fetch(`${BASE}/api/docs/${doc.id}/history/raw`, { headers: { cookie } })
  assert.equal(res.status, 413)
})

test('S19 : le serveur écoute sur la boucle locale seulement', async () => {
  const joindre = (hote) =>
    new Promise((resolve) => {
      const s = net.connect({ port: PORT, host: hote })
      s.on('connect', () => {
        s.destroy()
        resolve(true)
      })
      s.on('error', () => resolve(false))
    })
  assert.equal(await joindre('127.0.0.1'), true)
  // Une autre interface de la machine (si elle en a une) ne répond pas.
  const { networkInterfaces } = await import('node:os')
  const autres = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.family === 'IPv4')
    .map((i) => i.address)
  for (const adresse of autres) assert.equal(await joindre(adresse), false, `joignable sur ${adresse}`)
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
