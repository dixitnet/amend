// La carte de la modification courante (lot L2, 21/10/2026) : ses libellés.
import test from 'node:test'
import assert from 'node:assert/strict'
import { initiales, verbeDe } from '../src/carteModification.js'

test('les initiales de la pastille', () => {
  assert.equal(initiales('Camille Durand'), 'CD')
  assert.equal(initiales('Jean-Marc Ayrault'), 'JA')
  assert.equal(initiales('Margo'), 'MA')
  assert.equal(initiales('Margo (IA)'), 'MA', 'les parenthèses ne comptent pas')
  assert.equal(initiales(''), '?')
})

test('ce que fait la modification, en un verbe', () => {
  assert.equal(verbeDe({ type: 'insertion' }), 'ajoute')
  assert.equal(verbeDe({ type: 'deletion' }), 'supprime')
  assert.equal(verbeDe({ type: 'remplacement' }), 'remplace')
  assert.equal(verbeDe({ type: 'lot', membres: [1, 2, 3] }), 'propose 3 changements')
})
