// Le plan du document (volet « Plan », étape 6b) : les titres des blocs de
// BlockNote, dans l'ordre, niveaux 1 à 5, texte des liens compris.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { titresDe } from '../../adaptateurs/blocknote/plan.js'

const titre = (id, level, content, children = []) => ({ id, type: 'heading', props: { level }, content, children })
const texte = (t) => ({ type: 'text', text: t, styles: {} })

test('les titres dans l’ordre du texte, avec leur niveau', () => {
  const blocs = [
    { id: 'p', type: 'paragraph', content: [texte('Intro')], children: [] },
    titre('a', 1, [texte('Partie')]),
    titre('b', 2, [texte('1. La fin '), { type: 'link', href: 'x', content: [texte('de l’étalement')] }]),
    titre('c', 5, [texte('Détail')]),
  ]
  assert.deepEqual(titresDe(blocs), [
    { cle: 'a', niveau: 1, libelle: 'Partie' },
    { cle: 'b', niveau: 2, libelle: '1. La fin de l’étalement' },
    { cle: 'c', niveau: 5, libelle: 'Détail' },
  ])
})

test('un titre rangé dans un bloc enfant compte aussi ; un titre vide garde sa place', () => {
  const blocs = [{ id: 'l', type: 'bulletListItem', content: [], children: [titre('t', 3, [])] }]
  assert.deepEqual(titresDe(blocs), [{ cle: 't', niveau: 3, libelle: '' }])
})

test('sans titre, un plan vide ; un document vide ne casse rien', () => {
  assert.deepEqual(titresDe([]), [])
  assert.deepEqual(titresDe(undefined), [])
})
