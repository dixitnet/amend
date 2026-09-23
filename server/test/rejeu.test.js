// La fin du rejeu initial (23/09/2026).
//
// À chaque connexion, le serveur rejoue le journal opération par opération.
// Rien, jusqu'ici, ne disait au client quand c'était fini — si bien qu'on
// voyait le document se recomposer sous ses yeux en ouvrant la page. Le
// message `{type:'synced'}` clôt le rejeu, et c'est lui qui lève le masque
// de chargement côté client.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '../storage.js'
import { Rooms } from '../rooms.js'

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

test('le rejeu se termine par un message « synced »', async () => {
  const storage = new Storage(dataDir)
  const rooms = new Rooms(storage)
  const id = 'doc-rejeu'
  for (let i = 0; i < 4; i++) storage.appendUpdate(id, Buffer.from([1, 2, 3, i]))
  await storage.flushAll()

  const conn = fausseConnexion()
  rooms.join(id, conn, 'moi@example.com')

  assert.equal(conn.recu.length, 5, 'quatre opérations, puis la fin du rejeu')
  assert.ok(conn.recu.slice(0, 4).every((m) => m.binaire), 'les opérations sont binaires')
  const dernier = conn.recu[4]
  assert.equal(dernier.binaire, false, 'la fin du rejeu est un message de contrôle, en texte')
  assert.deepEqual(JSON.parse(dernier.donnees), { type: 'synced' })
})

test('un document vide reçoit tout de même la fin du rejeu', async () => {
  // Sinon le masque de chargement ne se lèverait jamais sur un document
  // neuf — celui qu'on vient de créer, donc le pire moment pour attendre.
  const storage = new Storage(dataDir)
  const rooms = new Rooms(storage)
  const conn = fausseConnexion()
  rooms.join('doc-neuf', conn, 'moi@example.com')

  assert.equal(conn.recu.length, 1)
  assert.deepEqual(JSON.parse(conn.recu[0].donnees), { type: 'synced' })
})

test('le message arrive après les opérations, jamais avant', async () => {
  // L'ordre est tout : annoncer la fin avant d'avoir tout envoyé
  // reviendrait à lever le masque sur un document incomplet, ce qui est
  // exactement le défaut qu'on corrige.
  const storage = new Storage(dataDir)
  const rooms = new Rooms(storage)
  const id = 'doc-ordre'
  for (let i = 0; i < 20; i++) storage.appendUpdate(id, Buffer.from([9, i]))
  await storage.flushAll()

  const conn = fausseConnexion()
  rooms.join(id, conn, 'moi@example.com')
  const indexSynced = conn.recu.findIndex((m) => !m.binaire)
  assert.equal(indexSynced, conn.recu.length - 1, 'dernier message, toujours')
  assert.equal(indexSynced, 20)
})
