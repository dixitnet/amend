// Le limiteur de débit commun (audit du 10/10/2026, point 39).
import test from 'node:test'
import assert from 'node:assert/strict'
import { Limiteur } from '../limiteur.js'

function avecHorloge(options) {
  const horloge = { t: 1000 }
  const limiteur = new Limiteur({ ...options, maintenant: () => horloge.t })
  return { horloge, limiteur }
}

test('essayer autorise jusqu’au plafond, puis refuse sans rien consommer', () => {
  const { limiteur } = avecHorloge({ max: 3, fenetreMs: 100 })
  assert.deepEqual([1, 2, 3, 4, 5].map(() => limiteur.essayer('a')), [true, true, true, false, false])
  assert.equal(limiteur.compter('a'), 3, 'un refus ne compte pas')
})

test('la fenêtre glisse : une tentative ancienne ne compte plus', () => {
  const { horloge, limiteur } = avecHorloge({ max: 2, fenetreMs: 100 })
  limiteur.essayer('a')
  horloge.t += 60
  limiteur.essayer('a')
  assert.equal(limiteur.essayer('a'), false)
  horloge.t += 50 // la première (t=1000) a 110 ms : sortie ; la seconde en a 50
  assert.equal(limiteur.compter('a'), 1)
  assert.equal(limiteur.essayer('a'), true)
})

test('chaque clé a son compteur', () => {
  const { limiteur } = avecHorloge({ max: 1, fenetreMs: 100 })
  assert.equal(limiteur.essayer('a'), true)
  assert.equal(limiteur.essayer('a'), false)
  assert.equal(limiteur.essayer('b'), true)
})

test('noter compte aussi les tentatives refusées (adresses de pages publiées)', () => {
  const { limiteur } = avecHorloge({ max: 2, fenetreMs: 100 })
  assert.deepEqual([1, 2, 3, 4].map(() => limiteur.noter('a')), [1, 2, 3, 4])
  assert.equal(limiteur.atteint('a'), true)
})

test('atteint ne consomme rien', () => {
  const { limiteur } = avecHorloge({ max: 1, fenetreMs: 100 })
  assert.equal(limiteur.atteint('a'), false)
  assert.equal(limiteur.atteint('a'), false)
  assert.equal(limiteur.compter('a'), 0)
})

test('les clés éteintes sont purgées, la carte ne grossit pas avec le temps', () => {
  const { horloge, limiteur } = avecHorloge({ max: 1, fenetreMs: 100, cles: 10 })
  for (let i = 0; i < 10; i++) limiteur.noter(`k${i}`)
  horloge.t += 500
  limiteur.noter('nouvelle')
  limiteur.noter('encore')
  assert.ok(limiteur.parCle.size <= 3, `${limiteur.parCle.size} clés gardées`)
})
