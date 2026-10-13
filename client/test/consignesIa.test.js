// La liste des consignes de Corrections IA (shared/consignesIa.js), lue par le
// client (boutons) et par le serveur (cumul des clics par bouton).

import test from 'node:test'
import assert from 'node:assert/strict'
import { CONSIGNES_IA, cleDeConsigne } from '../../shared/consignesIa.js'

test('chaque consigne a une clé unique, un libellé et une instruction', () => {
  const cles = CONSIGNES_IA.map((c) => c.cle)
  assert.equal(new Set(cles).size, cles.length, 'clés uniques')
  for (const c of CONSIGNES_IA) {
    assert.match(c.cle, /^[a-z]+$/, `clé simple : ${c.cle}`)
    assert.ok(c.label.trim() && c.instruction.trim(), c.cle)
    assert.ok(c.instruction.length < 500, 'une consigne courte : le serveur la borne à 2 000 signes')
  }
  assert.ok(!cles.includes('autre'), '« autre » est réservé aux clés inconnues')
})

test('l’ordre des boutons : les trois d’origine d’abord, puis les ajouts', () => {
  assert.deepEqual(
    CONSIGNES_IA.map((c) => c.label),
    ['Raccourcir', 'Corriger', 'Clarifier', 'Reformuler', 'Développer', 'Plus soutenu', 'Plus direct']
  )
})

test('cleDeConsigne : une clé connue reste, le reste devient « autre »', () => {
  assert.equal(cleDeConsigne('corriger'), 'corriger')
  assert.equal(cleDeConsigne('inconnue'), 'autre')
  assert.equal(cleDeConsigne(undefined), 'autre')
  assert.equal(cleDeConsigne(null), 'autre')
})
