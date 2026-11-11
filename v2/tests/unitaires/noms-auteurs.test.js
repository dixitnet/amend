import test from 'node:test'
import assert from 'node:assert/strict'
import { nomsAdemander, DELAI_NOM_INTROUVABLE_MS } from '../../application/client/nomsAuteurs.js'

test('un identifiant déjà connu ou vide n’est pas demandé', () => {
  const essais = new Map()
  assert.deepEqual(nomsAdemander(['a', 'a', 'b', null, ''], { a: 'Anne' }, essais, 0), ['b'])
})

test('un identifiant introuvable n’est redemandé qu’après le délai', () => {
  const essais = new Map()
  assert.deepEqual(nomsAdemander(['b'], {}, essais, 1000), ['b'])
  assert.deepEqual(nomsAdemander(['b'], {}, essais, 1000 + DELAI_NOM_INTROUVABLE_MS - 1), [])
  assert.deepEqual(nomsAdemander(['b'], {}, essais, 1000 + DELAI_NOM_INTROUVABLE_MS), ['b'])
})
