// Embarquer un testeur (01/10/2026, server/server.js, server/modeleBienvenue.js).
// Le vrai serveur, de vraies sessions ; le courrier est remplacé (remplacerEnvoi)
// pour qu'on puisse voir ce qui partirait, et le faire échouer.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18805
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-embarquer-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.ADMIN_EMAILS = 'admin@example.com'
process.env.APP_BASE_URL = `http://localhost:${PORT}`

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { remplacerEnvoi } = await import('../mailgun.js')
const Y = await import('yjs')
await attendre()

function attendre() {
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 5000
    ;(function essai() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => (Date.now() > limite ? reject(err) : setTimeout(essai, 50)))
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const ADMIN = cookie('admin@example.com')

const envoyes = []
remplacerEnvoi((m) => {
  envoyes.push(m)
})

function embarquer(email, galette = ADMIN) {
  return fetch(`${BASE}/api/admin/embarquer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(galette ? { cookie: galette } : {}) },
    body: JSON.stringify({ email }),
  })
}

const inscrire = (email) =>
  fetch(`${BASE}/api/waitlist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })

const liste = async () =>
  (await fetch(`${BASE}/api/admin/waitlist`, { headers: { cookie: ADMIN } })).json()

test('réservé aux administrateurs, adresse valide exigée', async () => {
  assert.equal((await embarquer('x@example.com', null)).status, 403)
  assert.equal((await embarquer('x@example.com', cookie('quidam@example.com'))).status, 403)
  assert.equal((await embarquer('pas-une-adresse')).status, 400)
  assert.equal(envoyes.length, 0)
})

test('embarquer : un document type dont l’invité est propriétaire, et un courrier avec son lien', async () => {
  await inscrire('beta@example.com')
  await inscrire('autre@example.com')
  assert.equal((await liste()).enAttente, 2)

  const res = await embarquer('beta@example.com')
  assert.equal(res.status, 200)
  const r = await res.json()
  assert.equal(r.titre, 'Bienvenue sur amend.ink')
  assert.equal(r.surListe, true)

  // Le courrier : à la bonne personne, avec un lien d'invitation.
  assert.equal(envoyes.length, 1)
  assert.equal(envoyes[0].to, 'beta@example.com')
  assert.match(envoyes[0].subject, /Bienvenue/)
  const lien = envoyes[0].text.match(/http:\/\/localhost:\d+\/#\/invite\/([A-Za-z0-9_-]+)/)
  assert.ok(lien, envoyes[0].text)
  assert.match(envoyes[0].html, /Ouvrir mon document/)

  // L'invité est propriétaire et éditeur, « en attente » jusqu'à son lien.
  const storage = new Storage(DATA_DIR)
  assert.equal(storage.ownerOf(r.docId), 'beta@example.com')
  const acces = storage.getAccess(r.docId)
  assert.equal(acces.length, 1, 'l’administrateur n’y est pas inscrit')
  assert.equal(acces[0].email, 'beta@example.com')
  assert.equal(acces[0].role, 'editeur')
  assert.equal(acces[0].status, 'invite')
  assert.equal(acces[0].invitedBy, 'admin@example.com')

  // Son lien l'ouvre ; son document figure dans sa liste, pas dans celle de l'administrateur.
  const accepte = await fetch(`${BASE}/api/invitations/${lien[1]}`, { method: 'POST' })
  assert.equal(accepte.status, 200)
  const sesDocs = await (await fetch(`${BASE}/api/docs`, { headers: { cookie: cookie('beta@example.com') } })).json()
  const sien = (sesDocs.docs || sesDocs).find((d) => d.id === r.docId)
  assert.ok(sien)
  assert.equal(sien.jeSuisProprietaire, true)
  const sesDocsAdmin = await (await fetch(`${BASE}/api/docs`, { headers: { cookie: ADMIN } })).json()
  assert.ok(!(sesDocsAdmin.docs || sesDocsAdmin).some((d) => d.id === r.docId))

  // La liste d'attente : embarquée, plus comptée.
  const apres = await liste()
  assert.equal(apres.enAttente, 1)
  const ligne = apres.file.find((l) => l.email === 'beta@example.com')
  assert.equal(ligne.statut, 'embarque')
  assert.equal(ligne.embarque.docId, r.docId)
  assert.equal(apres.file.find((l) => l.email === 'autre@example.com').statut, 'attente')
  // Le fichier brut n'a rien perdu.
  assert.ok(apres.inscrits.some((i) => i.email === 'beta@example.com'))

  // Le contenu : écrit pour de bon, sans aucune marque de suivi.
  let vu = ''
  for (let essai = 0; essai < 50; essai++) {
    const y = new Y.Doc()
    for (const op of new Storage(DATA_DIR).readUpdates(r.docId)) Y.applyUpdate(y, op)
    vu = y.getXmlFragment('prosemirror-content').toString()
    if (/Quatre choses/.test(vu)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.match(vu, /Bienvenue sur amend\.ink/)
  assert.match(vu, /Quatre choses à essayer/)
  assert.match(vu, /Un retour \?/)
  assert.ok(!/insertion|deletion/.test(vu), 'ce n’est pas une proposition de quelqu’un')
})

test('une adresse qui a déjà accès n’est pas embarquée (409), et n’attend plus', async () => {
  assert.equal((await embarquer('beta@example.com')).status, 409)
  assert.equal(envoyes.length, 1, 'aucun courrier de plus')

  // Invitée ailleurs par la voie ordinaire : elle a accès, elle ne compte plus.
  await inscrire('deja@example.com')
  const storage = new Storage(DATA_DIR)
  const doc = storage.createDoc('Autre', 'admin@example.com')
  storage.inviteEmail(doc.id, 'deja@example.com', 'correcteur', 'admin@example.com')
  const etat = await liste()
  assert.equal(etat.file.find((l) => l.email === 'deja@example.com').statut, 'acces')
  assert.equal(etat.enAttente, 1)
  assert.equal((await embarquer('deja@example.com')).status, 409)
})

test('un courrier qui échoue ne laisse rien : ni document, ni embarquement', async () => {
  const avant = new Storage(DATA_DIR).allDocs().length
  remplacerEnvoi(() => {
    throw new Error('Mailgun en panne')
  })
  const res = await embarquer('autre@example.com')
  assert.equal(res.status, 502)
  assert.match((await res.json()).error, /rien n'a été créé/)
  assert.equal(new Storage(DATA_DIR).allDocs().length, avant)
  assert.equal(new Storage(DATA_DIR).emailHasAnyAccess('autre@example.com'), false)
  // Et aucun journal orphelin ne réapparaît après coup (l'écriture différée
  // d'un document supprimé).
  await new Promise((r) => setTimeout(r, 800))
  const { readdirSync } = await import('node:fs')
  const journaux = readdirSync(DATA_DIR).filter((f) => f.endsWith('.log'))
  assert.equal(journaux.length, new Storage(DATA_DIR).allDocs().length, 'un journal par document, pas un de plus')
  const etat = await liste()
  assert.equal(etat.file.find((l) => l.email === 'autre@example.com').statut, 'attente')

  // Le service revenu, on peut recommencer.
  remplacerEnvoi((m) => {
    envoyes.push(m)
  })
  assert.equal((await embarquer('autre@example.com')).status, 200)
})

test('on peut aussi embarquer une adresse qui n’est pas dans la liste', async () => {
  const res = await embarquer('Libre@Example.com')
  assert.equal(res.status, 200)
  const r = await res.json()
  assert.equal(r.email, 'libre@example.com')
  assert.equal(r.surListe, false)
  assert.equal(new Storage(DATA_DIR).ownerOf(r.docId), 'libre@example.com')
})

test('le journal dit qu’il y a eu embarquement, jamais à qui', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const chemin = join(DATA_DIR, 'events-embarquements.jsonl')
  assert.ok(existsSync(chemin))
  assert.ok(!/@/.test(readFileSync(chemin, 'utf8')))
})

test('fin : nettoyage', () => {
  try {
    rmSync(DATA_DIR, { recursive: true, force: true })
  } catch {}
  setTimeout(() => process.exit(0), 200)
})
