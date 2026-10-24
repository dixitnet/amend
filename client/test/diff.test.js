// Le diff mot à mot ne propose pas ce que le lecteur ne voit pas (24/10/2026) :
// accent codé autrement, espace insécable rendue en espace ordinaire.

import test from 'node:test'
import assert from 'node:assert/strict'
import { diffWords } from '../../shared/diff.js'

const changements = (ops) => ops.filter((o) => o.type !== 'equal')
const rejoue = (ops) => ops.filter((o) => o.type !== 'insert').map((o) => o.text).join('')

test('un accent en deux signes et le même en un signe : aucune modification', () => {
  const ancien = 'La coherence'.replace('coherence', 'cohérence') + ' territoriale'
  const nouveau = 'La cohérence territoriale'
  assert.notEqual(ancien, nouveau)
  assert.deepEqual(changements(diffWords(ancien, nouveau)), [])
  assert.equal(rejoue(diffWords(ancien, nouveau)), ancien)
})

test('une espace insécable rendue en espace ordinaire : on garde celle du texte', () => {
  const ancien = 'de gaz à effet de serre'
  const nouveau = 'de gaz à effet de serre'
  assert.deepEqual(changements(diffWords(ancien, nouveau)), [])
  assert.equal(rejoue(diffWords(ancien, nouveau)), ancien)
})

test('une espace ordinaire devenue insécable avant « : » reste une correction', () => {
  const ops = changements(diffWords('Une exigence : celle', 'Une exigence : celle'))
  assert.deepEqual(ops, [
    { type: 'delete', text: ' ' },
    { type: 'insert', text: ' ' },
  ])
})

test('un double espace réduit à une espace reste proposé', () => {
  assert.notDeepEqual(changements(diffWords('a  b', 'a b')), [])
})

test('une vraie correction à côté d’un mot en deux signes reste proposée, à la lettre', () => {
  const ops = changements(diffWords('cohe\u0301rent et le chomage', 'cohérent et le chômage'))
  assert.deepEqual(ops, [
    { type: 'delete', text: 'o' },
    { type: 'insert', text: 'ô' },
  ])
})

test('mot en deux signes réellement corrigé : mot entier barré puis retapé', () => {
  const ops = changements(diffWords('cohérent', 'cohérente'))
  assert.deepEqual(ops, [
    { type: 'delete', text: 'cohérent' },
    { type: 'insert', text: 'cohérente' },
  ])
})
