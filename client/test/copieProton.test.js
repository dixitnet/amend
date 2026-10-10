// La ligne « Dernier envoi sur Proton Drive » du back-office (10/10/2026).
// Facultative : muette tant que l'envoi n'a jamais eu lieu, alerte au-delà de 36 h.

import test from 'node:test'
import assert from 'node:assert/strict'
import { copieProton, copieDistante } from '../src/admin.js'

const H = 3600_000
const maintenant = Date.UTC(2026, 9, 10, 8, 0, 0)

test('copie distante jamais signalée : plus de message permanent (10/10/2026) ; arrêtée depuis plus de 36 h : alerte', () => {
  assert.equal(copieDistante(null, maintenant), '')
  assert.doesNotMatch(copieDistante({ ts: maintenant - 5 * H }, maintenant), /bo-alerte/)
  assert.match(copieDistante({ ts: maintenant - 40 * H }, maintenant), /bo-alerte/)
})

test('jamais envoyé : rien à afficher', () => {
  assert.equal(copieProton(null, maintenant), '')
  assert.equal(copieProton(undefined, maintenant), '')
})

test('un envoi récent se lit sans alerte', () => {
  const html = copieProton({ ts: maintenant - 5 * H }, maintenant)
  assert.match(html, /Dernier envoi sur Proton Drive/)
  assert.match(html, /il y a 5.h/)
  assert.doesNotMatch(html, /bo-alerte/)
})

test('à l’instant', () => {
  assert.match(copieProton({ ts: maintenant - 10_000 }, maintenant), /à l’instant/)
})

test('plus de 36 h : alerte', () => {
  const html = copieProton({ ts: maintenant - 40 * H }, maintenant)
  assert.match(html, /bo-alerte/)
  assert.match(html, /s’est arrêté/)
})
