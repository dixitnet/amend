// La réponse de l'IA, nettoyée (28/09/2026).
//
// Sylvain voyait des paragraphes encadrés par `"""` : le modèle reprenait
// les guillemets triples qui entouraient le passage dans la question. La
// question n'en a plus ; et si le modèle en ajoute quand même, ils sont
// retirés — sans jamais toucher au texte lui-même.

import test from 'node:test'
import assert from 'node:assert/strict'
import { nettoyerSuggestion } from '../ai.js'

test('les enveloppes que le modèle ajoute parfois sont retirées', () => {
  assert.equal(nettoyerSuggestion('"""\nLe chat dort.\n"""'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('```\nLe chat dort.\n```'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('```text\nLe chat dort.\nLe chien aussi.\n```'), 'Le chat dort.\nLe chien aussi.')
  assert.equal(nettoyerSuggestion('<passage>\nLe chat dort.\n</passage>'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('"Le chat dort."'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('« Le chat dort. »'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('"""\n"Le chat dort."\n"""'), 'Le chat dort.')
})

test('le texte lui-même n’est jamais touché', () => {
  // Des guillemets à l'intérieur, ou d'un seul côté, ne sont pas une enveloppe.
  assert.equal(nettoyerSuggestion('Il a dit "non" puis "oui".'), 'Il a dit "non" puis "oui".')
  assert.equal(nettoyerSuggestion('"Bonjour", dit-il.'), '"Bonjour", dit-il.')
  assert.equal(nettoyerSuggestion('Le chat dort.\n\nLe chien court.'), 'Le chat dort.\n\nLe chien court.')
  assert.equal(nettoyerSuggestion('  Le chat dort.  '), 'Le chat dort.')
  assert.equal(nettoyerSuggestion(''), '')
})
