// Les briques communes aux exports (client/src/exportCommun.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { nomDeFichier } from '../src/exportCommun.js'

test('nomDeFichier : titre vide, caractères interdits, longueur', () => {
  assert.equal(nomDeFichier('Mon Titre'), 'Mon Titre')
  assert.equal(nomDeFichier(''), 'document')
  assert.equal(nomDeFichier('   '), 'document')
  assert.equal(nomDeFichier(undefined), 'document')
  assert.equal(nomDeFichier('a/b:c*d?e"f<g>h|i\\j'), 'a-b-c-d-e-f-g-h-i-j')
  assert.equal(nomDeFichier('x'.repeat(300)).length, 150)
})
