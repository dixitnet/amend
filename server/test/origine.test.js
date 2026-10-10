// Contrôle de l'en-tête Origin (audit S13) : la règle seule, puis le vrai
// serveur (requêtes qui modifient et poignée de main WebSocket).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

const PORT = 18813
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-origine-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = ''
process.env.APP_BASE_URL = 'https://www.amend.ink'
const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { origineAutorisee, methodeModifie } = await import('../origine.js')

for (let i = 0; i < 100; i++) {
  try {
    await fetch(`${BASE}/api/docs`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 50))
  }
}

const cookieFor = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const req = (headers) => ({ headers })
const APP = 'https://www.amend.ink'

test('la règle : sans Origin, ça passe, sauf un Sec-Fetch-Site « cross-site »', () => {
  assert.equal(origineAutorisee(req({}), APP), true)
  assert.equal(origineAutorisee(req({ 'sec-fetch-site': 'same-origin' }), APP), true)
  assert.equal(origineAutorisee(req({ 'sec-fetch-site': 'cross-site' }), APP), false)
})

test('la règle : l’Origin doit être celui de l’application ou de l’hôte visé', () => {
  assert.equal(origineAutorisee(req({ origin: 'https://www.amend.ink' }), APP), true)
  assert.equal(origineAutorisee(req({ origin: 'https://evil.example' }), APP), false)
  assert.equal(origineAutorisee(req({ origin: 'https://www.amend.ink.evil.example' }), APP), false)
  assert.equal(origineAutorisee(req({ origin: 'http://www.amend.ink' }), APP), true, 'le schéma n’est pas comparé : l’hôte suffit, Caddy force https')
  assert.equal(origineAutorisee(req({ origin: 'null' }), APP), false)
  assert.equal(origineAutorisee(req({ origin: 'pas une adresse' }), APP), false)
  // L'hôte auquel la requête s'adresse (Vite en développement, second nom du site).
  assert.equal(origineAutorisee(req({ origin: 'http://localhost:5173', host: 'localhost:5173' }), APP), true)
  assert.equal(origineAutorisee(req({ origin: 'http://localhost:5173', host: 'www.amend.ink' }), APP), false)
})

test('seules les méthodes qui modifient sont contrôlées', () => {
  for (const m of ['POST', 'put', 'PATCH', 'DELETE']) assert.equal(methodeModifie(m), true, m)
  for (const m of ['GET', 'HEAD', 'OPTIONS']) assert.equal(methodeModifie(m), false, m)
})

test('une requête POST venue d’une autre origine est refusée (403) avant toute action', async () => {
  const cookie = cookieFor('origine-a@example.com')
  const pirate = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: 'https://evil.example' },
    body: JSON.stringify({ title: 'Créé depuis un autre site' }),
  })
  assert.equal(pirate.status, 403)
  const liste = await (await fetch(`${BASE}/api/docs`, { headers: { cookie } })).json()
  assert.ok(!JSON.stringify(liste).includes('Créé depuis un autre site'), 'rien n’a été créé')

  // Le même appel depuis l'application, ou sans navigateur, passe.
  for (const origin of ['https://www.amend.ink', `${BASE}`, undefined]) {
    const headers = { 'content-type': 'application/json', cookie }
    if (origin) headers.origin = origin
    const ok = await fetch(`${BASE}/api/docs`, { method: 'POST', headers, body: JSON.stringify({ title: 'Légitime' }) })
    assert.equal(ok.status, 201, `origine ${origin}`)
  }
})

test('un GET venu d’ailleurs n’est pas concerné ; l’invitation d’un attaquant non plus ne passe pas', async () => {
  assert.equal((await fetch(`${BASE}/api/auth/me`, { headers: { origin: 'https://evil.example' } })).status, 200)
  const fixation = await fetch(`${BASE}/api/invitations/jeton-de-l-attaquant`, { method: 'POST', headers: { origin: 'https://evil.example' } })
  assert.equal(fixation.status, 403, 'refusé avant même de chercher le jeton (404 sinon)')
})

test('la poignée de main WebSocket depuis une autre origine est refusée', async () => {
  const cookie = cookieFor('origine-b@example.com')
  const doc = await (
    await fetch(`${BASE}/api/docs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Doc origine' }),
    })
  ).json()
  const essayer = (origin) =>
    new Promise((resolve) => {
      const headers = { cookie }
      if (origin) headers.origin = origin
      const ws = new WebSocket(`ws://localhost:${PORT}/ws/${doc.id}?user=X`, { headers })
      ws.on('open', () => {
        ws.close()
        resolve('ouverte')
      })
      ws.on('error', () => resolve('refusee'))
      ws.on('unexpected-response', () => resolve('refusee'))
    })
  assert.equal(await essayer('https://evil.example'), 'refusee')
  assert.equal(await essayer('https://www.amend.ink'), 'ouverte')
  assert.equal(await essayer(undefined), 'ouverte')
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
