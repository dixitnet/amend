// Back-office (voir claude/conception-backoffice.md) : la route est réservée
// aux administrateurs, ne renvoie aucun jeton, et agrège correctement les
// trois journaux d'événements.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18790
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-admin-'))
process.env.ADMIN_EMAILS = 'chef@example.com'
// `= ''` et non `delete` : `loadDotEnv` ne pose une variable que si elle est
// **absente** de l'environnement (`key in process.env`). Supprimer une clé
// la rend absente — et le .env de la machine de développement la remet
// aussitôt, avec sa vraie valeur. Un test « sans Mailgun » envoyait donc de
// vrais courriers, et un test « sans clé Anthropic » appelait l'API. La
// chaîne vide, elle, reste présente et vide. (Constaté le 17/09/2026.)
process.env.ANTHROPIC_API_KEY = ''

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { Metrics } = await import('../metrics.js')
await waitForServer()

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    ;(function attempt() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => (Date.now() > deadline ? reject(err) : setTimeout(attempt, 50)))
    })()
  })
}

const cookieFor = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]

test("le back-office est réservé aux administrateurs", async () => {
  assert.equal((await fetch(`${BASE}/api/admin/overview`)).status, 403)
  assert.equal(
    (await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: cookieFor('quidam@example.com') } })).status,
    403
  )
  assert.equal(
    (await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: cookieFor('chef@example.com') } })).status,
    200
  )
})

test("/api/auth/me dit si la personne est administratrice (le client en a besoin pour afficher l'entrée)", async () => {
  const chef = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookieFor('chef@example.com') } })).json()
  const autre = await (
    await fetch(`${BASE}/api/auth/me`, { headers: { cookie: cookieFor('quidam@example.com') } })
  ).json()
  assert.equal(chef.admin, true)
  assert.equal(autre.admin, false)
})

test('la vue agrège utilisateurs, documents et flux — et ne laisse fuir aucun jeton', async () => {
  const storage = new Storage(process.env.DATA_DIR)
  const metrics = new Metrics(process.env.DATA_DIR)

  const solo = storage.createDoc('Document solitaire', 'chef@example.com')
  const duo = storage.createDoc('Document à deux', 'chef@example.com')
  storage.grantAccess(duo.id, 'relecteur@example.com', 'correcteur')
  const { token: jetonInvitation } = storage.inviteEmail(duo.id, 'jamais-venu@example.com', 'correcteur', 'chef@example.com')

  const hier = Date.now() - 24 * 60 * 60 * 1000
  // Deux sessions qui se recouvrent sur le même document, par deux personnes
  // différentes : c'est ça, un moment collaboratif.
  metrics.log('connexions', { email: 'chef@example.com', docId: duo.id, debut: hier, dureeMs: 600000 })
  metrics.log('connexions', { email: 'relecteur@example.com', docId: duo.id, debut: hier + 60000, dureeMs: 300000 })
  // Une session isolée, qui ne doit pas compter comme collaboration.
  metrics.log('connexions', { email: 'chef@example.com', docId: solo.id, debut: hier, dureeMs: 120000 })
  metrics.log('ia', { email: 'chef@example.com', docId: duo.id, entree: 1200, sortie: 300 })
  metrics.log('mail', { type: 'invitation', ok: true })
  metrics.log('mail', { type: 'connexion', ok: false, erreur: 'Mailgun indisponible' })

  const vue = await (
    await fetch(`${BASE}/api/admin/overview`, { headers: { cookie: cookieFor('chef@example.com') } })
  ).json()

  assert.equal(vue.documents.total, 2)
  assert.equal(vue.documents.aPlusieursParticipants, 1)
  assert.equal(vue.documents.partCollaborative, 50)

  assert.equal(vue.utilisateurs.total, 3)
  assert.equal(vue.utilisateurs.enAttente, 1)
  assert.equal(vue.utilisateurs.invitationsEnAttente[0].email, 'jamais-venu@example.com')
  assert.equal(vue.utilisateurs.invitationsPar['chef@example.com'], 1)

  assert.equal(vue.flux.connexions.actifs7j, 2)
  assert.equal(vue.flux.connexions.sessions7j, 3)
  assert.equal(vue.flux.connexions.collaboration30j.moments, 1)
  assert.equal(vue.flux.connexions.collaboration30j.documents, 1)

  assert.equal(vue.flux.ia.appels30j, 1)
  assert.equal(vue.flux.ia.tokensEntree30j, 1200)
  assert.equal(vue.flux.ia.parPersonne[0].email, 'chef@example.com')

  assert.equal(vue.flux.mail.envois30j, 2)
  assert.equal(vue.flux.mail.echecs30j, 1)
  assert.match(vue.flux.mail.dernierEchec.erreur, /Mailgun/)

  // Un jeton d'invitation vaut une session au nom de la personne invitée :
  // il ne doit apparaître nulle part dans la vue d'administration.
  assert.equal(JSON.stringify(vue).includes(jetonInvitation), false)
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  // Même raison que dans access.test.js : le serveur garde la boucle
  // d'événements ouverte, et un process.exit() immédiat couperait parfois
  // avant l'impression du dernier résultat.
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
