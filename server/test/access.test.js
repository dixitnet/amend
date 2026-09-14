// Tests de la gestion des rôles/accès (voir
// claude/conception-gestion-utilisateurs.md, projet Amend) : lien
// d'invitation auto-connectant, restriction éditeur/correcteur, et
// reconnexion par lien magique. Même style que integration.test.js — un
// process dédié (port différent) pour ne pas interférer avec lui.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18788
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-access-'))
delete process.env.ANTHROPIC_API_KEY
delete process.env.MAILGUN_API_KEY
delete process.env.MAILGUN_DOMAIN

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader, createReconnectToken, consumeReconnectToken } = await import('../auth.js')
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

function cookieFor(email) {
  return sessionCookieHeader(email, { secure: false }).split(';')[0]
}

test('créer un document sans session est refusé (401)', async () => {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  })
  assert.equal(res.status, 401)
})

test('créer un document connecté en fait l’auteur éditeur', async () => {
  const cookie = cookieFor('alice@example.com')
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Doc de Alice' }),
  })
  assert.equal(res.status, 201)
  const doc = await res.json()

  const getRes = await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie } })
  assert.equal(getRes.status, 200)
  const meta = await getRes.json()
  assert.equal(meta.myRole, 'editeur')

  // Une autre personne, non invitée, n'y a pas accès.
  const otherRes = await fetch(`${BASE}/api/docs/${doc.id}`, {
    headers: { cookie: cookieFor('bob@example.com') },
  })
  assert.equal(otherRes.status, 403)

  // Pas de session du tout : refusé aussi (pas de mode anonyme).
  const anonRes = await fetch(`${BASE}/api/docs/${doc.id}`)
  assert.equal(anonRes.status, 403)
})

test('lien d’invitation : auto-connectant, réutilisable, un rôle par lien', async () => {
  const editorCookie = cookieFor('carla@example.com')
  const createRes = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ title: 'Doc partagé' }),
  })
  const doc = await createRes.json()

  const accessRes = await fetch(`${BASE}/api/docs/${doc.id}/access`, { headers: { cookie: editorCookie } })
  assert.equal(accessRes.status, 200)
  const { inviteLinks } = await accessRes.json()
  assert.ok(inviteLinks.correcteur)
  assert.ok(inviteLinks.editeur)

  // GET public : révèle le titre et le rôle avant de demander un email.
  const previewRes = await fetch(`${BASE}/api/invite/${inviteLinks.correcteur}`)
  assert.equal(previewRes.status, 200)
  const preview = await previewRes.json()
  assert.equal(preview.role, 'correcteur')
  assert.equal(preview.docId, doc.id)

  // Deux personnes différentes utilisent le MÊME lien — les deux obtiennent
  // le rôle correcteur (le lien sert à plusieurs personnes, voir la
  // conception).
  for (const email of ['dan@example.com', 'eve@example.com']) {
    const acceptRes = await fetch(`${BASE}/api/invite/${inviteLinks.correcteur}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    assert.equal(acceptRes.status, 200)
    const body = await acceptRes.json()
    assert.equal(body.docId, doc.id)
    assert.ok(acceptRes.headers.get('set-cookie'))

    const meRes = await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie: cookieFor(email) } })
    const meta = await meRes.json()
    assert.equal(meta.myRole, 'correcteur')
  }

  // Un correcteur ne peut pas gérer les accès.
  const forbiddenRes = await fetch(`${BASE}/api/docs/${doc.id}/access`, {
    headers: { cookie: cookieFor('dan@example.com') },
  })
  assert.equal(forbiddenRes.status, 403)

  // L'éditeur révoque dan : il perd l'accès.
  const revokeRes = await fetch(`${BASE}/api/docs/${doc.id}/access/${encodeURIComponent('dan@example.com')}`, {
    method: 'DELETE',
    headers: { cookie: editorCookie },
  })
  assert.equal(revokeRes.status, 200)
  const afterRevoke = await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie: cookieFor('dan@example.com') } })
  assert.equal(afterRevoke.status, 403)

  // Régénérer le lien : l'ancien jeton ne fonctionne plus.
  const regenRes = await fetch(`${BASE}/api/docs/${doc.id}/invite-link/correcteur/regenerate`, {
    method: 'POST',
    headers: { cookie: editorCookie },
  })
  assert.equal(regenRes.status, 200)
  const staleRes = await fetch(`${BASE}/api/invite/${inviteLinks.correcteur}`)
  assert.equal(staleRes.status, 404)
})

test('lien de reconnexion : usage unique, expire une fois consommé', async () => {
  const token = createReconnectToken('finn@example.com')
  const okRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  assert.equal(okRes.status, 200)
  assert.ok(okRes.headers.get('set-cookie'))

  const reuseRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  assert.equal(reuseRes.status, 400)

  // consumeReconnectToken direct : confirme aussi l'usage unique côté module.
  const token2 = createReconnectToken('finn@example.com')
  assert.equal(consumeReconnectToken(token2), 'finn@example.com')
  assert.equal(consumeReconnectToken(token2), null)
})

test('demander un lien de reconnexion répond 200 même sans Mailgun configuré', async () => {
  // MAILGUN_API_KEY/MAILGUN_DOMAIN absents dans cet environnement de test
  // (voir en tête de fichier) — l'échec d'envoi est journalisé côté
  // serveur, pas renvoyé au client (voir server.js : on ne veut pas confirmer
  // depuis l'extérieur qu'une adresse existe ou non).
  const res = await fetch(`${BASE}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'gina@example.com' }),
  })
  assert.equal(res.status, 200)
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
