// La règle du correcteur au niveau de la réplique (point 8, 13/10/2026),
// hors du texte : les racines Yjs qu'il a le droit de toucher et
// l'identifiant des commentaires qu'il écrit. (Le texte lui-même est vérifié
// par correcteur.test.js sur des documents fabriqués, et par
// client/test/correcteurEtanche.test.js avec le vrai éditeur.)

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { Repliques } from '../replique.js'
import { NOM_TEXTE, NOM_COMMENTAIRES, NOM_ORPHELINS } from '../../shared/protocole.js'

async function scene(mode = 'refuser') {
  const base = new Y.Doc()
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText('Un texte de base.')])
  base.getXmlFragment(NOM_TEXTE).insert(0, [p])
  const journal = [Buffer.from(Y.encodeStateAsUpdate(base))]
  const stockage = {
    journalInfo: () => ({ octets: 0 }),
    readUpdates: () => journal.map((u) => Buffer.from(u)),
    enAttente: () => [],
    compactionTrigger: 1e9,
    maxUncompactedBytes: 1e12,
  }
  const violations = []
  const serveur = new Repliques(stockage, { modeCorrecteur: () => mode, surViolation: (i) => violations.push(i) })
  await serveur.obtenir('d')
  serveur.retenir('d')
  const client = new Y.Doc()
  Y.applyUpdate(client, serveur.etat('d'))
  /** Ce que `fn` écrit dans le document du client, rendu en octets. */
  const ecrire = (fn) => {
    let octets
    const ecoute = (u) => (octets = Buffer.from(u))
    client.on('update', ecoute)
    fn(client)
    client.off('update', ecoute)
    return octets
  }
  const envoyer = (octets, id = 'aaaaaaaaaaaaaaaa') =>
    serveur.appliquerCorrecteur('d', octets, { noms: ['Camille'], idAuteur: id, email: 'c@test.local' })
  return { serveur, client, ecrire, envoyer, violations, etat: () => Buffer.from(serveur.etat('d')).toString('base64') }
}

test('une autre racine que le texte et les commentaires : refusée, réplique inchangée', async () => {
  const s = await scene()
  const avant = s.etat()
  const octets = s.ecrire((d) => d.getMap('styles').set('police', 'Comic Sans'))
  const v = s.envoyer(octets)
  assert.equal(v.ok, false)
  assert.equal(v.violation, true)
  assert.match(v.raison, /hors du texte/)
  assert.equal(s.etat(), avant)
  assert.equal(s.violations.length, 1)
})

test('une autre racine : en mode « observer », signalée mais acceptée', async () => {
  const s = await scene('observer')
  const v = s.envoyer(s.ecrire((d) => d.getMap('styles').set('police', 'x')))
  assert.equal(v.ok, true)
  assert.equal(s.violations.length, 1)
})

test('un commentaire signé de son identifiant passe, celui d’un autre ou sans signature non', async () => {
  const s = await scene()
  const MOI = 'aaaaaaaaaaaaaaaa'
  const AUTRE = 'bbbbbbbbbbbbbbbb'
  assert.equal(
    s.envoyer(
      s.ecrire((d) => d.getMap(NOM_COMMENTAIRES).set('c1', { authorId: MOI, text: 'ok' })),
      MOI
    ).ok,
    true
  )
  assert.equal(s.violations.length, 0)

  const avant = s.etat()
  const usurpe = s.ecrire((d) => d.getMap(NOM_COMMENTAIRES).set('c2', { authorId: AUTRE, text: 'je suis un autre' }))
  const v = s.envoyer(usurpe, MOI)
  assert.equal(v.ok, false)
  assert.match(v.raison, /identifiant de son auteur/)
  assert.equal(s.etat(), avant)

  const anonyme = s.ecrire((d) => d.getMap(NOM_COMMENTAIRES).set('c3', { text: 'sans signature' }))
  assert.equal(s.envoyer(anonyme, MOI).ok, false)
  assert.equal(s.violations.length, 2)
})

test('sans identifiant de compte, aucun commentaire ne passe', async () => {
  const s = await scene()
  const octets = s.ecrire((d) => d.getMap(NOM_COMMENTAIRES).set('c1', { authorId: 'aaaaaaaaaaaaaaaa', text: 'x' }))
  assert.equal(s.envoyer(octets, null).ok, false)
})

test('les orphelins sont une racine permise', async () => {
  const s = await scene()
  const v = s.envoyer(s.ecrire((d) => d.getMap(NOM_ORPHELINS).set('o1', { authorId: 'aaaaaaaaaaaaaaaa' })))
  assert.equal(v.ok, true)
})
