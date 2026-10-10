// Identité des commentaires (audit S12, 10/10/2026) : le nom affiché n'est pas
// unique, l'identifiant du compte l'est. Il s'écrit dans chaque commentaire
// (`authorId`) et c'est lui que `peutModifier` compare — le serveur tient la
// même règle pour un lecteur (server/test/replique.test.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'

const dom = new JSDOM('<!doctype html><body></body>')
globalThis.window = dom.window
globalThis.document = dom.window.document
for (const k of ['HTMLElement', 'Node', 'Element', 'Event']) globalThis[k] = dom.window[k]

const { ajouterReponse, peutModifier } = await import('../src/comments.js')

const MARIE = { name: 'Marie', color: '#3d5a80', id: 'id-marie' }
const HOMONYME = { name: 'Marie', color: '#e07a5f', id: 'id-intrus' }

function carteAvecParent() {
  const carte = new Y.Doc().getMap('comments')
  carte.set('c1', { id: 'c1', author: 'Bruno', authorId: 'id-bruno', text: 'le texte', createdAt: 1 })
  return carte
}

test('une réponse porte l’identifiant du compte de son auteur', () => {
  const carte = carteAvecParent()
  const id = ajouterReponse(carte, MARIE, 'c1', 'd’accord')
  assert.equal(carte.get(id).authorId, 'id-marie')
  assert.equal(carte.get(id).author, 'Marie')
})

test('sans identifiant de compte (anciens appels), rien d’inventé n’est écrit', () => {
  const carte = carteAvecParent()
  const id = ajouterReponse(carte, { name: 'Marie', color: '#000' }, 'c1', 'd’accord')
  assert.ok(!('authorId' in carte.get(id)))
})

test('peutModifier : par l’identifiant quand le commentaire en porte un — deux « Marie » ne se confondent plus', () => {
  const carte = carteAvecParent()
  const id = ajouterReponse(carte, MARIE, 'c1', 'à moi')
  const c = carte.get(id)
  assert.equal(peutModifier(c, MARIE), true)
  assert.equal(peutModifier(c, HOMONYME), false, 'même nom, autre compte')
  assert.equal(peutModifier(c, { name: 'Autre', id: 'id-marie' }), true, 'renommée, c’est toujours elle')
})

test('peutModifier : un commentaire d’avant (sans identifiant) se reconnaît encore au nom', () => {
  const ancien = { id: 'c0', author: 'Marie', text: 'ancien', createdAt: 1 }
  assert.equal(peutModifier(ancien, MARIE), true)
  assert.equal(peutModifier(ancien, { name: 'Bruno', id: 'id-bruno' }), false)
  assert.equal(peutModifier(null, MARIE), false)
  assert.equal(peutModifier(ancien, null), false)
})
