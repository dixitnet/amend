// Ce qu'un courrier d'invitation est devenu, lu dans les journaux du
// fournisseur d'envoi (22/10/2026, server/mailgun.js → etatDuCourrier). Un faux
// Mailgun local répond à la place de l'API : jamais de réseau.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

process.env.MAILGUN_API_KEY = 'cle-de-test'
process.env.MAILGUN_DOMAIN = 'test.local'
const { etatDuCourrier } = await import('../mailgun.js')

let evenements = []
let statut = 200
const requetes = []
const faux = createServer((req, res) => {
  requetes.push({ url: req.url, auth: req.headers.authorization })
  res.writeHead(statut, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ items: evenements }))
})
await new Promise((r) => faux.listen(0, '127.0.0.1', r))
process.env.MAILGUN_API_URL = `http://127.0.0.1:${faux.address().port}`
test.after(() => faux.close())

const depuis = Date.UTC(2026, 9, 22, 10, 0, 0)
const ts = (secondes) => depuis / 1000 + secondes
const evt = (event, secondes, extra = {}, sujet = 'Invitation à collaborer sur « Doc »') => ({
  event,
  timestamp: ts(secondes),
  recipient: 'a@example.com',
  message: { headers: { subject: sujet } },
  ...extra,
})
const etat = (items, code = 200) => {
  evenements = items
  statut = code
  return etatDuCourrier({ to: 'a@example.com', depuis })
}

test('remis : le serveur de la personne a accepté le courrier', async () => {
  assert.deepEqual(await etat([evt('delivered', 3), evt('accepted', 1)]), { etat: 'remis' })
})

test('refusé pour de bon : la raison du serveur distant est donnée', async () => {
  const r = await etat([
    evt('failed', 5, { severity: 'permanent', 'delivery-status': { code: 550, message: '5.1.1 user unknown' } }),
    evt('accepted', 1),
  ])
  assert.deepEqual(r, { etat: 'refuse', detail: '5.1.1 user unknown' })
  const rejete = await etat([evt('rejected', 2, { reject: { reason: 'Recipient on suppression list' } })])
  assert.deepEqual(rejete, { etat: 'refuse', detail: 'Recipient on suppression list' })
})

test('différé ou seulement mis en file : en cours', async () => {
  const differe = await etat([
    evt('failed', 4, { severity: 'temporary', 'delivery-status': { message: '4.2.0 mailbox busy' } }),
    evt('accepted', 1),
  ])
  assert.deepEqual(differe, { etat: 'en_cours', detail: '4.2.0 mailbox busy' })
  assert.deepEqual(await etat([evt('accepted', 1)]), { etat: 'en_cours' })
})

test('seul le courrier d’invitation compte, et seulement depuis son envoi', async () => {
  // Un lien de connexion remis ne dit rien d’une invitation qui n’est pas partie.
  const autre = await etat([evt('delivered', 3, {}, 'Votre lien de connexion à amend.ink')])
  assert.deepEqual(autre, { etat: 'inconnu' })
  // L’événement d’une invitation précédente (avant celle-ci) est ignoré.
  const ancien = await etat([evt('delivered', -3600)])
  assert.deepEqual(ancien, { etat: 'inconnu' })
  assert.deepEqual(await etat([]), { etat: 'inconnu' })
})

test('la requête : adresse filtrée, plus récent d’abord (begin > end), clé en Basic, rien d’autre', async () => {
  requetes.length = 0
  await etat([])
  const { url, auth } = requetes[0]
  const q = new URL(url, 'http://x')
  assert.equal(q.pathname, '/v3/test.local/events')
  assert.equal(q.searchParams.get('recipient'), 'a@example.com')
  assert.equal(q.searchParams.get('ascending'), 'no')
  assert.ok(Number(q.searchParams.get('begin')) > Number(q.searchParams.get('end')))
  assert.equal(auth, `Basic ${Buffer.from('api:cle-de-test').toString('base64')}`)
})

test('erreur du fournisseur, réponse illisible ou non configuré : inconnu, sans lever', async () => {
  assert.deepEqual(await etat([evt('delivered', 3)], 500), { etat: 'inconnu' })
  assert.deepEqual(await etat([evt('delivered', 3)], 401), { etat: 'inconnu' })
  const cle = process.env.MAILGUN_API_KEY
  process.env.MAILGUN_API_KEY = ''
  try {
    requetes.length = 0
    assert.deepEqual(await etatDuCourrier({ to: 'a@example.com', depuis }), { etat: 'inconnu' })
    assert.equal(requetes.length, 0, 'aucune requête sans clé')
  } finally {
    process.env.MAILGUN_API_KEY = cle
  }
})
