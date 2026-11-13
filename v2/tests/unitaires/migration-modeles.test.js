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
