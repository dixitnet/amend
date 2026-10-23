// Le réglage « images pleine page » dans la feuille de style (23/10/2026) :
// valeur par défaut, assainissement, fusion et écart — les promesses du modèle
// déclaratif (voir style.test.js) appliquées à un booléen de page.

import test from 'node:test'
import assert from 'node:assert/strict'
import { assainir, fusionner, reduire, styleParDefaut } from '../../shared/style.js'

test('désactivé par défaut : personne ne voit son document changer', () => {
  assert.equal(styleParDefaut().page.imagesPleinePage, false)
  assert.equal(assainir({}).page.imagesPleinePage, false)
})

test('un modèle ou un document peut l’activer, et il survit à l’assainissement', () => {
  assert.equal(fusionner({ page: { imagesPleinePage: true } }).page.imagesPleinePage, true)
  assert.equal(assainir({ page: { imagesPleinePage: true } }).page.imagesPleinePage, true)
})

test('une valeur qui n’est pas un booléen retombe sur la valeur par défaut', () => {
  for (const v of ['oui', 1, 'true', null]) {
    assert.equal(assainir({ page: { imagesPleinePage: v } }).page.imagesPleinePage, false, String(v))
  }
})

test('un document n’enregistre que son écart : le réglage du modèle, hérité, n’est pas copié', () => {
  const modele = assainir({ page: { imagesPleinePage: true } })
  // Identique au modèle : rien à garder.
  assert.deepEqual(reduire(modele, modele, { seulement: true }).page, undefined)
  // Le document le désactive : l'écart est noté.
  const doc = assainir({ page: { imagesPleinePage: false } })
  assert.deepEqual(reduire(doc, modele, { seulement: true }).page, { imagesPleinePage: false })
})

test('un réglage ajouté après coup n’efface rien d’un modèle plus ancien', () => {
  // Un modèle enregistré avant le 23/10/2026 ne porte pas la clé.
  const ancien = { version: 2, page: { size: 'A5', marginLeft: 15 }, blocs: {} }
  const f = fusionner(ancien)
  assert.equal(f.page.size, 'A5')
  assert.equal(f.page.marginLeft, 15)
  assert.equal(f.page.imagesPleinePage, false)
})
