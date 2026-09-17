// « Publier sur le web » (17/09/2026) — la première surface d'Amend
// lisible sans session, donc celle qui mérite le plus de tests.
//
// Ce qui est vérifié ici tient en trois questions : est-ce que quelque
// chose d'arbitraire peut entrer dans une page publique, est-ce que la
// page révèle ce qu'elle ne doit pas, et est-ce que le droit de publier
// est bien celui qu'annonce le .env.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18801
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-pub-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'
process.env.PUBLICATION_WEB = 'admins'
// Sans ça, le .env de la machine de développement impose son APP_BASE_URL
// (port 8787) et les adresses publiques renvoyées pointeraient vers le
// serveur de développement, pas vers celui du test.
process.env.APP_BASE_URL = `http://localhost:${PORT}`

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { rendre, peutPublier } = await import('../publication.js')
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

async function creerDoc(c, titre = 'Doc') {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify({ title: titre }),
  })
  return res.json()
}

const publier = (c, id, corps) =>
  fetch(`${BASE}/api/docs/${id}/publication`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify(corps),
  })

const texte = (blocs) => [{ type: 'paragraphe', contenu: [{ type: 'texte', texte: blocs, marques: [] }] }]

// ============================================== ce qui peut entrer dans la page

test('rien d’arbitraire ne traverse : ni balise, ni type inconnu', () => {
  const html = rendre({
    titre: '<script>alert(1)</script>',
    blocs: [
      { type: 'paragraphe', contenu: [{ type: 'texte', texte: '<img onerror=alert(1)>', marques: [] }] },
      // Un type que le serveur ne connaît pas ne produit rien — c'est ce
      // qui rend le modèle réellement fermé.
      { type: 'html', html: '<script>alert(2)</script>' },
      { type: 'paragraphe', contenu: [{ type: 'texte', texte: 'ok', marques: ['strong', 'inventee'] }] },
    ],
  })
  assert.ok(!html.includes('<script>'), 'une balise script a traversé')
  // Le texte échappé contient encore le *mot* « onerror » — c'est normal et
  // sans danger : ce qui compte est qu'il ne soit pas devenu une balise.
  assert.ok(!/<img[^>]*onerror/i.test(html), 'un attribut d’évènement a traversé')
  assert.ok(html.includes('&lt;img onerror'), 'le texte doit être échappé, pas supprimé')
  assert.ok(html.includes('&lt;script&gt;'), 'le titre doit être échappé, pas supprimé')
  assert.ok(html.includes('<strong>ok</strong>'), 'les marques prévues doivent passer')
  assert.ok(!html.includes('inventee'))
})

test('les marques de suivi ne figurent pas sur une page publiée', () => {
  // Le client ne les envoie pas ; le serveur ne saurait pas les rendre non
  // plus. Double fond volontaire : personne n'a à lire les ratures de
  // l'auteur sur une page publique.
  const html = rendre({
    titre: 'T',
    blocs: [{ type: 'paragraphe', contenu: [{ type: 'texte', texte: 'texte', marques: ['deletion', 'insertion'] }] }],
  })
  assert.ok(!/<(del|ins|s)>/.test(html))
  assert.ok(html.includes('texte'))
})

test('une image ne peut désigner qu’un fichier du document', () => {
  const html = rendre({
    titre: 'T',
    blocs: [
      { type: 'image', nom: '../../../etc/passwd' },
      { type: 'image', nom: 'https://ailleurs.example/pixel.png' },
      { type: 'image', nom: 'abcdefgh12345678.png' },
    ],
  })
  assert.ok(!html.includes('passwd'))
  assert.ok(!html.includes('ailleurs.example'))
  assert.ok(html.includes('src="images/abcdefgh12345678.png"'))
})

