// Le propriétaire d'un document (17/09/2026).
//
// Ce n'est pas un rôle de plus mais un **porteur** : on est propriétaire
// *et* éditeur, jamais propriétaire *au lieu d'*éditeur. Ces tests valent
// pour les quatre règles qui le définissent, et pour le repli qui le déduit
// des documents antérieurs au champ — le plus fragile des deux, parce qu'il
// repose sur une convention (`createDoc` inscrit le créateur comme premier
// éditeur) plutôt que sur une donnée.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18797
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-owner-'))
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
const storage = () => new Storage(process.env.DATA_DIR)

async function creerDoc(c, titre = 'Doc') {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: c },
    body: JSON.stringify({ title: titre }),
  })
  return res.json()
}

/** Donne un accès accepté à `email`, sans passer par l'envoi de mail. */
function ajouter(docId, email, role) {
  const s = storage()
  s.inviteEmail(docId, email, role, 'proprio@example.com')
  s.acceptInvitation(docId, email)
}

// ------------------------------------------------------------ l'attribution

test('le créateur porte le document', async () => {
  const doc = await creerDoc(cookie('proprio@example.com'))
  assert.equal(storage().ownerOf(doc.id), 'proprio@example.com')

  const vue = await (
    await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie: cookie('proprio@example.com') } })
  ).json()
  assert.equal(vue.owner, 'proprio@example.com')
  assert.equal(vue.jeSuisProprietaire, true)
})

test('un document antérieur au champ retrouve son propriétaire', () => {
  // Le repli : pas de `owner`, deux éditeurs, le plus ancien `grantedAt`
  // désigne le créateur. C'est ce qui permet de poser le champ sans script
  // de migration.
  const chemin = join(process.env.DATA_DIR, 'docs.json')
  const registre = JSON.parse(readFileSync(chemin, 'utf8'))
  registre.ancien = {
    title: 'Avant le champ',
    createdAt: 1000,
    updatedAt: 2000,
    access: [
      { email: 'second@example.com', role: 'editeur', grantedAt: 5000 },
      { email: 'premier@example.com', role: 'editeur', grantedAt: 1000 },
      { email: 'corr@example.com', role: 'correcteur', grantedAt: 100 },
    ],
  }
  // Un document « ouvert », sans liste d'accès : personne ne le porte.
  registre.ouvert = { title: 'Ouvert', createdAt: 1, updatedAt: 1 }
  writeFileSync(chemin, JSON.stringify(registre, null, 2))

  const s = storage()
  // Le correcteur a le grantedAt le plus ancien : il ne doit pas l'emporter.
  assert.equal(s.ownerOf('ancien'), 'premier@example.com')
  assert.equal(s.ownerOf('ouvert'), null)
})

// ----------------------------------------------------------------- suppression

test('seul le propriétaire supprime ; les autres quittent', async () => {
  const proprio = cookie('proprio@example.com')
  const doc = await creerDoc(proprio)
  ajouter(doc.id, 'autre@example.com', 'editeur')
  const autre = cookie('autre@example.com')

  // Un éditeur invité ne supprime pas, alors qu'il a canManageDocument.
  const refus = await fetch(`${BASE}/api/docs/${doc.id}`, { method: 'DELETE', headers: { cookie: autre } })
  assert.equal(refus.status, 403)
  assert.ok(storage().getDoc(doc.id), 'le document a été supprimé par un non-propriétaire')

  // Il peut en revanche s'en retirer lui-même.
  const quitte = await fetch(`${BASE}/api/docs/${doc.id}/access/moi`, { method: 'DELETE', headers: { cookie: autre } })
  assert.equal(quitte.status, 200)
  assert.equal(storage().roleFor(doc.id, 'autre@example.com'), null)
  assert.ok(storage().getDoc(doc.id), 'quitter a supprimé le document')

  // Le propriétaire, lui, supprime.
  const ok = await fetch(`${BASE}/api/docs/${doc.id}`, { method: 'DELETE', headers: { cookie: proprio } })
  assert.equal(ok.status, 200)
  assert.equal(storage().getDoc(doc.id), null)
})

