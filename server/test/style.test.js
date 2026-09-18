// Tests du modèle de feuille de style (16/09/2026) : le modèle déclaratif
// partagé (shared/style.js), la migration depuis l'ancien format, et la
// descente au niveau du document.
//
// Ce qui est vérifié n'est pas « est-ce que ça enregistre » mais les trois
// promesses du modèle : un réglage ajouté plus tard n'efface rien, un
// document hérite tant qu'il n'a pas choisi, et le style par défaut de
// l'instance ne reflue pas sur un document qui a fait ses choix.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18792
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-style-'))
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
const { Storage } = await import('../storage.js')
const { styleParDefaut, fusionner, reduire, migrer, BLOCS, PROPRIETES, VERSION_STYLE, NIVEAUX_TITRE } =
  await import('../../shared/style.js')
await waitForServer()

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    ;(function attempt() {
      fetch(`${BASE}/api/docs`).then(() => resolve()).catch((err) => {
        if (Date.now() > deadline) reject(err)
        else setTimeout(attempt, 50)
      })
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]

async function creerDoc(c) {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify({ title: 'Doc' }),
  })
  return res.json()
}

// ---------------------------------------------------------------- le modèle

test('chaque niveau de titre a ses propres réglages, et le corps un retrait', () => {
  const d = styleParDefaut()
  // Trois niveaux depuis le 18/09/2026 — voir NIVEAUX_TITRE.
  assert.deepEqual(Object.keys(d.blocs), ['body', 'quote', 'h1', 'h2', 'h3'])
  assert.equal(NIVEAUX_TITRE, 3)
  // Chaque bloc porte toutes les propriétés déclarées — c'est ce qui permet
  // au formulaire et aux exports de ne connaître aucun nom en dur.
  for (const b of BLOCS) {
    for (const p of PROPRIETES) {
      assert.ok(p.id in d.blocs[b.id], `${b.id} n'a pas ${p.id}`)
    }
  }
  assert.equal(d.blocs.body.firstLineIndent, 0)
  assert.equal(d.blocs.h1.size, 24)
  assert.equal(d.blocs.h3.size, 17)
  assert.ok(!('h4' in d.blocs), 'aucun quatrième niveau ne doit subsister')
})

test('l’ancien format remonte : un bloc « heading » devient trois', () => {
  const ancien = {
    page: { size: 'A5', marginTop: 10 },
    body: { font: 'serif', size: 10, align: 'justify', lineHeight: 1.5, spaceAfter: 6 },
    heading: { font: 'serif', bold: true, spaceBefore: 20, spaceAfter: 6, sizes: [30, 22, 18, 14, 12] },
  }
  const f = fusionner(ancien)
  assert.equal(f.page.size, 'A5')
  assert.equal(f.blocs.body.align, 'justify')
  assert.equal(f.blocs.h1.size, 30)
  assert.equal(f.blocs.h3.size, 18)
  // Les deux tailles en trop de l'ancien format sont simplement oubliées.
  assert.ok(!('h4' in f.blocs))
  assert.equal(f.blocs.h3.spaceBefore, 20)
  // La citation suivait la règle du corps de texte : elle en hérite.
  assert.equal(f.blocs.quote.font, 'serif')
  // Et un réglage qui n'existait pas dans l'ancien format prend sa valeur
  // par défaut plutôt que de manquer — c'est ce qui rend les ajouts
  // ultérieurs indolores.
  assert.equal(f.blocs.body.firstLineIndent, 0)
  assert.equal(migrer(ancien).version, VERSION_STYLE)
})

test('on n’enregistre que les écarts, jamais la feuille entière', () => {
  assert.deepEqual(reduire(styleParDefaut()), { version: VERSION_STYLE })
  const modifie = fusionner({ blocs: { h1: { align: 'center' } }, page: { size: 'A5' } })
  assert.deepEqual(reduire(modifie), {
    version: VERSION_STYLE,
    page: { size: 'A5' },
    blocs: { h1: { align: 'center' } },
  })
})

