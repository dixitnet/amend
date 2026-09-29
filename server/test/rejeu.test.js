// La fin de l'envoi initial (23/09/2026, réécrit le 29/09/2026).
//
// Jusqu'au 29/09, le serveur rejouait le journal opération par opération à
// chaque connexion, et rien ne disait au client quand c'était fini — on
// voyait le document se recomposer sous ses yeux. Le message
// `{type:'synced'}` clôt l'envoi, et c'est lui qui lève le masque de
// chargement côté client.
//
// Depuis la réplique (server/replique.js), le serveur envoie **un seul**
// état fusionné, puis `synced` avec son vecteur d'état : le client sait
// alors exactement ce qui manque au serveur et n'envoie que ça.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { Storage } from '../storage.js'
import { Rooms } from '../rooms.js'
import { Repliques } from '../replique.js'

const dataDir = mkdtempSync(join(tmpdir(), 'collabtext-test-rejeu-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

/** Une fausse connexion : elle note ce qu'on lui envoie, dans l'ordre. */
function fausseConnexion() {
  const recu = []
  return {
    recu,
    send(donnees, options) {
      recu.push({ binaire: !!(options && options.binary), donnees })
    },
    on() {},
  }
}

/** Une vraie opération Yjs : `texte` ajouté au bout du texte partagé. */
function operation(doc, texte) {
  const avant = Y.encodeStateVector(doc)
  doc.getText('t').insert(doc.getText('t').length, texte)
  return Buffer.from(Y.encodeStateAsUpdate(doc, avant))
}

function texteRecu(conn) {
  const doc = new Y.Doc()
  for (const m of conn.recu) if (m.binaire) Y.applyUpdate(doc, m.donnees)
  return doc.getText('t').toString()
}

function environnement() {
  const storage = new Storage(dataDir)
  const repliques = new Repliques(storage)
  const rooms = new Rooms(storage, repliques)
  return { storage, repliques, rooms }
}

test('l’envoi initial se termine par un message « synced » portant le vecteur du serveur', async () => {
  const { storage, repliques, rooms } = environnement()
  const id = 'doc-rejeu'
  const source = new Y.Doc()
  for (const mot of ['un ', 'deux ', 'trois ', 'quatre']) storage.appendUpdate(id, operation(source, mot))
  await storage.flushAll()

  const conn = fausseConnexion()
  await rooms.join(id, conn, 'moi@example.com').chargement

  assert.equal(conn.recu.length, 2, 'un seul état fusionné, puis la fin de l’envoi')
  assert.ok(conn.recu[0].binaire, 'l’état est binaire')
  assert.equal(texteRecu(conn), 'un deux trois quatre')
  const dernier = conn.recu[1]
  assert.equal(dernier.binaire, false, 'la fin de l’envoi est un message de contrôle, en texte')
  const msg = JSON.parse(dernier.donnees)
  assert.equal(msg.type, 'synced')
  assert.deepEqual([...Buffer.from(msg.sv, 'base64')], [...Y.encodeStateVector(source)], 'le vecteur d’état du serveur')
  repliques.fermer()
})

test('un document vide reçoit tout de même la fin de l’envoi', async () => {
  // Sinon le masque de chargement ne se lèverait jamais sur un document
  // neuf — celui qu'on vient de créer, donc le pire moment pour attendre.
  const { repliques, rooms } = environnement()
  const conn = fausseConnexion()
  await rooms.join('doc-neuf', conn, 'moi@example.com').chargement

  assert.equal(conn.recu.length, 1, 'pas d’état vide, juste la fin')
  assert.equal(JSON.parse(conn.recu[0].donnees).type, 'synced')
  repliques.fermer()
})

test('le message arrive après l’état, jamais avant', async () => {
  // L'ordre est tout : annoncer la fin avant d'avoir tout envoyé
  // reviendrait à lever le masque sur un document incomplet, ce qui est
  // exactement le défaut qu'on corrige.
  const { storage, repliques, rooms } = environnement()
  const id = 'doc-ordre'
  const source = new Y.Doc()
  for (let i = 0; i < 20; i++) storage.appendUpdate(id, operation(source, `${i} `))
  await storage.flushAll()

  const conn = fausseConnexion()
  await rooms.join(id, conn, 'moi@example.com').chargement
  const indexSynced = conn.recu.findIndex((m) => !m.binaire)
  assert.equal(indexSynced, conn.recu.length - 1, 'dernier message, toujours')
  assert.equal(texteRecu(conn), source.getText('t').toString())
  repliques.fermer()
})

test('un client qui annonce son vecteur d’état ne reçoit que la différence', async () => {
  const { storage, repliques, rooms } = environnement()
  const id = 'doc-diff'
  const source = new Y.Doc()
  storage.appendUpdate(id, operation(source, 'déjà là. '))
  const etatClient = Y.encodeStateAsUpdate(source) // ce que le client a
  storage.appendUpdate(id, operation(source, 'nouveau.'))
  await storage.flushAll()

  const client = new Y.Doc()
  Y.applyUpdate(client, etatClient)
  const conn = fausseConnexion()
  await rooms.join(id, conn, 'moi@example.com', null, { vecteur: Buffer.from(Y.encodeStateVector(client)) }).chargement
  assert.equal(conn.recu.length, 2)
  assert.ok(conn.recu[0].donnees.length < Y.encodeStateAsUpdate(source).length, 'moins que l’état complet')
  Y.applyUpdate(client, conn.recu[0].donnees)
  assert.equal(client.getText('t').toString(), 'déjà là. nouveau.')
  repliques.fermer()
})
