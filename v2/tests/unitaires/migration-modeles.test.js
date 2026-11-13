// La conversion transitoire des modèles enregistrés avant le 13/11/2026 (un
// modèle de base et des écarts) en modèles complets par style.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ancienModele, versModeleParStyle, verifierModele } from '../../domaine/index.js'
import { REGLES_MODELES } from '../../design/livre.js'

test('un ancien modèle (base de l’A4 et écarts) devient un modèle complet par style, valide', () => {
  const ancien = ancienModele(
    { base: 'a4', ecarts: { 'page.largeur': 135, 'grille.corps': 11, 'chapitre.bellePage': true } },
    () => null,
    'a4',
  )
  const m = versModeleParStyle(ancien)
  assert.equal(m.page.largeur, 135)
  assert.equal(m.styles.texte.police, 'EB Garamond')
  assert.equal(m.styles.legende.italique, true)
  assert.equal(m.styles.titre.lignesAvant, 0)
  assert.equal(verifierModele(m, REGLES_MODELES).ok, true)
})

test('la conversion suit les bases d’instance, ramène une base disparue ou un cycle à l’A4, et lit l’ancienne belle page', () => {
  const instance = {
    i1: { base: 'a4', ecarts: { 'grille.corps': 12, 'chapitre.bellePage': false } },
    i2: { base: 'i1', ecarts: { 'page.largeur': 140 } },
    c1: { base: 'c2', ecarts: {} },
    c2: { base: 'c1', ecarts: {} },
  }
  const trouver = (id) => instance[id] ?? null
  const de = (entree) => ancienModele(entree, trouver, 'a4')
  const m = de({ base: 'i2', ecarts: { 'chapitre.bellePage': true } })
  assert.deepEqual([m.page.largeur, m.grille.corps, m.chapitre.debut], [140, 12, 'belle-page'])
  assert.equal(de({ base: 'i1', ecarts: {} }).chapitre.debut, 'page')
  assert.equal(de({ base: 'disparu', ecarts: {} }).page.largeur, 210, 'base disparue : l’A4')
  assert.doesNotThrow(() => de({ base: 'c1', ecarts: {} }), 'un cycle s’arrête à la profondeur permise')
})
