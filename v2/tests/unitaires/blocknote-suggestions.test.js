// Le suivi des auteurs des suggestions (adaptateurs/blocknote/suggestions.js) :
// quand y/hub ne répond pas, un nouvel essai, un seul, sans attendre le
// prochain changement (audit du 10/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suivreAuteurs } from '../../adaptateurs/blocknote/suggestions.js'

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

test('y/hub muet : un seul nouvel essai, puis on attend le prochain changement', async () => {
  let demandes = 0
  const ecouteurs = new Set()
  const contexte = {
    suggestions: {
      fragment: null,
      auteurs: async () => (demandes++, null),
      doc: { on: (_, f) => ecouteurs.add(f), off: (_, f) => ecouteurs.delete(f) },
    },
  }
  const arreter = suivreAuteurs(contexte, () => assert.fail('rien à transmettre sans auteurs'), 5)
  await attendre(80)
  assert.equal(demandes, 2, 'la demande du départ, puis un seul nouvel essai')
  for (const f of ecouteurs) f(null, 'quelqu’un')
  await attendre(80)
  assert.equal(demandes, 4, 'un changement relance une demande, et son nouvel essai')
  arreter()
  assert.equal(ecouteurs.size, 0)
})

test('y/hub qui échoue (rejet) : même unique nouvel essai que pour une réponse nulle', async () => {
  let demandes = 0
  const contexte = {
    suggestions: {
      fragment: null,
      auteurs: async () => {
        demandes++
        throw new Error('y/hub : 500')
      },
      doc: { on: () => {}, off: () => {} },
    },
  }
  const arreter = suivreAuteurs(contexte, () => assert.fail('rien à transmettre sans auteurs'), 5)
  await attendre(80)
  assert.equal(demandes, 2, 'la demande du départ, puis un seul nouvel essai')
  arreter()
})
