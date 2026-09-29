// La réplique du serveur (server/replique.js, 29/09/2026) : le serveur
// tient un Y.Doc par document ouvert. Ce qu'on vérifie ici :
//
//   - un lecteur ne passe que ses propres commentaires ; le texte, et les
//     commentaires des autres, sont refusés **avant** d'être persistés ou
//     relayés, et le client reçoit `{type:'refuse'}` ;
//   - la réplique vit tant qu'une connexion la retient, et se libère après
//     le délai une fois la salle vide ;
//   - le compactage remplace le journal par un instantané, en enregistrant
//     une version d'abord ;
//   - un gros journal se rejoue dans un worker, avec le même résultat.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { Storage } from '../storage.js'
import { Rooms } from '../rooms.js'
import { Repliques, verifierLecteur, racinesTouchees } from '../replique.js'
import { Versions } from '../versions.js'
import { capabilities } from '../roles.js'

const dataDir = mkdtempSync(join(tmpdir(), 'collabtext-test-replique-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

/** Une fausse connexion qui sait recevoir (`emettre`) et note ce qu'on lui envoie. */
function fausseConnexion() {
  const recu = []
  const handlers = {}
  return {
    recu,
    send(donnees, options) {
      recu.push({ binaire: !!(options && options.binary), donnees })
    },
    on(evt, cb) {
      handlers[evt] = cb
    },
    emettre(donnees, binaire = true) {
      handlers.message(donnees, binaire)
    },
    fermer() {
      handlers.close && handlers.close()
    },
    controles() {
      return recu.filter((m) => !m.binaire).map((m) => JSON.parse(m.donnees.toString()))
    },
  }
}

/** L'opération qui fait passer `doc` de son état d'avant `f()` à celui d'après. */
function operation(doc, f) {
  const avant = Y.encodeStateVector(doc)
  f()
  return Buffer.from(Y.encodeStateAsUpdate(doc, avant))
}

function ajouterTexte(doc, texte) {
  return operation(doc, () => {
    const frag = doc.getXmlFragment('prosemirror-content')
    const p = new Y.XmlElement('paragraph')
    p.insert(0, [new Y.XmlText(texte)])
    frag.insert(frag.length, [p])
  })
}

function commenter(doc, id, author, text = 'un avis') {
  return operation(doc, () => doc.getMap('comments').set(id, { id, author, text, createdAt: 1 }))
}

const lecteur = (nom) => ({ capabilities: capabilities('lecteur'), nom })
const editeur = (nom) => ({ capabilities: capabilities('editeur'), nom })

// --- verifierLecteur, au niveau des structures Yjs -------------------------

test('verifierLecteur : le texte est refusé, un commentaire à son nom accepté, celui d’un autre refusé', () => {
  const serveur = new Y.Doc()
  const client = new Y.Doc()
  Y.applyUpdate(serveur, ajouterTexte(client, 'Bonjour.'))

  // (Sur une copie : un client dont une opération est refusée a divergé et
  // recharge — on ne continue pas avec lui.)
  const divergent = new Y.Doc()
  Y.applyUpdate(divergent, Y.encodeStateAsUpdate(client))
  const texte = ajouterTexte(divergent, 'Ajout interdit.')
  assert.equal(verifierLecteur(serveur, texte, 'Léa').ok, false)
  assert.match(verifierLecteur(serveur, texte, 'Léa').raison, /texte/)

  const sien = commenter(client, 'c1', 'Léa')
  assert.equal(verifierLecteur(serveur, sien, 'Léa').ok, true)
  Y.applyUpdate(serveur, sien)

  const autre = commenter(client, 'c2', 'Marc')
  assert.equal(verifierLecteur(serveur, autre, 'Léa').ok, false)

  // Supprimer le commentaire d'un autre : refusé aussi (le contenu supprimé
  // porte son nom).
  Y.applyUpdate(serveur, autre)
  const divergent2 = new Y.Doc()
  Y.applyUpdate(divergent2, Y.encodeStateAsUpdate(client))
  const suppression = operation(divergent2, () => divergent2.getMap('comments').delete('c2'))
  assert.equal(verifierLecteur(serveur, suppression, 'Léa').ok, false)
  // Supprimer le sien : accepté.
  const suppressionSien = operation(client, () => client.getMap('comments').delete('c1'))
  assert.equal(verifierLecteur(serveur, suppressionSien, 'Léa').ok, true)
})

test('racinesTouchees ne compte pas ce que le serveur a déjà', () => {
  const serveur = new Y.Doc()
  const client = new Y.Doc()
  const op = ajouterTexte(client, 'Déjà vu.')
  Y.applyUpdate(serveur, op)
  const touche = racinesTouchees(serveur, op)
  assert.equal(touche.inserees.size, 0)
  assert.equal(touche.supprimees.size, 0)
})

// --- Dans une salle ----------------------------------------------------------

test('dans la salle : un lecteur reçoit « refuse » pour le texte, et rien n’est ni persisté ni relayé', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage)
  const rooms = new Rooms(storage, repliques)
  const id = 'doc-lecteur'
  const auteur = new Y.Doc()
  storage.appendUpdate(id, ajouterTexte(auteur, 'Texte de départ.'))
  await storage.flushAll()

  const connEditeur = fausseConnexion()
  const connLecteur = fausseConnexion()
  await rooms.join(id, connEditeur, 'Mona', editeur('Mona')).chargement
  await rooms.join(id, connLecteur, 'Léa', lecteur('Léa')).chargement
  const avantEditeur = connEditeur.recu.length
  const journalAvant = storage.getHistoryMeta(id).count

  // Le lecteur reconstitue le document et tente une frappe.
  const docLecteur = new Y.Doc()
  Y.applyUpdate(docLecteur, connLecteur.recu[0].donnees)
  connLecteur.emettre(ajouterTexte(docLecteur, 'Frappe interdite.'))

  const refus = connLecteur.controles().filter((m) => m.type === 'refuse')
  assert.equal(refus.length, 1)
  assert.match(refus[0].raison, /texte/)
  assert.equal(connEditeur.recu.length, avantEditeur, 'rien relayé à l’éditeur')
  assert.equal(storage.getHistoryMeta(id).count, journalAvant, 'rien dans le journal')
  assert.equal(repliques.repliques.get(id).doc.getXmlFragment('prosemirror-content').length, 1, 'la réplique n’a pas bougé')

  // Après un refus, le client a divergé (ses horloges Yjs ont avancé sans
  // le serveur) : ce qu'il envoie ensuite s'appuie sur du refusé, et le
  // serveur ne peut pas l'intégrer. Il est refusé aussi, avec la raison qui
  // dit de recharger — c'est ce que fait le client.
  connLecteur.emettre(commenter(docLecteur, 'c-perdu', 'Léa'))
  assert.equal(connLecteur.controles().filter((m) => m.type === 'refuse').length, 2)
  assert.match(connLecteur.controles().at(-1).raison, /hors séquence/)
  assert.equal(storage.getHistoryMeta(id).count, journalAvant, 'rien dans le journal')
  assert.equal(connEditeur.recu.length, avantEditeur, 'rien relayé')

  // Le client rechargé (aligné sur le serveur) commente à son nom : relayé
  // et persisté.
  const docRecharge = new Y.Doc()
  Y.applyUpdate(docRecharge, repliques.etat(id))
  connLecteur.emettre(commenter(docRecharge, 'c-lea', 'Léa'))
  assert.equal(connLecteur.controles().filter((m) => m.type === 'refuse').length, 2, 'pas de nouveau refus')
  assert.equal(connEditeur.recu.length, avantEditeur + 1, 'relayé à l’éditeur')
  assert.equal(repliques.repliques.get(id).doc.getMap('comments').size, 1)

  // Un commentaire au nom d'un autre : refusé.
  connLecteur.emettre(commenter(docRecharge, 'c-faux', 'Mona'))
  assert.equal(connLecteur.controles().filter((m) => m.type === 'refuse').length, 3)
  assert.equal(repliques.repliques.get(id).doc.getMap('comments').size, 1)

  // L'éditeur, lui, écrit librement.
  const docEditeur = new Y.Doc()
  Y.applyUpdate(docEditeur, connEditeur.recu[0].donnees)
  connEditeur.emettre(ajouterTexte(docEditeur, 'Suite.'))
  assert.equal(repliques.repliques.get(id).doc.getXmlFragment('prosemirror-content').length, 2)
  repliques.fermer()
})

