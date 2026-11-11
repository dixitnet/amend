// Le compteur (signes, espaces compris, puis mots) et la table des matières
// insérée dans le texte : règles du domaine (comparaison v1 / v2, points 6 et 8).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compter, profondeurTable, entreesTable, PROFONDEUR_TABLE_PAR_DEFAUT } from '../../domaine/index.js'

test('les signes comptent les espaces, sans séparateur entre deux blocs', () => {
  assert.deepEqual(compter(['Le chat', 'dort.']), { signes: 12, mots: 3 })
  assert.deepEqual(compter([]), { signes: 0, mots: 0 })
  assert.deepEqual(compter(['', '   ']), { signes: 3, mots: 0 })
})

// Écrits par leur code, pour qu'aucun caractère invisible ne soit dans la source.
const ACCENT = String.fromCodePoint(0x301)
const FINE = String.fromCodePoint(0x202f)
const INSECABLE = String.fromCodePoint(0xa0)

test('une lettre décomposée compte pour un signe (NFC)', () => {
  assert.deepEqual(compter([`e${ACCENT}te${ACCENT}`]), { signes: 3, mots: 1 })
})

test('insécables et fines séparent les mots comme une espace', () => {
  assert.deepEqual(compter([`Vraiment${FINE}?`, `oui${INSECABLE}: non`]), { signes: 19, mots: 5 })
})

test('profondeur de la table : de 1 à 5, sinon celle par défaut', () => {
  assert.equal(profondeurTable(3), 3)
  assert.equal(profondeurTable('4'), 4)
  for (const v of [0, 6, null, undefined, 'x', 2.5]) assert.equal(profondeurTable(v), PROFONDEUR_TABLE_PAR_DEFAUT)
})

test('entrées de la table : titres non vides jusqu’à la profondeur, dans l’ordre', () => {
  const titres = [
    { niveau: 1, texte: 'Un' },
    { niveau: 2, texte: 'Un.1' },
    { niveau: 3, texte: 'Un.1.a' },
    { niveau: 2, texte: '  ' },
    { niveau: 1, texte: 'Deux' },
  ]
  assert.deepEqual(
    entreesTable(titres, 2).map((t) => t.texte),
    ['Un', 'Un.1', 'Deux'],
  )
  assert.deepEqual(
    entreesTable(titres, 1).map((t) => t.texte),
    ['Un', 'Deux'],
  )
})
