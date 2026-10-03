// Le survol d'une carte de modification (03/10/2026).
//
// Un lot de Claude éclairé en vert se confondait avec le vert de ses
// propositions. Le surlignage est maintenant un fond gris posé sur le bloc
// entier — donc derrière les marques —, et jamais sur le texte.

import test from 'node:test'
import assert from 'node:assert/strict'
import { doc } from './harness.js'
import { blocsConcernes } from '../src/changesPanel.js'

function plage(document, de, a) {
  return blocsConcernes(document, de, a).map((d) => [d.from, d.to])
}

test('une plage dans un paragraphe éclaire ce paragraphe, en entier', () => {
  const d = doc('Premier paragraphe.', 'Deuxième paragraphe.', 'Troisième.')
  const p1 = d.child(0).nodeSize
  assert.deepEqual(plage(d, 3, 8), [[0, p1]])
})

test('une plage sur plusieurs paragraphes éclaire chacun, et seulement eux', () => {
  const d = doc('Un.', 'Deux.', 'Trois.', 'Quatre.')
  const t = d.child(0).nodeSize
  const dep = t + 2
  const fin = t + d.child(1).nodeSize + 2
  const r = plage(d, dep, fin)
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], [t, t + d.child(1).nodeSize])
})

test('la décoration porte une classe de fond, jamais une marque ni un texte', () => {
  const d = doc('Un.', 'Deux.')
  for (const deco of blocsConcernes(d, 1, d.content.size - 1)) {
    assert.equal(deco.type.attrs.class, 'change-survol')
  }
})
