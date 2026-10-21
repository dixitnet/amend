// La bulle de sélection (lot L3, 21/10/2026) : où elle se pose.
import test from 'node:test'
import assert from 'node:assert/strict'
import { placerBulle } from '../src/bulleSelection.js'

const base = {
  debut: { left: 300, top: 200, bottom: 224 },
  fin: { left: 520, top: 230, bottom: 254 },
  conteneur: { left: 220, top: 100, right: 1120 },
  colonne: { left: 250, right: 810 },
  defilement: 0,
  largeur: 420,
  hauteur: 42,
}

test('à la souris, sous la sélection, alignée sur son début', () => {
  const p = placerBulle({ ...base, dessous: true })
  assert.deepEqual(p, { top: 254 - 100 + 8, left: 300 - 220 })
})

test('au doigt, au-dessus de la sélection', () => {
  const p = placerBulle({ ...base, dessous: false })
  assert.equal(p.top, 200 - 100 - 42 - 8)
})

test('elle suit le défilement du conteneur', () => {
  assert.equal(placerBulle({ ...base, dessous: true, defilement: 500 }).top, 254 - 100 + 8 + 500)
})

test('elle ne sort pas de la colonne de texte', () => {
  const aDroite = placerBulle({ ...base, debut: { ...base.debut, left: 700 }, dessous: true })
  assert.equal(aDroite.left, 810 - 220 - 420, 'butée à droite')
  const aGauche = placerBulle({ ...base, debut: { ...base.debut, left: 100 }, dessous: true })
  assert.equal(aGauche.left, 250 - 220, 'butée à gauche')
})

test('jamais au-dessus du haut du conteneur', () => {
  assert.equal(placerBulle({ ...base, debut: { left: 300, top: 110, bottom: 130 }, dessous: false }).top, 0)
})
