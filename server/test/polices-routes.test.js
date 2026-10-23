// Les polices de l'instance par l'API (24/10/2026) : le catalogue pour toute
// personne connectée, le dépôt et la suppression pour les administrateurs.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18833
process.env.PORT = String(PORT)
const DATA = mkdtempSync(join(tmpdir(), 'collabtext-test-polices-'))
process.env.DATA_DIR = DATA
process.env.ADMIN_EMAILS = 'chef@example.com'
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
// Pas de binaire Typst dans l'essai : la vérification « Typst reconnaît-il la
// famille ? » est alors sautée (elle a son propre essai, polices-typst.test.js).
process.env.TYPST_BIN = '/nulle/part/typst'

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { POLICES, POLICES_BASE, police } = await import('../../shared/style.js')
const { fabriquerPolice } = await import('./aides-polices.js')
await attendre()

function attendre() {
  return new Promise((resolve, reject) => {
    const fin = Date.now() + 5000
    ;(function essai() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => (Date.now() > fin ? reject(err) : setTimeout(essai, 50)))
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const chef = cookie('chef@example.com')
const alice = cookie('alice@example.com')

const deposer = (octets, c = chef) =>
  fetch(`${BASE}/api/admin/polices`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', cookie: c },
    body: octets,
  })

test('sans session : ni catalogue ni fichier', async () => {
  assert.equal((await fetch(`${BASE}/api/polices`)).status, 401)
  assert.equal((await fetch(`${BASE}/api/polices/i-x/i-x-aaaaaaaaaaaa.ttf`)).status, 401)
})

test('un utilisateur ordinaire ne dépose ni ne supprime, mais lit le catalogue', async () => {
  assert.equal((await deposer(fabriquerPolice(), alice)).status, 403)
  assert.equal((await fetch(`${BASE}/api/admin/polices`, { headers: { cookie: alice } })).status, 403)
  assert.equal(
    (await fetch(`${BASE}/api/admin/polices/i-x`, { method: 'DELETE', headers: { cookie: alice } })).status,
    403
  )
  const res = await fetch(`${BASE}/api/polices`, { headers: { cookie: alice } })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).polices, [])
})

test('dépôt, lecture du fichier, mise à jour de la liste partagée, suppression', async () => {
  const octets = fabriquerPolice({ famille: 'Caslon Essai', serifStyle: 2 })
  const res = await deposer(octets)
  assert.equal(res.status, 201)
  const { police: p, fichier, cree } = await res.json()
  assert.equal(cree, true)
  assert.equal(p.id, 'i-caslon-essai')
  assert.equal(p.famille, 'Caslon Essai')

  // Le serveur connaît tout de suite l'identifiant (la validation des mises en page).
  assert.equal(police('i-caslon-essai').typst[0], 'Caslon Essai')

  // Le catalogue public n'a pas les détails de gestion.
  const cat = await (await fetch(`${BASE}/api/polices`, { headers: { cookie: alice } })).json()
  assert.equal(cat.polices.length, 1)
  assert.deepEqual(Object.keys(cat.polices[0]).sort(), ['famille', 'fichiers', 'generique', 'id', 'label'])
  const detail = await (await fetch(`${BASE}/api/admin/polices`, { headers: { cookie: chef } })).json()
  assert.equal(detail.polices[0].ajoutePar, 'chef@example.com')
  assert.ok(detail.octets > 0)

  // Le fichier lui-même : octets identiques, type de police, cache immuable.
  const f = await fetch(`${BASE}/api/polices/${p.id}/${fichier.nom}`, { headers: { cookie: alice } })
  assert.equal(f.status, 200)
  assert.equal(f.headers.get('content-type'), 'font/ttf')
  assert.match(f.headers.get('cache-control'), /immutable/)
  assert.deepEqual(Buffer.from(await f.arrayBuffer()), octets)
  assert.equal(
    (await fetch(`${BASE}/api/polices/${p.id}/i-autre-aaaaaaaaaaaa.ttf`, { headers: { cookie: alice } })).status,
    404
  )

  // Un style de plus complète la famille.
  const gras = await deposer(fabriquerPolice({ famille: 'Caslon Essai', poids: 700, sousFamille: 'Bold' }))
  assert.equal((await gras.json()).cree, false)

  const sup = await fetch(`${BASE}/api/admin/polices/${p.id}`, { method: 'DELETE', headers: { cookie: chef } })
  assert.equal(sup.status, 200)
  assert.equal(POLICES.length, POLICES_BASE.length, 'la liste partagée est revenue à la base')
  assert.ok(!existsSync(join(DATA, 'polices', fichier.nom)))
  assert.equal(
    (await fetch(`${BASE}/api/admin/polices/${p.id}`, { method: 'DELETE', headers: { cookie: chef } })).status,
    404
  )
})

test('refus lisibles : pas une police, restreinte, variable, trop lourde', async () => {
  const msg = async (res) => (await res.json()).error
  const pasPolice = await deposer(Buffer.from('<?xml version="1.0"?>'.repeat(10)))
  assert.equal(pasPolice.status, 415)
  const restreinte = await deposer(fabriquerPolice({ fsType: 2 }))
  assert.equal(restreinte.status, 403)
  assert.match(await msg(restreinte), /interdit son embarquement/)
  const variable = await deposer(fabriquerPolice({ variable: true }))
  assert.equal(variable.status, 400)
  assert.match(await msg(variable), /variables/)
  const lourde = await deposer(Buffer.alloc(11 * 1024 * 1024))
  assert.equal(lourde.status, 413)
  assert.match(await msg(lourde), /dépasse 10 Mo/)
  assert.equal((await (await fetch(`${BASE}/api/polices`, { headers: { cookie: alice } })).json()).polices.length, 0)
})