test('les couches s’empilent de la plus générale à la plus précise', () => {
  const instance = { blocs: { body: { font: 'serif', size: 10 } } }
  const document = { blocs: { body: { size: 12 }, h1: { align: 'center' } } }
  const f = fusionner(instance, document)
  assert.equal(f.blocs.body.font, 'serif') // vient de l'instance
  assert.equal(f.blocs.body.size, 12) // le document l'emporte
  assert.equal(f.blocs.h1.align, 'center')
})

// ------------------------------------------------------- au fil des routes

test('un document hérite du style par défaut tant qu’il n’a pas le sien', async () => {
  const admin = cookie('admin@example.com')
  await fetch(`${BASE}/api/style`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify(fusionner({ blocs: { body: { font: 'serif' } } })),
  })
  const doc = await creerDoc(admin)
  const vue = await (await fetch(`${BASE}/api/docs/${doc.id}/style`, { headers: { cookie: admin } })).json()
  assert.equal(vue.propre, false)
  assert.equal(vue.style.blocs.body.font, 'serif')
})

test('dès qu’un éditeur y touche, le document ne suit plus l’instance', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin)

  const pose = await fetch(`${BASE}/api/docs/${doc.id}/style`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify(fusionner({ blocs: { h1: { size: 40, align: 'center' } } })),
  })
  assert.equal(pose.status, 200)
  const apres = await pose.json()
  assert.equal(apres.propre, true)
  assert.equal(apres.style.blocs.h1.size, 40)

  // On change le style par défaut de l'instance : le document ne bouge pas.
  await fetch(`${BASE}/api/style`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify(fusionner({ blocs: { h1: { size: 99 } } })),
  })
  const vue = await (await fetch(`${BASE}/api/docs/${doc.id}/style`, { headers: { cookie: admin } })).json()
  assert.equal(vue.style.blocs.h1.size, 40, "le style d'instance a reflué sur un document qui avait choisi")

  // DELETE le remet à l'héritage.
  const remis = await (await fetch(`${BASE}/api/docs/${doc.id}/style`, { method: 'DELETE', headers: { cookie: admin } })).json()
  assert.equal(remis.propre, false)
  assert.equal(remis.style.blocs.h1.size, 99)
})

test('la mise en page se lit avec l’accès, ne se change qu’en éditeur', async () => {
  const editeur = cookie('ed@example.com')
  const doc = await creerDoc(editeur)
  const storage = new Storage(process.env.DATA_DIR)
  storage.inviteEmail(doc.id, 'corr@example.com', 'correcteur', 'ed@example.com')
  storage.acceptInvitation(doc.id, 'corr@example.com')
  const correcteur = cookie('corr@example.com')

  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}/style`, { headers: { cookie: correcteur } })).status, 200)

  const refus = await fetch(`${BASE}/api/docs/${doc.id}/style`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: correcteur },
    body: JSON.stringify(fusionner({ blocs: { h1: { size: 40 } } })),
  })
  assert.equal(refus.status, 403)
  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}/style`, { method: 'DELETE', headers: { cookie: correcteur } })).status, 403)

  // Sans aucune session : pas d'accès du tout.
  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}/style`)).status, 403)
})

test('le fichier écrit reste petit : les écarts, pas la feuille entière', async () => {
  const admin = cookie('admin@example.com')
  const doc = await creerDoc(admin)
  await fetch(`${BASE}/api/docs/${doc.id}/style`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: admin },
    body: JSON.stringify(fusionner({ blocs: { h2: { italic: true } } })),
  })
  const brut = JSON.parse(readFileSync(join(process.env.DATA_DIR, `${doc.id}.style.json`), 'utf8'))
  assert.deepEqual(brut, { version: VERSION_STYLE, blocs: { h2: { italic: true } } })
  assert.ok(existsSync(join(process.env.DATA_DIR, `${doc.id}.style.json`)))
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
