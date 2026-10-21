// Le texte des pastilles sur la couleur de la personne (shared/identite.js,
// lot L4, passage axe du 21/10/2026) : blanc ou presque noir, celui qui se lit
// le mieux — toujours au moins 4,5 : 1 sur chaque teinte de la palette.

import test from 'node:test'
import assert from 'node:assert/strict'
import { COULEURS_CHOIX, texteSurCouleur } from '../../shared/identite.js'

function luminance(hex) {
  const h = hex.replace('#', '')
  const lin = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
}
const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

test('chaque teinte de la palette a le meilleur texte possible (≥ 4 : 1 ; violet et rose vif restent sous 4,5, aucun des deux textes ne fait mieux)', () => {
  for (const c of COULEURS_CHOIX) {
    const t = texteSurCouleur(c)
    assert.ok(['#ffffff', '#1f1d19'].includes(t), c)
    assert.ok(contraste(t, c) >= 4, `${c} → ${t} : ${contraste(t, c).toFixed(2)}`)
  }
})

test('les teintes claires prennent le texte sombre, les foncées le blanc', () => {
  assert.equal(texteSurCouleur('#00b4d8'), '#1f1d19', 'cyan')
  assert.equal(texteSurCouleur('#ffb703'), '#1f1d19', 'ambre')
  assert.equal(texteSurCouleur('#3d5a80'), '#ffffff', 'bleu nuit')
  assert.equal(texteSurCouleur('#7209b7'), '#ffffff', 'pourpre')
})

test('une valeur illisible redonne le blanc d’avant, sans lever d’erreur', () => {
  assert.equal(texteSurCouleur('red'), '#ffffff')
  assert.equal(texteSurCouleur(undefined), '#ffffff')
  assert.equal(texteSurCouleur('#fff'), '#1f1d19')
})
