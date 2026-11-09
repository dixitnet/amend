// T3 : le dépôt des comptes et du partage (adaptateur PostgreSQL), contre une
// base réelle. Sans PostgreSQL, le fichier se déclare sauté, avec la raison.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { courrierAvecLien, creerCourrier } from '../../adaptateurs/courrier/index.js'

let raisonSaut = null
let depot
const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })
before(async () => {
  try {
    preparerServices()
  } catch (e) {
    raisonSaut = `services indisponibles : ${e.message.slice(0, 120)}`
    return
  }
  if (!(await joignable(5432))) {
    raisonSaut = 'PostgreSQL injoignable'
    return
  }
  depot = await ouvrirComptes(POSTGRES)
})
after(async () => depot?.fermer())
const t3 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))
const adresse = (n) => `${n}-${randomUUID().slice(0, 8)}@exemple.fr`

t3('personnes : une par adresse ; nom ; noms d’une liste', async () => {
  const a = adresse('alice')
  const p1 = await depot.personneOuNouvelle(a)
  const p2 = await depot.personneOuNouvelle(a)
  assert.equal(p1.id, p2.id)
  await depot.definirNom(p1.id, 'Alice')
  assert.equal((await depot.personne(p1.id)).nom, 'Alice')
  assert.deepEqual(
    (await depot.noms([p1.id, 'pas-un-id', randomUUID()])).map((p) => p.nom),
    ['Alice'],
  )
  assert.equal(await depot.personne('pas-un-id'), null)
})

t3('document : le créateur en est propriétaire ; accès personne, retrait ; suppression qui emporte tout', async () => {
  const p = await depot.personneOuNouvelle(adresse('paule'))
  const e = await depot.personneOuNouvelle(adresse('edith'))
  const id = randomUUID()
  await depot.creerDocument(id, p.id, 'Essai')
  assert.deepEqual(await depot.rolesDe(id, p.id), ['proprietaire'])
  assert.equal(await depot.proprietaires(id), 1)
  await depot.donnerAcces(id, e.id, 'editeur')
  await depot.donnerAcces(id, e.id, 'proprietaire')
  assert.equal(await depot.proprietaires(id), 2)
  assert.deepEqual(
    (await depot.accesDuDocument(id)).map((a) => a.role),
    ['proprietaire', 'proprietaire'],
  )
  await depot.retirerAcces(id, e.id)
  assert.deepEqual(await depot.rolesDe(id, e.id), [])
  await depot.inviter(id, adresse('x'), 'lecteur', p.id)
  await depot.supprimerDocument(id)
  assert.equal(await depot.document(id), null)
  assert.deepEqual(await depot.accesDuDocument(id), [])
  assert.deepEqual(await depot.invitationsDuDocument(id), [])
})

t3('accès par lien : seulement si la personne y est passée et tant que le lien est ouvert', async () => {
  const p = await depot.personneOuNouvelle(adresse('paule'))
  const l = await depot.personneOuNouvelle(adresse('lea'))
  const id = randomUUID()
  await depot.creerDocument(id, p.id)
  await depot.definirRoleLien(id, 'correcteur')
  assert.deepEqual(await depot.rolesDe(id, l.id), [], 'pas encore passée par le lien')
  await depot.noterPassageParLien(id, l.id)
  assert.deepEqual(await depot.rolesDe(id, l.id), ['correcteur'])
  assert.ok((await depot.documentsDe(l.id)).some((d) => d.id === id))
  await depot.definirRoleLien(id, null)
  assert.deepEqual(await depot.rolesDe(id, l.id), [], 'lien fermé')
  assert.ok(!(await depot.documentsDe(l.id)).some((d) => d.id === id))
})

t3('invitations : une par adresse et document, renouvelée ; retirée', async () => {
  const p = await depot.personneOuNouvelle(adresse('paule'))
  const id = randomUUID()
  await depot.creerDocument(id, p.id)
  const c = adresse('carla')
  await depot.inviter(id, c, 'lecteur', p.id)
  await depot.inviter(id, c, 'correcteur', p.id)
  assert.deepEqual(
    (await depot.invitationsDe(c)).map((i) => i.role),
    ['correcteur'],
  )
  await depot.retirerInvitation(id, c)
  assert.deepEqual(await depot.invitationsDe(c), [])
})

t3('jetons de connexion : à usage unique, expirés refusés, gardés par empreinte', async () => {
  const c = adresse('carla')
  const j = await depot.creerJeton(c, null, 60_000)
  assert.deepEqual(await depot.consommerJeton(j), { courriel: c, document: null })
  assert.equal(await depot.consommerJeton(j), null, 'déjà utilisé')
  const vieux = await depot.creerJeton(c, null, -1)
  assert.equal(await depot.consommerJeton(vieux), null, 'expiré')
  for (const x of ['', 'x', null, 'a'.repeat(200)]) assert.equal(await depot.consommerJeton(x), null)
  assert.equal(await depot.jetonsRecents(c, 60_000), 2)
})

t3('sessions : « déconnecter partout » avance la date de validité', async () => {
  const p = await depot.personneOuNouvelle(adresse('paule'))
  assert.equal(await depot.sessionsValidesDepuis(p.id), 0)
  await depot.revoquerSessions(p.id)
  assert.ok((await depot.sessionsValidesDepuis(p.id)) > Date.now() - 60_000)
})

test('courrier : un seul lien, texte échappé ; sans clé, gardé en mémoire', async () => {
  const m = courrierAvecLien({
    intro: 'Bonjour <Alice>',
    libelleLien: 'Ouvrir',
    lien: 'https://a.fr/?j=1&k=2',
    copier: 'Copier :',
    apres: 'Fin',
  })
  assert.equal((m.html.match(/<a /g) || []).length, 1)
  assert.match(m.html, /Bonjour &lt;Alice&gt;/)
  assert.match(m.html, /j=1&amp;k=2/)
  assert.match(m.texte, /https:\/\/a\.fr\/\?j=1&k=2/)
  const courrier = creerCourrier({ expediteur: 'amend.ink <x@y.fr>' })
  await courrier.envoyer({ a: 'z@y.fr', sujet: 'S', texte: 'T', html: 'H' })
  assert.equal(courrier.envoyes.length, 1)
})
