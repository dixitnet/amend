// `updatedAt` n'est pas réécrit à chaque flush (point 40, storage.js
// _toucherEnDiffere) : une rafale de flush fait une écriture du registre,
// pas une par flush, et l'arrêt applique ce qui était reporté.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '../storage.js'

const dataDir = mkdtempSync(join(tmpdir(), 'amend-touch-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

test('une rafale de flush n’écrit le registre qu’une fois, et flushAll applique le report', async () => {
  const storage = new Storage(dataDir)
  const doc = storage.createDoc('Rafale', 'moi@example.com')
  let appels = 0
  const vrai = storage.touchDoc.bind(storage)
  storage.touchDoc = (id) => {
    appels++
    return vrai(id)
  }
  const avant = storage.getDoc(doc.id).updatedAt
  for (let i = 0; i < 5; i++) {
    storage.appendUpdate(doc.id, Buffer.from([1, 2, 3, i]))
    storage.journal._flush(doc.id)
    await Promise.all([...storage.journal._flushChain.values()])
  }
  assert.equal(appels, 0, 'cinq flush : l’écriture de updatedAt est reportée')
  await storage.flushAll()
  assert.equal(appels, 1, 'et l’arrêt l’applique, une seule fois')
  assert.ok(storage.getDoc(doc.id).updatedAt >= avant)
})

test('une écriture ancienne est datée tout de suite', async () => {
  const storage = new Storage(dataDir)
  const doc = storage.createDoc('Ancien', 'moi@example.com')
  const registre = storage._readRegistry()
  registre[doc.id].updatedAt = Date.now() - 60_000
  storage._writeRegistry(registre)
  storage.appendUpdate(doc.id, Buffer.from([1]))
  await storage.flushAll()
  assert.ok(Date.now() - storage.getDoc(doc.id).updatedAt < 5000)
})