test('la page ne charge rien de l’extérieur et demande à ne pas être indexée', () => {
  const html = rendre({ titre: 'T', blocs: texte('bonjour') })
  assert.ok(!/<script/i.test(html), 'aucun script dans une page publiée')
  assert.ok(!/https?:\/\//.test(html.replace(/<html lang="fr">/, '')), 'aucune ressource extérieure')
  assert.ok(html.includes('name="robots" content="noindex"'))
})

// ============================================================ le droit de publier

test('la portée du .env décide, et un correcteur ne publie jamais', () => {
  process.env.PUBLICATION_WEB = 'admins'
  assert.equal(peutPublier({ admin: true }), true)
  assert.equal(peutPublier({ admin: false, proprietaire: true, role: 'editeur' }), false)

  process.env.PUBLICATION_WEB = 'proprietaires'
  assert.equal(peutPublier({ admin: false, proprietaire: true, role: 'editeur' }), true)
  assert.equal(peutPublier({ admin: false, proprietaire: false, role: 'editeur' }), false)

  process.env.PUBLICATION_WEB = 'editeurs'
  assert.equal(peutPublier({ admin: false, proprietaire: false, role: 'editeur' }), true)
  assert.equal(peutPublier({ admin: false, proprietaire: false, role: 'correcteur' }), false)

  // Une valeur inconnue retombe sur la plus restrictive, jamais l'inverse.
  process.env.PUBLICATION_WEB = 'tout-le-monde'
  assert.equal(peutPublier({ admin: false, proprietaire: true, role: 'editeur' }), false)
  process.env.PUBLICATION_WEB = 'admins'
})

test('en phase de test, seul un administrateur publie', async () => {
  const proprio = cookie('proprio@example.com')
  const doc = await creerDoc(proprio)
  assert.equal((await publier(proprio, doc.id, { titre: 'X', blocs: texte('a') })).status, 403)

  const storage = new Storage(process.env.DATA_DIR)
  storage.inviteEmail(doc.id, 'admin@example.com', 'editeur', 'proprio@example.com')
  storage.acceptInvitation(doc.id, 'admin@example.com')
  assert.equal((await publier(cookie('admin@example.com'), doc.id, { titre: 'X', blocs: texte('a') })).status, 200)
})

test('sans accès au document, on ne voit même pas son état de publication', async () => {
  const doc = await creerDoc(cookie('proprio@example.com'))
  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}/publication`)).status, 403)
  const res = await fetch(`${BASE}/api/docs/${doc.id}/publication`, { headers: { cookie: cookie('quidam@example.com') } })
  assert.equal(res.status, 403)
})

// ================================================== la page, une fois publiée

test('la page se lit sans session, et son adresse ne dit pas le document', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Mon document')
  const r = await (await publier(admin, doc.id, { titre: 'Mon document', blocs: texte('Bonjour le web') })).json()

  assert.ok(r.url.includes('/p/'))
  assert.ok(!r.url.includes(doc.id), 'l’adresse publique ne doit pas révéler l’identifiant du document')

  // Sans le moindre cookie.
  const page = await fetch(r.url)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.ok(page.headers.get('content-security-policy').includes("default-src 'none'"))
  const html = await page.text()
  assert.ok(html.includes('Bonjour le web'))
  assert.ok(html.includes('Mon document'))
})

test('republier garde la même adresse', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Doc')
  const un = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('version 1') })).json()
  const deux = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('version 2') })).json()
  assert.equal(deux.url, un.url, 'un lien déjà envoyé ne doit pas cesser de marcher')
  assert.ok((await (await fetch(un.url)).text()).includes('version 2'))
})

test('retirer la page la fait disparaître pour de bon', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin, 'Doc')
  const r = await (await publier(admin, doc.id, { titre: 'Doc', blocs: texte('éphémère') })).json()
  assert.equal((await fetch(r.url)).status, 200)

  const retrait = await fetch(`${BASE}/api/docs/${doc.id}/publication`, { method: 'DELETE', headers: { cookie: admin } })
  assert.equal(retrait.status, 200)
  assert.equal((await fetch(r.url)).status, 404)
})

test('une adresse de publication inventée ne révèle rien', async () => {
  const res = await fetch(`${BASE}/p/aaaaaaaaaaaaaaaa`)
  assert.equal(res.status, 404)
  const html = await res.text()
  assert.ok(!html.includes('/api/'))
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
