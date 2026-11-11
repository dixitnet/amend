// Contrat des fondations du suivi des modifications (montage de l'exemple de
// BlockNote, 10/11/2026 ; audit partiel du 11/11/2026, A2 et A3) : ce que notre
// adaptateur utilise de Yjs, de `@y/prosemirror` et de BlockNote, épinglé ici
// pour qu'une montée de version qui le change échoue tout de suite, au lieu de
// casser le suivi en silence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Y from '@y/y'
import * as YP from '@y/prosemirror'

// Les déclarations publiées de BlockNote (ses types : l'API qu'il s'engage à tenir).
const typesDe = (fichier) =>
  readFileSync(new URL(`../../node_modules/@blocknote/core/${fichier}`, import.meta.url), 'utf8')

test('Yjs : l’afficheur des suggestions, sa couverture (`attributed`) et son mode', () => {
  const texte = new Y.Doc()
  const suggestions = new Y.Doc({ isSuggestionDoc: true })
  const r = Y.createDiffRenderer(texte, suggestions)
  assert.equal(typeof r.attributed?.isEmpty, 'function', 'attributed.isEmpty()')
  assert.equal(r.attributed.isEmpty(), true, 'rien à relire au départ')
  assert.ok('suggestionMode' in r)
  r.destroy()
  assert.equal(typeof Y.decodeContentMap, 'function', 'table des auteurs de y/hub')
})

test('@y/prosemirror : traduire une position du texte en position Yjs (auteur d’une suggestion)', () => {
  assert.equal(typeof YP.resolvedPositionToRelativePosition, 'function')
  assert.equal(typeof YP.configureYProsemirror, 'function')
})

test('BlockNote : les trois modes et l’arbitrage de l’extension des suggestions', () => {
  const t = typesDe('types/src/y/extensions/Suggestions.d.ts')
  for (const m of [
    'enableSuggestions',
    'viewSuggestions',
    'disableSuggestions',
    'applySuggestion',
    'revertSuggestion',
    'applyAllSuggestions',
    'revertAllSuggestions',
  ])
    assert.match(t, new RegExp(`\\b${m}\\b`), m)
})

test('BlockNote : l’historique sur y/hub accepte le regroupement des versions (`activityParams`)', () => {
  const t = typesDe('types/src/y/versioning/yhub.d.ts')
  assert.match(t, /activityParams\?:/)
  assert.match(t, /createYHubVersionStorage/)
})
