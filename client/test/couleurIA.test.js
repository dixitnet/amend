import test from 'node:test'
import assert from 'node:assert/strict'
import { COULEUR_IA, COULEURS_IA_ANCIENNES, COULEURS_CHOIX, estCouleurIA } from '../../shared/identite.js'
import { estModificationDAgent } from '../src/suivi/decision.js'
import { AI_USER } from '../src/user.js'

test('la couleur de l’IA est la menthe, et l’ancien vert amande est encore reconnu', () => {
  assert.equal(COULEUR_IA, '#017d5e')
  assert.equal(AI_USER.color, COULEUR_IA)
  assert.ok(estCouleurIA(COULEUR_IA))
  assert.ok(estCouleurIA('#5F7A4A'), 'insensible à la casse')
  assert.ok(COULEURS_IA_ANCIENNES.includes('#5f7a4a'))
  assert.ok(!estCouleurIA('#3d5a80'))
  assert.ok(!estCouleurIA(undefined))
})

test('les modifications de l’IA d’hier et d’aujourd’hui sont toutes reconnues, à condition de porter le nom d’un agent', () => {
  assert.ok(estModificationDAgent({ userColor: COULEUR_IA, user: 'Margo (IA)' }))
  assert.ok(estModificationDAgent({ userColor: '#5f7a4a', user: 'Margo (IA)' }), 'document écrit avant le 22/10/2026')
  assert.ok(estModificationDAgent({ userColor: '#5f7a4a', user: 'Claude (pour Sylvain)' }))
  assert.ok(!estModificationDAgent({ userColor: COULEUR_IA, user: 'Marie' }), 'une personne n’a pas ce vert')
  assert.ok(!estModificationDAgent({ userColor: '#3d5a80', user: 'Margo (IA)' }))
})

test('aucune couleur de personne ne se confond avec celle de l’IA', () => {
  assert.ok(!COULEURS_CHOIX.some((c) => estCouleurIA(c)))
})