test('la réplique est retenue par les connexions, puis libérée après le délai', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage, { delaiLiberationMs: 30 })
  const rooms = new Rooms(storage, repliques)
  const id = 'doc-vie'
  const c1 = fausseConnexion()
  const c2 = fausseConnexion()
  await rooms.join(id, c1, 'a').chargement
  await rooms.join(id, c2, 'b').chargement
  assert.equal(repliques.repliques.get(id).refs, 2)
  c1.fermer()
  assert.equal(repliques.repliques.get(id).refs, 1)
  await new Promise((r) => setTimeout(r, 60))
  assert.ok(repliques.repliques.has(id), 'toujours là tant que quelqu’un est connecté')
  c2.fermer()
  assert.equal(repliques.repliques.get(id).refs, 0)
  assert.ok(repliques.repliques.has(id), 'pas libérée tout de suite')
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(repliques.repliques.has(id), false, 'libérée après le délai')
  repliques.fermer()
})

test('une reconnexion pendant le délai garde la réplique', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage, { delaiLiberationMs: 40 })
  const rooms = new Rooms(storage, repliques)
  const id = 'doc-retour'
  const c1 = fausseConnexion()
  await rooms.join(id, c1, 'a').chargement
  const doc = repliques.repliques.get(id).doc
  c1.fermer()
  const c2 = fausseConnexion()
  await rooms.join(id, c2, 'a').chargement
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(repliques.repliques.get(id).doc, doc, 'le même Y.Doc, pas rechargé')
  repliques.fermer()
})