test('le propriétaire ne peut ni quitter son document ni en être retiré', async () => {
  const proprio = cookie('proprio@example.com')
  const doc = await creerDoc(proprio)
  ajouter(doc.id, 'autre@example.com', 'editeur')

  const partir = await fetch(`${BASE}/api/docs/${doc.id}/access/moi`, { method: 'DELETE', headers: { cookie: proprio } })
  assert.equal(partir.status, 403)
  assert.equal(storage().roleFor(doc.id, 'proprio@example.com'), 'editeur')

  // Et un autre éditeur ne peut pas le révoquer : le document deviendrait
  // orphelin — plus de porteur, plus personne pour le supprimer.
  const revoque = await fetch(
    `${BASE}/api/docs/${doc.id}/access/${encodeURIComponent('proprio@example.com')}`,
    { method: 'DELETE', headers: { cookie: cookie('autre@example.com') } }
  )
  assert.equal(revoque.status, 403)
  assert.equal(storage().ownerOf(doc.id), 'proprio@example.com')
})

// ------------------------------------------------------------------- le rôle

test('le propriétaire reste éditeur, même si on le rétrograde', async () => {
  const doc = await creerDoc(cookie('proprio@example.com'))
  const s = storage()
  assert.equal(s.grantAccess(doc.id, 'proprio@example.com', 'correcteur'), null)
  assert.equal(s.roleFor(doc.id, 'proprio@example.com'), 'editeur')
})

// -------------------------------------------------------------- le transfert

test('le transfert est exclusif, et la cible doit déjà avoir accès', async () => {
  const proprio = cookie('proprio@example.com')
  const doc = await creerDoc(proprio)
  ajouter(doc.id, 'corr@example.com', 'correcteur')

  const transferer = (c, email) =>
    fetch(`${BASE}/api/docs/${doc.id}/owner`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: c },
      body: JSON.stringify({ email }),
    })

  // Quelqu'un d'autre ne transfère pas.
  assert.equal((await transferer(cookie('corr@example.com'), 'corr@example.com')).status, 403)
  // Une adresse sans accès non plus : on ne confie pas un document à
  // quelqu'un qui ne l'a jamais ouvert.
  assert.equal((await transferer(proprio, 'inconnu@example.com')).status, 400)

  // La cible devient propriétaire **et** éditrice.
  const ok = await transferer(proprio, 'corr@example.com')
  assert.equal(ok.status, 200)
  const s = storage()
  assert.equal(s.ownerOf(doc.id), 'corr@example.com')
  assert.equal(s.roleFor(doc.id, 'corr@example.com'), 'editeur')

  // L'ancien propriétaire garde son accès, et perd ses droits exclusifs.
  assert.equal(s.roleFor(doc.id, 'proprio@example.com'), 'editeur')
  assert.equal((await fetch(`${BASE}/api/docs/${doc.id}`, { method: 'DELETE', headers: { cookie: proprio } })).status, 403)
  // Il peut maintenant partir — il ne porte plus rien.
  assert.equal(
    (await fetch(`${BASE}/api/docs/${doc.id}/access/moi`, { method: 'DELETE', headers: { cookie: proprio } })).status,
    200
  )
})

test('la liste des accès désigne le propriétaire', async () => {
  const proprio = cookie('proprio@example.com')
  const doc = await creerDoc(proprio)
  ajouter(doc.id, 'autre@example.com', 'correcteur')
  const { access } = await (
    await fetch(`${BASE}/api/docs/${doc.id}/access`, { headers: { cookie: proprio } })
  ).json()
  const marques = access.filter((a) => a.proprietaire)
  assert.equal(marques.length, 1, 'un seul propriétaire par document')
  assert.equal(marques[0].email, 'proprio@example.com')
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
