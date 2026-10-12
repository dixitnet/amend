// Rattacher les commentaires d'avant à un compte (point 9, 13/10/2026) :
// le nom affiché n'est pas une identité, et la comparaison par nom disparaît
// de la règle du lecteur. Pour que personne ne perde la main sur ses propres
// anciens commentaires, le serveur leur donne un `authorId` quand il charge
// la réplique du document.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { rattacherAuteurs } from '../auteursCommentaires.js'
import { Repliques, verifierLecteur } from '../replique.js'
import { Storage } from '../storage.js'
import { idCompte } from '../users.js'
import { AUTEUR_AGENT, AUTEUR_INCONNU } from '../../shared/protocole.js'
import { commenter, repondre } from '../agentTexte.js'

const dataDir = mkdtempSync(join(tmpdir(), 'collabtext-test-auteurs-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

const MEMBRES = [
  { id: 'id-lea', nom: 'Léa' },
  { id: 'id-marc', nom: 'Marc' },
  { id: 'id-jo1', nom: 'Jo' },
  { id: 'id-jo2', nom: 'Jo' },
  { id: 'id-sans-nom', nom: null },
]

function docAvecAnciens() {
  const doc = new Y.Doc()
  const m = doc.getMap('comments')
  const ancien = (id, author, extra = {}) =>
    m.set(id, { id, author, text: 'un avis', createdAt: 1, color: '#3d5a80', ...extra })
  ancien('c-lea', 'Léa')
  ancien('c-marc', 'Marc')
  ancien('r-lea', 'Léa', { parent: 'c-marc' })
  ancien('c-jo', 'Jo')
  ancien('c-ex', 'Ancien Membre')
  ancien('c-claude', 'Claude (pour Marie)')
  m.set('c-recent', { id: 'c-recent', author: 'Léa', authorId: 'id-lea', text: 'récent', createdAt: 2 })
  return doc
}

test('chaque commentaire d’avant reçoit l’identifiant du seul membre qui porte son nom', () => {
  const doc = docAvecAnciens()
  const m = doc.getMap('comments')
  const bilan = rattacherAuteurs(doc, MEMBRES)
  assert.deepEqual(
    { attribues: bilan.attribues, agents: bilan.agents, inconnus: bilan.inconnus },
    { attribues: 3, agents: 1, inconnus: 2 }
  )
  assert.equal(m.get('c-lea').authorId, 'id-lea')
  assert.equal(m.get('c-marc').authorId, 'id-marc')
  assert.equal(m.get('r-lea').authorId, 'id-lea', 'les réponses aussi')
  assert.equal(m.get('c-claude').authorId, AUTEUR_AGENT)
  assert.equal(m.get('c-jo').authorId, AUTEUR_INCONNU, 'deux membres s’appellent Jo : on ne devine pas')
  assert.equal(m.get('c-ex').authorId, AUTEUR_INCONNU, 'le nom n’est celui d’aucun membre')
  // Le reste du commentaire ne bouge pas.
  assert.equal(m.get('c-lea').text, 'un avis')
  assert.equal(m.get('c-lea').color, '#3d5a80')
  assert.equal(m.get('c-recent').authorId, 'id-lea')
})

test('rattacher est idempotent et rend l’opération à écrire au journal', () => {
  const doc = docAvecAnciens()
  const miroir = new Y.Doc()
  Y.applyUpdate(miroir, Y.encodeStateAsUpdate(doc))
  const premier = rattacherAuteurs(doc, MEMBRES)
  assert.ok(premier.update && premier.update.length > 0)
  // L'opération suffit à reproduire le résultat ailleurs (le journal).
  Y.applyUpdate(miroir, premier.update)
  assert.equal(miroir.getMap('comments').get('c-lea').authorId, 'id-lea')
  // Une seconde passe ne trouve plus rien.
  const second = rattacherAuteurs(doc, MEMBRES)
  assert.equal(second.update, null)
  assert.deepEqual([second.attribues, second.agents, second.inconnus], [0, 0, 0])
  // Un document sans commentaire d'avant : rien.
  assert.equal(rattacherAuteurs(new Y.Doc(), MEMBRES).update, null)
})

test('le nom se compare sans tenir compte des espaces autour ni de la forme Unicode', () => {
  const doc = new Y.Doc()
  doc.getMap('comments').set('c1', { id: 'c1', author: ' Léa ', text: 'x', createdAt: 1 })
  rattacherAuteurs(doc, [{ id: 'id-lea', nom: 'Léa' }])
  assert.equal(doc.getMap('comments').get('c1').authorId, 'id-lea')
})

test('à la fin, le lecteur reconnaît ses anciens commentaires par l’identifiant — et plus par le nom', () => {
  const serveur = docAvecAnciens()
  rattacherAuteurs(serveur, MEMBRES)
  const client = new Y.Doc()
  Y.applyUpdate(client, Y.encodeStateAsUpdate(serveur))
  const avant = Y.encodeStateVector(client)
  client.getMap('comments').delete('c-lea')
  const suppression = Buffer.from(Y.encodeStateAsUpdate(client, avant))
  assert.equal(verifierLecteur(serveur, suppression, 'id-lea').ok, true, 'Léa supprime son ancien commentaire')
  assert.equal(verifierLecteur(serveur, suppression, 'id-marc').ok, false, 'pas Marc')
  assert.equal(verifierLecteur(serveur, suppression, 'id-jo1').ok, false, 'pas un homonyme')
})

test('au chargement de la réplique : rattaché, écrit au journal, relu tel quel, et ne se refait pas', async () => {
  const storage = new Storage(dataDir)
  const id = 'doc-anciens'
  const source = docAvecAnciens()
  storage.appendUpdate(id, Buffer.from(Y.encodeStateAsUpdate(source)))
  await storage.flushAll()
  let appels = 0
  const options = {
    apresChargement: (_id, doc) => {
      appels++
      return rattacherAuteurs(doc, MEMBRES).update
    },
  }
  const repliques = new Repliques(storage, options)
  const r = await repliques.obtenir(id)
  assert.equal(r.doc.getMap('comments').get('c-lea').authorId, 'id-lea')
  assert.equal(r.modifie, true)
  await storage.flushAll()
  repliques.fermer()

  // Le journal porte la correction : un chargement sans le hook la voit.
  const relu = new Repliques(storage)
  const r2 = await relu.obtenir(id)
  assert.equal(r2.doc.getMap('comments').get('c-marc').authorId, 'id-marc')
  assert.equal(r2.doc.getMap('comments').get('c-ex').authorId, AUTEUR_INCONNU)
  relu.fermer()

  // Avec le hook, rien de neuf à écrire : le journal ne grossit pas.
  const avant = storage.getHistoryMeta(id).count
  const encore = new Repliques(storage, options)
  await encore.obtenir(id)
  await storage.flushAll()
  assert.equal(storage.getHistoryMeta(id).count, avant)
  assert.equal(appels, 2)
  encore.fermer()
})

test('un hook qui plante n’empêche pas le chargement', async () => {
  const storage = new Storage(dataDir)
  const id = 'doc-hook-casse'
  storage.appendUpdate(id, Buffer.from(Y.encodeStateAsUpdate(docAvecAnciens())))
  await storage.flushAll()
  const repliques = new Repliques(storage, {
    apresChargement: () => {
      throw new Error('panne')
    },
  })
  const silencieux = console.error
  console.error = () => {}
  try {
    const r = await repliques.obtenir(id)
    assert.equal(r.doc.getMap('comments').get('c-lea').authorId, undefined)
  } finally {
    console.error = silencieux
  }
  repliques.fermer()
})

test('les commentaires et réponses écrits par un agent invité portent AUTEUR_AGENT', () => {
  const doc = new Y.Doc()
  // Un document avec un paragraphe, comme l'éditeur l'écrit.
  const frag = doc.getXmlFragment('prosemirror-content')
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText('Un texte à relire.')])
  frag.insert(0, [p])
  const agent = { name: 'Claude (pour Marie)', color: '#5f7a4a' }
  const c = commenter(doc, { bloc: 1, citation: 'texte', texte: 'Une remarque.' }, agent)
  assert.equal(c.ok, true, c.raison)
  assert.equal(doc.getMap('comments').get(c.id).authorId, AUTEUR_AGENT)
  const r = repondre(doc, { commentaire: c.id, texte: 'Et une réponse.' }, agent)
  assert.equal(r.ok, true, r.raison)
  assert.equal(doc.getMap('comments').get(r.id).authorId, AUTEUR_AGENT)
  // Aucun lecteur ne peut se faire passer pour l'agent.
  assert.equal(idCompte('claude@example.com') === AUTEUR_AGENT, false)
})
