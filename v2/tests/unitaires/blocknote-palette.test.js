// La palette flottante et le schéma du livre (décisions de Sylvain du
// 09/11/2026) : sans boutons d'alignement, titres de niveau 1 à 5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getFormattingToolbarItems } from '@blocknote/react'
import {
  BOUTONS_RETIRES,
  APRES_EXPOSANT,
  boutonsGardes,
  boutonsGardesEnSuggestion,
  BOUTONS_RETIRES_S,
  boutonsDuFormatS,
} from '../../adaptateurs/blocknote/palette.js'
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

test('l’exposant vient juste après le barré, qui existe dans la palette de BlockNote (11/11/2026)', () => {
  assert.ok(cles(getFormattingToolbarItems()).includes(APRES_EXPOSANT))
  const gardee = cles(boutonsGardes(getFormattingToolbarItems(), { key: 'exposant' }))
  assert.equal(gardee[gardee.indexOf(APRES_EXPOSANT) + 1], 'exposant')
  assert.deepEqual(cles(boutonsGardes([{ key: 'a' }], { key: 'exposant' })), ['a', 'exposant'])
})

test('le schéma du livre a le saut de page, la table des matières et l’exposant (11/11/2026)', () => {
  assert.ok(schemaLivre.blockSpecs.pageBreak)
  assert.deepEqual(schemaLivre.blockSpecs.tableDesMatieres.config.propSchema.profondeur.values, [1, 2, 3, 4, 5])
  assert.equal(schemaLivre.blockSpecs.tableDesMatieres.config.content, 'none')
  assert.equal(schemaLivre.styleSpecs.exposant.config.propSchema, 'boolean')
})

test('en mode Suggérer, ni mise en forme ni lien dans la palette ; le commentaire reste (11/11/2026)', () => {
  const palette = cles(getFormattingToolbarItems())
  const gardee = cles(boutonsGardesEnSuggestion(getFormattingToolbarItems()))
  for (const cle of ['boldStyleButton', 'italicStyleButton', 'createLinkButton', 'blockTypeSelect']) {
    assert.ok(palette.includes(cle), `clé inconnue de BlockNote : ${cle}`)
    assert.ok(!gardee.includes(cle), cle)
  }
  assert.ok(gardee.includes('addCommentButton'), 'commenter reste possible')
})

test('format S : sans le choix du type de bloc, le reste gardé (12/11/2026)', () => {
  const palette = cles(getFormattingToolbarItems())
  for (const cle of BOUTONS_RETIRES_S) assert.ok(palette.includes(cle), `clé inconnue de BlockNote : ${cle}`)
  const s = cles(boutonsDuFormatS(boutonsGardes(getFormattingToolbarItems())))
  assert.ok(!s.includes('blockTypeSelect'))
  for (const cle of ['boldStyleButton', 'createLinkButton', 'nestBlockButton']) assert.ok(s.includes(cle), cle)
  // En Suggérer au téléphone : aucun bouton de forme ne revient, le commentaire reste.
  const sugg = cles(boutonsDuFormatS(boutonsGardesEnSuggestion(getFormattingToolbarItems())))
  for (const cle of ['blockTypeSelect', 'boldStyleButton', 'createLinkButton']) assert.ok(!sugg.includes(cle), cle)
  assert.ok(sugg.includes('addCommentButton'))
})
