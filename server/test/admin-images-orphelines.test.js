// Les images orphelines au back-office (23/10/2026) : réservé aux
// administrateurs, une analyse qui ne supprime rien, une purge qui ne supprime
// que le nécessaire. Le fond (ce qui est « encore utilisé ») est dans
// images-orphelines.test.js ; ici, la route.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18832
process.env.PORT = String(PORT)
const DATA = mkdtempSync(join(tmpdir(), 'collabtext-test-orphelines-'))
process.env.DATA_DIR = DATA
process.env.ADMIN_EMAILS = 'chef@example.com'
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const Y = await import('yjs')
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function deposer(docId, c) {
  const res = await fetch(`${BASE}/api/docs/${docId}/images`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', cookie: c },
    body: PNG,
  })
  assert.equal(res.status, 201)
  return res.json()
}

const vieillir = (docId, nom, jours) => {
  const t = new Date(Date.now() - jours * 24 * 3600 * 1000)
  utimesSync(join(DATA, 'uploads', docId, nom), t, t)
}

test('analyse puis purge : seule l’orpheline ancienne disparaît', async () => {
  const alice = cookie('alice@example.com')
  const cree = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: alice },
    body: JSON.stringify({ title: 'Doc illustré' }),
  })
  const doc = await cree.json()
  const utilisee = await deposer(doc.id, alice)
  const orpheline = await deposer(doc.id, alice)
  const recente = await deposer(doc.id, alice)
  for (const i of [utilisee, orpheline]) vieillir(doc.id, i.nom, 30)

  // Le texte du document ne contient que la première.
  const ydoc = new Y.Doc()
  const img = new Y.XmlElement('image')
  img.setAttribute('src', utilisee.src)
  ydoc.getXmlFragment('prosemirror').push([img])
  const storage = new Storage(DATA)
  storage.appendUpdate(doc.id, Buffer.from(Y.encodeStateAsUpdate(ydoc)))
  await storage.flushAll()

  const chef = cookie('chef@example.com')
  const lecture = await fetch(`${BASE}/api/admin/images-orphelines`, { headers: { cookie: chef } })
  assert.equal(lecture.status, 200)
  const a = await lecture.json()
  assert.equal(a.orphelines, 1)
  assert.equal(a.documents[0].titre, 'Doc illustré')
  assert.equal(a.documents[0].orphelines[0].nom, orpheline.nom)
  assert.equal(a.documents[0].recentes, 1)
  assert.ok(existsSync(join(DATA, 'uploads', doc.id, orpheline.nom)), 'une analyse ne supprime rien')

  const purge = await fetch(`${BASE}/api/admin/images-orphelines`, { method: 'POST', headers: { cookie: chef } })
  assert.equal(purge.status, 200)
  const r = await purge.json()
  assert.equal(r.supprimees, 1)
  assert.equal(r.octets, PNG.length)
  assert.ok(!existsSync(join(DATA, 'uploads', doc.id, orpheline.nom)))
  assert.ok(existsSync(join(DATA, 'uploads', doc.id, utilisee.nom)), 'celle du texte reste')
  assert.ok(existsSync(join(DATA, 'uploads', doc.id, recente.nom)), 'la récente reste')

  // Et l'image gardée se lit toujours.
  assert.equal((await fetch(`${BASE}${utilisee.src}`, { headers: { cookie: alice } })).status, 200)
})

test('réservé aux administrateurs : ni lecture ni purge pour les autres', async () => {
  for (const methode of ['GET', 'POST']) {
    const sans = await fetch(`${BASE}/api/admin/images-orphelines`, { method: methode })
    assert.equal(sans.status, 403)
    const autre = await fetch(`${BASE}/api/admin/images-orphelines`, {
      method: methode,
      headers: { cookie: cookie('alice@example.com') },
    })
    assert.equal(autre.status, 403)
  }
})
