// Rejoue un journal dans un fil à part et renvoie l'état fusionné — voir
// replique.js : un journal jamais compacté de 100 Mo prend quatorze
// secondes, et le fil principal ne doit pas les passer à ça.
import { parentPort, workerData } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import * as Y from 'yjs'

const b = readFileSync(workerData.chemin)
const doc = new Y.Doc()
let i = 0
while (i + 4 <= b.length) {
  const n = b.readUInt32BE(i)
  i += 4
  if (i + n > b.length) break
  try {
    Y.applyUpdate(doc, b.subarray(i, i + n))
  } catch {
    // opération illisible : sautée, comme dans replique.js
  }
  i += n
}
const etat = Y.encodeStateAsUpdate(doc)
parentPort.postMessage(etat, [etat.buffer])
