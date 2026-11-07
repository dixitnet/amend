// Contrat 3 : BlockNote fournit son dictionnaire français, et l'adaptateur le choisit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dictionnaire } from '../../adaptateurs/blocknote/dictionnaire.js'

test('le dictionnaire français de BlockNote existe et diffère de l’anglais', () => {
  const fr = dictionnaire('fr')
  const en = dictionnaire('en')
  assert.equal(typeof fr.placeholders?.default, 'string')
  assert.notEqual(fr.placeholders.default, en.placeholders.default)
  assert.equal(dictionnaire('xx'), fr)
})