test('le compactage remplace le journal par un instantané et enregistre une version', async () => {
  const storage = new Storage(dataDir, { maxUncompactedOps: 10 })
  const versions = new Versions(dataDir)
  const repliques = new Repliques(storage, { versions, delaiCompactageMs: 10 })
  const id = 'doc-compact'
  const source = new Y.Doc()
  for (let i = 0; i < 8; i++) storage.appendUpdate(id, ajouterTexte(source, `Paragraphe ${i}.`))
  await storage.flushAll()
  assert.equal(storage.getHistoryMeta(id).count, 8)

  await repliques.obtenir(id)
  const resultat = await repliques.compacter(id)
  assert.deepEqual(resultat, { count: 1 })
  assert.equal(storage.getHistoryMeta(id).count, 1)
  assert.equal(versions.lister(id).length, 1, 'une version enregistrée avant d’effacer')
  assert.equal(versions.lister(id)[0].origine, 'compactage')

  // Le journal compacté redonne exactement le document.
  const relu = new Y.Doc()
  for (const op of storage.readUpdates(id)) Y.applyUpdate(relu, op)
  assert.equal(relu.getXmlFragment('prosemirror-content').length, 8)
  assert.equal(relu.getXmlFragment('prosemirror-content').toString(), source.getXmlFragment('prosemirror-content').toString())

  // Et le compactage automatique : au-delà du seuil (15), il se déclenche
  // tout seul, peu après la dernière opération.
  for (let i = 0; i < 16; i++) repliques.appliquer(id, ajouterTexte(source, `Encore ${i}.`))
  for (const op of []) storage.appendUpdate(id, op)
  await new Promise((r) => setTimeout(r, 60))
  const r = repliques.repliques.get(id)
  if (r.enCompactage) await r.enCompactage
  assert.equal(r.ops, 1, 'compteur remis à zéro')
  assert.equal(storage.getHistoryMeta(id).count, 1)
  repliques.fermer()
})

test('un gros journal se rejoue dans un worker, avec le même résultat', async () => {
  const storage = new Storage(dataDir)
  // Seuil ridicule pour forcer le passage par le worker.
  const repliques = new Repliques(storage, { seuilWorkerOctets: 100 })
  const id = 'doc-worker'
  const source = new Y.Doc()
  for (let i = 0; i < 30; i++) storage.appendUpdate(id, ajouterTexte(source, `Ligne ${i}, assez longue pour peser.`))
  await storage.flushAll()
  assert.ok(statSync(storage._logPath(id)).size > 100)

  const r = await repliques.obtenir(id)
  assert.equal(r.doc.getXmlFragment('prosemirror-content').length, 30)
  assert.equal(r.doc.getXmlFragment('prosemirror-content').toString(), source.getXmlFragment('prosemirror-content').toString())
  repliques.fermer()
})

test('la borne sur le nombre de répliques libère les salles vides', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage, { max: 2, delaiLiberationMs: 60000 })
  const rooms = new Rooms(storage, repliques)
  const conns = []
  for (const id of ['p1', 'p2', 'p3']) {
    const c = fausseConnexion()
    await rooms.join(id, c, 'x').chargement
    conns.push(c)
  }
  assert.equal(repliques.repliques.size, 3, 'tant que tout le monde est là, on garde tout')
  conns[0].fermer()
  const c4 = fausseConnexion()
  await rooms.join('p4', c4, 'x').chargement
  assert.equal(repliques.repliques.has('p1'), false, 'la salle vide est partie au profit de la nouvelle')
  assert.equal(repliques.repliques.size, 3)
  repliques.fermer()
})
