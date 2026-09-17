// Tests des images (16/09/2026, voir claude/etude-tableaux-images.md).
// Ce qui est vérifié ici n'est pas « est-ce que ça marche » — un dépôt qui
// marche se voit tout de suite — mais les quatre façons dont ça peut mal
// tourner sans qu'on s'en aperçoive : un correcteur qui dépose, une image
// lisible sans accès au document, un nom de fichier qui sort du dossier,
// et un quota qui ne retient rien.
//
// Même forme que access.test.js : un process dédié, sur son propre port.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18790
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-images-'))
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
process.env.ADMIN_EMAILS = ''

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { Uploads, DEFAUT_MAX_IMAGE_MO, DEFAUT_MAX_DOCUMENT_MO } = await import('../uploads.js')
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

/** Un PNG 1×1 valide — on ne teste pas le décodage d'image ici, seulement
 * le transport et les droits. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function creerDoc(cookie, title = 'Doc à images') {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title }),
  })
  return res.json()
}

function deposer(docId, cookie, { body = PNG_1x1, type = 'image/png' } = {}) {
  return fetch(`${BASE}/api/docs/${docId}/images`, {
    method: 'POST',
    headers: { 'content-type': type, cookie },
    body,
  })
}

test("un éditeur dépose une image, et elle n'est lisible qu'avec un accès", async () => {
  const editeur = cookieFor('alice@example.com')
  const doc = await creerDoc(editeur)

  const depot = await deposer(doc.id, editeur)
  assert.equal(depot.status, 201)
  const { src, nom, octets } = await depot.json()
  assert.equal(octets, PNG_1x1.length)
  assert.equal(src, `/api/docs/${doc.id}/images/${nom}`)

  // Avec accès : on récupère exactement les octets déposés.
  const lue = await fetch(`${BASE}${src}`, { headers: { cookie: editeur } })
  assert.equal(lue.status, 200)
  assert.equal(lue.headers.get('content-type'), 'image/png')
  assert.equal(Buffer.from(await lue.arrayBuffer()).equals(PNG_1x1), true)
  // Une image reste du contenu de document : jamais dans un cache partagé.
  assert.match(lue.headers.get('cache-control'), /private/)

  // Sans session, et avec une session étrangère : refusé. C'est le point
  // qui refait, sinon, la faille trouvée le 15/09 sur history/raw.
  assert.equal((await fetch(`${BASE}${src}`)).status, 403)
  assert.equal((await fetch(`${BASE}${src}`, { headers: { cookie: cookieFor('bob@example.com') } })).status, 403)
})

test('un correcteur ne peut pas déposer d’image', async () => {
  const editeur = cookieFor('carla@example.com')
  const doc = await creerDoc(editeur)
  const storage = new Storage(process.env.DATA_DIR)
  storage.inviteEmail(doc.id, 'dan@example.com', 'correcteur', 'carla@example.com')
  storage.acceptInvitation(doc.id, 'dan@example.com')

  const refus = await deposer(doc.id, cookieFor('dan@example.com'))
  assert.equal(refus.status, 403)

  // Mais il lit sans problème celles que l'éditeur a déposées.
  const { src } = await (await deposer(doc.id, editeur)).json()
  assert.equal((await fetch(`${BASE}${src}`, { headers: { cookie: cookieFor('dan@example.com') } })).status, 200)
})

test('seuls le png et le jpeg sont acceptés', async () => {
  const editeur = cookieFor('erin@example.com')
  const doc = await creerDoc(editeur)
  for (const type of ['image/webp', 'image/svg+xml', 'text/html', 'application/octet-stream']) {
    const res = await deposer(doc.id, editeur, { type })
    assert.equal(res.status, 415, `type ${type} accepté à tort`)
  }
})

test('un nom de fichier fabriqué ne sort pas du dossier du document', async () => {
  const editeur = cookieFor('fred@example.com')
  const docA = await creerDoc(editeur, 'A')
  const docB = await creerDoc(editeur, 'B')
  const { nom } = await (await deposer(docA.id, editeur)).json()

  // Le nom existe — mais dans le dossier de A, pas dans celui de B.
  assert.equal((await fetch(`${BASE}/api/docs/${docB.id}/images/${nom}`, { headers: { cookie: editeur } })).status, 404)

  // Et rien qui ressemble à une traversée n'aboutit.
  for (const tentative of ['..%2F..%2Fdocs.json', '....//docs.json', 'style.json', '%2Fetc%2Fpasswd']) {
    const res = await fetch(`${BASE}/api/docs/${docA.id}/images/${tentative}`, { headers: { cookie: editeur } })
    assert.ok(res.status === 404 || res.status === 400, `${tentative} a répondu ${res.status}`)
  }
})

test('le quota par document arrête le dépôt', async () => {
  const uploads = new Uploads(process.env.DATA_DIR)
  const docId = 'quota-test-doc'
  // On remplit le dossier à la main jusqu'à la limite : passer par l'API
  // demanderait 200 Mo de transfert pour tester une soustraction.
  mkdirSync(join(process.env.DATA_DIR, 'uploads', docId), { recursive: true })
  writeFileSync(
    join(process.env.DATA_DIR, 'uploads', docId, 'remplissage.png'),
    Buffer.alloc(uploads.maxDocumentOctets - 10)
  )

  assert.throws(() => uploads.enregistrer(docId, Buffer.alloc(100), 'image/png'), /limite d'images/)
  // Ce qui tient encore passe.
  assert.ok(uploads.enregistrer(docId, Buffer.alloc(5), 'image/png').nom)
})

test('les seuils se règlent par le .env, et une valeur absurde ne les efface pas', () => {
  const parDefaut = new Uploads(process.env.DATA_DIR)
  assert.equal(parDefaut.maxImageOctets, DEFAUT_MAX_IMAGE_MO * 1024 * 1024)
  assert.equal(parDefaut.maxDocumentOctets, DEFAUT_MAX_DOCUMENT_MO * 1024 * 1024)

  const regle = new Uploads(process.env.DATA_DIR, { maxImageMo: '12', maxDocumentMo: 500 })
  assert.equal(regle.maxImageOctets, 12 * 1024 * 1024)
  assert.equal(regle.maxDocumentOctets, 500 * 1024 * 1024)

  // Une valeur vide, négative ou illisible retombe sur le défaut : un quota
  // NaN laisserait tout passer, ce qui est exactement ce qu'on ne veut pas.
  for (const absurde of ['', 'beaucoup', '-3', '0', undefined]) {
    assert.equal(new Uploads(process.env.DATA_DIR, { maxImageMo: absurde }).maxImageOctets, DEFAUT_MAX_IMAGE_MO * 1024 * 1024)
  }
})

test('supprimer un document emporte ses images', async () => {
  const editeur = cookieFor('gina@example.com')
  const doc = await creerDoc(editeur)
  const { src } = await (await deposer(doc.id, editeur)).json()
  const uploads = new Uploads(process.env.DATA_DIR)
  assert.ok(uploads.octetsDocument(doc.id) > 0)

  const suppr = await fetch(`${BASE}/api/docs/${doc.id}`, { method: 'DELETE', headers: { cookie: editeur } })
  assert.equal(suppr.status, 200)
  assert.equal(uploads.octetsDocument(doc.id), 0)
  assert.equal(existsSync(join(process.env.DATA_DIR, 'uploads', doc.id)), false)
  assert.equal((await fetch(`${BASE}${src}`, { headers: { cookie: editeur } })).status, 404)
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
