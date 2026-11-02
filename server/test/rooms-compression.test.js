// État initial compressé sur la WebSocket (server/rooms.js, message `etat-z`,
// 02/11/2026) : seulement si le client l'a demandé (`?z=1`) et au-delà du
// seuil ; l'annonce précède immédiatement la trame ; le contenu décompressé
// est exactement l'état du document.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import * as Y from 'yjs'
import { Storage } from '../storage.js'
import { Rooms, SEUIL_COMPRESSION_OCTETS } from '../rooms.js'
import { Repliques } from '../replique.js'

const dataDir = mkdtempSync(join(tmpdir(), 'amend-test-rooms-z-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

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
  }
}

/** Un document dont l'état fait `signes` caractères de texte, déposé par une première connexion. */
async function docAvecTexte(rooms, id, signes) {
  const doc = new Y.Doc()
  const para = new Y.XmlElement('paragraph')
  doc.getXmlFragment('prosemirror-content').insert(0, [para])
  const phrase = 'Le texte de la ville se réécrit sur lui-même, rue après rue. '
  para.insert(0, [new Y.XmlText(phrase.repeat(Math.ceil(signes / phrase.length)).slice(0, signes))])
  const auteur = fausseConnexion()
  await rooms.join(id, auteur, 'auteur').chargement
  auteur.emettre(Buffer.from(Y.encodeStateAsUpdate(doc)))
  return doc
}

function texteDe(etat) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, etat)
  return doc.getXmlFragment('prosemirror-content').toString()
}

test('client qui accepte la compression, gros document : `etat-z` puis la trame compressée', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage)
  const rooms = new Rooms(storage, repliques)
  const source = await docAvecTexte(rooms, 'doc-z', 200_000)
  const c = fausseConnexion()
  await rooms.join('doc-z', c, 'lecteur', null, { compression: true }).chargement
  assert.equal(c.recu[0].binaire, false)
  const annonce = JSON.parse(c.recu[0].donnees)
  assert.equal(annonce.type, 'etat-z')
  assert.equal(c.recu[1].binaire, true, 'la trame suit immédiatement l’annonce')
  const etat = inflateRawSync(c.recu[1].donnees)
  assert.equal(etat.length, annonce.octets)
  assert.ok(c.recu[1].donnees.length < etat.length / 3, 'nettement plus petit')
  assert.equal(texteDe(etat), source.getXmlFragment('prosemirror-content').toString())
  assert.equal(JSON.parse(c.recu[2].donnees).type, 'synced')
  repliques.fermer()
})

test('client qui ne la demande pas (ancien client) : état en clair, comme avant', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage)
  const rooms = new Rooms(storage, repliques)
  const source = await docAvecTexte(rooms, 'doc-clair', 200_000)
  const c = fausseConnexion()
  await rooms.join('doc-clair', c, 'lecteur').chargement
  assert.equal(c.recu[0].binaire, true)
  assert.equal(texteDe(c.recu[0].donnees), source.getXmlFragment('prosemirror-content').toString())
  assert.equal(JSON.parse(c.recu[1].donnees).type, 'synced')
  repliques.fermer()
})

test('petit document : en clair même si le client accepte la compression', async () => {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage)
  const rooms = new Rooms(storage, repliques)
  await docAvecTexte(rooms, 'doc-petit', 200)
  const c = fausseConnexion()
  await rooms.join('doc-petit', c, 'lecteur', null, { compression: true }).chargement
  assert.ok(c.recu[0].donnees.length < SEUIL_COMPRESSION_OCTETS)
  assert.equal(c.recu[0].binaire, true)
  repliques.fermer()
})
