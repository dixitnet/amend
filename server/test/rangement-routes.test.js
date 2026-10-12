// Le rangement personnel, de bout en bout (12/10/2026) : favoris et dossiers
// sont ceux de la personne connectée, passent par la liste des documents, et
// survivent à un passage par la corbeille.

import test from 'node:test'
import assert from 'node:assert/strict'
import { lancerInstance } from '../../tools/instance-test.js'

const ALICE = 'alice@test.local'
const BOB = 'bob@test.local'

let inst
let doc
const api = (chemin, qui, opts = {}) => inst.api(chemin, { cookie: inst.cookies[qui], ...opts })
const liste = async (qui) => (await api('/api/docs', qui)).json.docs

test('démarrage : un document d’Alice, partagé à Bob', async () => {
  inst = await lancerInstance({ port: 19950, comptes: [ALICE, BOB], admin: BOB })
  const c = await api('/api/docs', ALICE, { methode: 'POST', corps: { title: 'Thèse' } })
  doc = c.json.id
  assert.equal(
    (await api(`/api/docs/${doc}/invitations`, ALICE, { methode: 'POST', corps: { email: BOB, role: 'lecteur' } }))
      .status,
    200
  )
  const courriers = await (await fetch(`${inst.fauxMailgun}/courriers`)).json()
  const jeton = /#\/invite\/([A-Za-z0-9_-]+)/.exec([...courriers].reverse().find((x) => x.to === BOB).text)[1]
  assert.equal(
    (await inst.api(`/api/invitations/${jeton}`, { methode: 'POST', cookie: inst.cookies[BOB] })).status,
    200
  )
})

test('un favori est personnel : Alice le voit, Bob non — et Bob, simple lecteur, a les siens', async () => {
  assert.equal((await api(`/api/docs/${doc}/star`, ALICE, { methode: 'PATCH', corps: { starred: true } })).status, 200)
  assert.equal((await liste(ALICE))[0].starred, true)
  assert.equal((await liste(BOB))[0].starred, false)
  assert.equal((await api(`/api/docs/${doc}`, ALICE)).json.starred, true, 'la page du document le sait aussi')
  assert.equal((await api(`/api/docs/${doc}`, BOB)).json.starred, false)
  assert.equal((await api(`/api/docs/${doc}/star`, BOB, { methode: 'PATCH', corps: { starred: true } })).status, 200)
  assert.equal((await liste(BOB))[0].starred, true)
  assert.equal((await api(`/api/docs/${doc}/star`, ALICE, { methode: 'PATCH', corps: { starred: false } })).status, 200)
  assert.equal((await liste(ALICE))[0].starred, false)
  assert.equal((await liste(BOB))[0].starred, true, 'le favori de Bob n’a pas bougé')
})

let dossier

test('créer des dossiers, y ranger un document, le retrouver dans la liste', async () => {
  const sans = await api('/api/rangement/dossiers', ALICE, { methode: 'POST', corps: { nom: '  ' } })
  assert.equal(sans.status, 400)
  const a = await api('/api/rangement/dossiers', ALICE, { methode: 'POST', corps: { nom: 'Thèse' } })
  assert.equal(a.status, 201)
  dossier = a.json.dossier.id
  const b = await api('/api/rangement/dossiers', ALICE, {
    methode: 'POST',
    corps: { nom: 'Chapitres', parent: dossier },
  })
  assert.equal(b.json.dossier.parent, dossier)
  assert.equal((await api('/api/rangement/dossiers', ALICE, { methode: 'POST', corps: { nom: 'thèse' } })).status, 409)

  const place = await api(`/api/rangement/documents/${doc}`, ALICE, { methode: 'PUT', corps: { dossier } })
  assert.equal(place.status, 200)
  assert.equal(place.json.placement[doc], dossier)
  assert.equal((await liste(ALICE))[0].dossier, dossier)
  assert.equal((await liste(BOB))[0].dossier, null, 'chez Bob, le document est à la racine')
  assert.deepEqual((await api('/api/rangement', BOB)).json.dossiers, [], 'Bob ne voit pas les dossiers d’Alice')
})

test('on ne range que ce qu’on voit', async () => {
  assert.equal(
    (await api('/api/rangement/documents/inconnu', ALICE, { methode: 'PUT', corps: { dossier } })).status,
    404
  )
  const autre = (await api('/api/docs', BOB, { methode: 'POST', corps: { title: 'À Bob' } })).json.id
  assert.equal(
    (await api(`/api/rangement/documents/${autre}`, ALICE, { methode: 'PUT', corps: { dossier } })).status,
    404
  )
  assert.equal(
    (await api('/api/rangement/dossiers/d_inconnu', ALICE, { methode: 'PATCH', corps: { nom: 'x' } })).status,
    404
  )
  assert.equal(
    (await api(`/api/rangement/dossiers/${dossier}`, BOB, { methode: 'PATCH', corps: { nom: 'x' } })).status,
    404,
    'le dossier d’Alice n’existe pas pour Bob'
  )
})

test('renommer, déplacer, puis supprimer un dossier : le document remonte', async () => {
  const r = await api(`/api/rangement/dossiers/${dossier}`, ALICE, { methode: 'PATCH', corps: { nom: 'Ma thèse' } })
  assert.equal(r.json.dossier.nom, 'Ma thèse')
  assert.equal((await api(`/api/rangement/dossiers/${dossier}`, ALICE, { methode: 'PATCH', corps: {} })).status, 400)
  const del = await api(`/api/rangement/dossiers/${dossier}`, ALICE, { methode: 'DELETE' })
  assert.equal(del.status, 200)
  assert.equal(del.json.dossiers.length, 1, 'le sous-dossier reste')
  assert.equal((await liste(ALICE))[0].dossier, null)
})

test('un document jeté puis restauré retrouve son dossier', async () => {
  const d = (await api('/api/rangement/dossiers', ALICE, { methode: 'POST', corps: { nom: 'Archives' } })).json.dossier
    .id
  await api(`/api/rangement/documents/${doc}`, ALICE, { methode: 'PUT', corps: { dossier: d } })
  await api(`/api/docs/${doc}`, ALICE, { methode: 'DELETE' })
  assert.deepEqual(await liste(ALICE), [])
  assert.equal((await api('/api/rangement', ALICE)).json.placement[doc], d, 'le placement attend dans la corbeille')
  await api(`/api/corbeille/${doc}/restauration`, ALICE, { methode: 'POST' })
  assert.equal((await liste(ALICE))[0].dossier, d)
})

test('quitter un document efface son rangement chez soi, sans toucher aux autres', async () => {
  await api(`/api/rangement/documents/${doc}`, BOB, { methode: 'PUT', corps: { dossier: null } })
  assert.equal((await api(`/api/docs/${doc}/access/moi`, BOB, { methode: 'DELETE' })).status, 200)
  assert.deepEqual(
    (await api('/api/rangement', BOB)).json.favoris,
    [],
    'son favori sur ce document a disparu de sa vue'
  )
  assert.equal((await liste(ALICE))[0].dossier !== undefined, true)
})

test('non connecté : 401', async () => {
  assert.equal((await inst.api('/api/rangement')).status, 401)
})

test.after(async () => {
  if (inst) await inst.arreter()
})
