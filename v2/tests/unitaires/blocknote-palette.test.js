// La palette flottante et le schéma du livre (décisions de Sylvain du
// 09/11/2026) : sans boutons d'alignement, titres de niveau 1 à 5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getFormattingToolbarItems } from '@blocknote/react'
import { BOUTONS_RETIRES, boutonsGardes } from '../../adaptateurs/blocknote/palette.js'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'

const cles = (boutons) => boutons.map((bouton) => bouton.key)

test('chaque bouton retiré existe dans la palette de BlockNote', () => {
  const palette = cles(getFormattingToolbarItems())
  for (const cle of BOUTONS_RETIRES) assert.ok(palette.includes(cle), `clé inconnue de BlockNote : ${cle}`)
})

test('la palette gardée n’a plus l’alignement, et garde le reste', () => {
  const gardee = cles(boutonsGardes(getFormattingToolbarItems()))
  for (const cle of BOUTONS_RETIRES) assert.ok(!gardee.includes(cle), cle)
  for (const cle of [
    'boldStyleButton',
    'italicStyleButton',
    'underlineStyleButton',
    'strikeStyleButton',
    'createLinkButton',
  ])
    assert.ok(gardee.includes(cle), cle)
})

test('le schéma du livre accepte les titres de niveau 1 à 5', () => {
  assert.deepEqual(schemaLivre.blockSpecs.heading.config.propSchema.level.values, [1, 2, 3, 4, 5])
})
