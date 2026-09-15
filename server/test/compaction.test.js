// Seuil de compaction et son hystérésis (voir storage.js :
// COMPACTION_TRIGGER_RATIO, et claude/rapport-test-charge-3.md §2).
// Le nombre d'opérations conservées par une compaction et le seuil qui la
// déclenche sont deux choses distinctes depuis le 15/09/2026 : sans cette
// marge, un document tout juste compacté repassait « à compacter » dès la
// frappe suivante, et chaque client qui se connectait relançait une
// compaction complète pour quelques opérations.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '../storage.js'

const dataDir = mkdtempSync(join(tmpdir(), 'collabtext-test-compaction-'))
process.on('exit', () => rmSync(dataDir, { recursive: true, force: true }))

/** maxUncompactedOps volontairement minuscule : 10 conservées, seuil à 15. */
function storageDeTest() {
  return new Storage(dataDir, { maxUncompactedOps: 10 })
}

async function ecrire(storage, id, nb) {
  for (let i = 0; i < nb; i++) storage.appendUpdate(id, Buffer.from([1, 2, 3, i % 256]))
  await storage.flushAll()
}

test('le seuil de déclenchement est plus haut que le nombre d’opérations conservées', () => {
  const storage = storageDeTest()
  assert.equal(storage.maxUncompactedOps, 10)
  assert.equal(storage.compactionTrigger, 15)
})

test('hystérésis : après compaction, le document a de la marge avant la suivante', async () => {
  const storage = storageDeTest()
  const doc = storage.createDoc('Doc à compacter', 'moi@example.com')

  await ecrire(storage, doc.id, 12)
  let meta = storage.getHistoryMeta(doc.id)
  assert.equal(meta.count, 12)
  assert.equal(meta.needsCompaction, false, '12 opérations : au-dessus des 10 conservées, mais sous le seuil de 15')

  await ecrire(storage, doc.id, 4) // 16 au total
  meta = storage.getHistoryMeta(doc.id)
  assert.equal(meta.count, 16)
  assert.equal(meta.needsCompaction, true, 'au-delà du seuil, la compaction est demandée')

  // Compaction telle que la fait le client (historySnapshot.js) : garder les
  // maxUncompactedOps - 1 dernières, l'instantané occupant la place manquante.
  const keepFromIndex = meta.count - (meta.maxUncompactedOps - 1)
  await storage.compactDoc(doc.id, {
    baseSnapshot: Buffer.from([9, 9, 9, 9]),
    baseTs: Date.now(),
    keepFromIndex,
    expectedTotalBeforeCompaction: meta.count,
  })

  meta = storage.getHistoryMeta(doc.id)
  assert.equal(meta.count, 10, 'le journal retombe exactement au nombre conservé')
  assert.equal(meta.needsCompaction, false)

  // Le point de la correction : quelques frappes de plus ne redéclenchent
  // pas tout le travail (avant le 15/09, une seule suffisait).
  await ecrire(storage, doc.id, 4) // 14
  meta = storage.getHistoryMeta(doc.id)
  assert.equal(meta.count, 14)
  assert.equal(meta.needsCompaction, false, 'la marge doit absorber les opérations qui suivent une compaction')

  await ecrire(storage, doc.id, 2) // 16
  assert.equal(storage.getHistoryMeta(doc.id).needsCompaction, true, 'et redemander une compaction une fois la marge consommée')
})
