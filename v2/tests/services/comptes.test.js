// T3 : le dépôt des comptes et du partage (adaptateur PostgreSQL), contre une
// base réelle. Sans PostgreSQL, le fichier se déclare sauté, avec la raison.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { ouvrirCommentaires } from '../../adaptateurs/postgres/index.js'
import { ouvrirBase } from '../../adaptateurs/postgres/base.js'
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
  assert.equal(await depot.modifierAcces(id, e.id, null), null)
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

t3('plusieurs écritures en une transaction : une erreur en route ne laisse rien d’écrit', async () => {
  const a = await depot.personneOuNouvelle(adresse('alix'))
  const b = await depot.personneOuNouvelle(adresse('bea'))
  const garde = `t3-tx-${randomUUID().slice(0, 8)}`
  const efface = `t3-tx-${randomUUID().slice(0, 8)}`
  await depot.creerDocument(garde, a.id)
  await depot.creerDocument(efface, a.id)
  // Une suite qui échoue au milieu : un accès donné (méthode qui ouvre sa
  // propre transaction), un document effacé, puis une erreur.
  await assert.rejects(
    depot.enTransaction(async (c) => {
      assert.equal(await c.modifierAcces(garde, b.id, 'proprietaire'), null)
      await c.supprimerDocument(efface)
      assert.equal(await c.document(efface), null, 'vu effacé dans la transaction')
      throw Object.assign(new Error('arrêt'), { code: 'essai' })
    }),
    { code: 'essai' },
  )
  assert.equal(await depot.acces(garde, b.id), null, 'l’accès donné est défait')
  assert.ok(await depot.document(efface), 'le document effacé est revenu')
  // La même suite menée au bout est écrite en entier.
  await depot.enTransaction(async (c) => {
    await c.modifierAcces(garde, b.id, 'proprietaire')
    await c.supprimerDocument(efface)
  })
  assert.equal(await depot.acces(garde, b.id), 'proprietaire')
  assert.equal(await depot.document(efface), null)
  await depot.supprimerDocument(garde)
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

t3('deux retraits simultanés de propriétaires : il en reste toujours un', async () => {
  const a = await depot.personneOuNouvelle(adresse('a'))
  const b = await depot.personneOuNouvelle(adresse('b'))
  const id = randomUUID()
  await depot.creerDocument(id, a.id)
  await depot.donnerAcces(id, b.id, 'proprietaire')
  const r = await Promise.all([depot.modifierAcces(id, a.id, null), depot.modifierAcces(id, b.id, null)])
  assert.deepEqual(r.sort(), ['dernier-proprietaire', null].sort())
  assert.equal(await depot.proprietaires(id), 1)
})

t3('donnerAcces : même garde que modifierAcces, le dernier propriétaire ne peut être rétrogradé', async () => {
  const p = await depot.personneOuNouvelle(adresse('paule'))
  const id = randomUUID()
  await depot.creerDocument(id, p.id, 'Essai')
  assert.equal(await depot.donnerAcces(id, p.id, 'lecteur', p.id), 'dernier-proprietaire')
  assert.deepEqual(await depot.rolesDe(id, p.id), ['proprietaire'], 'rien n’a changé')
  const e = await depot.personneOuNouvelle(adresse('edith'))
  assert.equal(await depot.donnerAcces(id, e.id, 'editeur', p.id), null)
  assert.equal(await depot.acces(id, e.id), 'editeur')
  assert.equal(await depot.donnerAcces(id, p.id, 'editeur', e.id), 'dernier-proprietaire')
  assert.equal(await depot.donnerAcces(id, e.id, 'proprietaire', p.id), null)
  assert.equal(await depot.donnerAcces(id, p.id, 'editeur', e.id), null, 'un autre propriétaire existe')
})

t3('une seule réserve de connexions par adresse : fermer un dépôt ne ferme pas l’autre', async () => {
  const a = ouvrirBase(POSTGRES)
  const b = ouvrirBase(POSTGRES)
  assert.equal(a.sql, b.sql, 'la même réserve')
  await a.rendre()
  await a.rendre() // sans effet la seconde fois
  assert.equal((await b.sql`select 1 as un`)[0].un, 1, 'encore ouverte')
  await b.rendre()

  const comptes = await ouvrirComptes(POSTGRES)
  const commentaires = await ouvrirCommentaires(POSTGRES)
  const p = await comptes.personneOuNouvelle(adresse('reserve'))
  assert.equal((await comptes.personne(p.id)).id, p.id)
  assert.deepEqual(await commentaires.fils(`t3-reserve-${randomUUID()}`), [])
  await commentaires.fermer()
  assert.equal((await comptes.personne(p.id)).id, p.id, 'les comptes marchent encore')
  await comptes.fermer()
})

t3('purge : jetons périmés depuis plus de 24 h et invitations antérieures à la date donnée', async () => {
  const c = adresse('purge')
  const p = await depot.personneOuNouvelle(adresse('paule'))
  const id = randomUUID()
  await depot.creerDocument(id, p.id, 'Essai')
  const equipe = await depot.creerEquipe('Équipe purge', p.id)
  await depot.creerJeton(c, null, -48 * 3600_000) // expiré depuis 48 h
  await depot.creerJeton(c, null, -3600_000) // expiré depuis 1 h : gardé
  const utilise = await depot.creerJeton(c, null, 3600_000)
  await depot.consommerJeton(utilise)
  const frais = await depot.creerJeton(c, null, 3600_000) // valable : gardé
  const vieuxCourriel = adresse('invite')
  await depot.inviter(id, vieuxCourriel, 'lecteur', p.id)
  await depot.inviter(id, adresse('recent'), 'lecteur', p.id)
  await depot.inviterMembre(equipe, vieuxCourriel, 'membre', p.id)
  // Vieillit les données de ce test seulement (cette base peut servir à d'autres).
  const { sql, rendre } = ouvrirBase(POSTGRES)
  try {
    await sql`update amend.jetons_connexion set utilise_le = now() - interval '2 days'
              where courriel = ${c} and utilise_le is not null`
    await sql`update amend.invitations set cree_le = now() - interval '10 days' where document = ${id} and courriel = ${vieuxCourriel}`
    await sql`update amend.invitations_equipe set cree_le = now() - interval '10 days' where equipe = ${equipe}`
    assert.equal(await depot.jetonsRecents(c, 3600_000), 4)
    const n = await depot.purgerPerimes(Date.now(), { invitationsAvant: Date.now() - 5 * 86400_000 })
    assert.ok(n.jetons >= 2 && n.invitations >= 2, `effacés : ${JSON.stringify(n)}`)
    assert.equal(await depot.jetonsRecents(c, 3600_000), 2, 'restent : expiré depuis 1 h, et le valable')
    assert.deepEqual(await depot.consommerJeton(frais), { courriel: c, document: null })
    assert.equal((await depot.invitationsDuDocument(id)).length, 1, 'l’invitation récente reste')
    assert.deepEqual(await depot.invitationsDeLEquipe(equipe), [])
  } finally {
    await rendre()
  }
})
