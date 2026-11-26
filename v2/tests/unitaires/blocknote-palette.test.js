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
  // Plusieurs boutons à nous, dans l'ordre donné ; un bouton absent est ignoré (26/11/2026).
  const deux = cles(boutonsGardes(getFormattingToolbarItems(), [{ key: 'exposant' }, null, { key: 'surligne' }]))
  assert.deepEqual(deux.slice(deux.indexOf(APRES_EXPOSANT) + 1, deux.indexOf(APRES_EXPOSANT) + 3), [
    'exposant',
    'surligne',
  ])
})

test('le schéma du livre a le saut de page, la table des matières et l’exposant (11/11/2026)', () => {
  assert.ok(schemaLivre.blockSpecs.pageBreak)
  assert.deepEqual(schemaLivre.blockSpecs.tableDesMatieres.config.propSchema.profondeur.values, [1, 2, 3, 4, 5])
  assert.equal(schemaLivre.blockSpecs.tableDesMatieres.config.content, 'none')
  assert.equal(schemaLivre.styleSpecs.exposant.config.propSchema, 'boolean')
  assert.equal(schemaLivre.styleSpecs.surligne.config.propSchema, 'boolean')
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

test('format S : la barre garde le choix du style, comme les autres formats ; en Suggérer, aucun bouton de forme (17/11/2026)', () => {
  const gardee = cles(boutonsGardes(getFormattingToolbarItems()))
  for (const cle of ['blockTypeSelect', 'boldStyleButton', 'createLinkButton', 'nestBlockButton'])
    assert.ok(gardee.includes(cle), cle)
  const sugg = cles(boutonsGardesEnSuggestion(getFormattingToolbarItems()))
  for (const cle of ['blockTypeSelect', 'boldStyleButton', 'createLinkButton']) assert.ok(!sugg.includes(cle), cle)
  assert.ok(sugg.includes('addCommentButton'))
})
