import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateDuJour } from '../../domaine/index.js'

test('date du jour au format AAAA-MM-JJ, à l’heure locale (12/11/2026)', () => {
  assert.equal(dateDuJour(new Date(2026, 10, 12, 23, 59)), '2026-11-12')
  assert.equal(dateDuJour(new Date(2027, 0, 5, 0, 1)), '2027-01-05')
  assert.match(dateDuJour(), /^\d{4}-\d{2}-\d{2}$/)
})
