// En suivi des modifications, un geste qu'on ne sait pas suivre et qui ferait
// disparaître du texte est refusé — à un éditeur aussi (02/11/2026, campagne
// de tests de l'éditeur, famille A du diagnostic). Avant, sélection puis
// Entrée effaçait le texte sélectionné pour de bon, sans trace.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TextSelection } from 'prosemirror-state'
import { splitBlock, joinBackward, setBlockType } from 'prosemirror-commands'
import { editeur, doc, schema } from './harness.js'
import { effaceDuTexte } from '../src/suivi/greffons.js'

const refusCollecteur = () => {
  const refus = []
  return { refus, surRefus: (_tr, raison) => refus.push(raison) }
}

test('éditeur en suivi : sélection puis Entrée est refusé, le texte reste', () => {
  const { refus, surRefus } = refusCollecteur()
  const e = editeur(doc('Le chat noir dort.'), { surRefus })
  e.selection(9, 13) // « noir »
  splitBlock(e.state, e.view.dispatch)
  assert.deepEqual(refus, ['texte'])
  assert.equal(e.texte(), 'Le chat noir dort.')
  assert.equal(e.nbBlocs(), 1)
})

test('correcteur en suivi : sélection puis Entrée reste refusé (raison : rôle)', () => {
  const { refus, surRefus } = refusCollecteur()
  const c = editeur(doc('Le chat noir dort.'), { libre: false, surRefus })
  c.selection(9, 13)
  splitBlock(c.state, c.view.dispatch)
  assert.deepEqual(refus, ['role'])
  assert.equal(c.texte(), 'Le chat noir dort.')
})

test('éditeur en suivi : Entrée sans sélection reste suivie (coupure en attente)', () => {
  const { refus, surRefus } = refusCollecteur()
  const e = editeur(doc('Le chat noir dort.'), { surRefus })
  e.selection(13)
  splitBlock(e.state, e.view.dispatch)
  assert.deepEqual(refus, [])
  assert.equal(e.nbBlocs(), 2)
  assert.equal(e.sautsEnAttente(), 1)
})

test('éditeur en suivi : les gestes de structure qui n’effacent rien passent', () => {
  const { refus, surRefus } = refusCollecteur()
  const e = editeur(doc('Un.', 'Deux.'), { surRefus })
  // Recoller deux paragraphes (retour arrière en début de bloc).
  e.selection(6)
  joinBackward(e.state, e.view.dispatch)
  assert.equal(e.nbBlocs(), 1)
  // Passer en titre.
  e.selection(2)
  setBlockType(schema.nodes.heading, { level: 1 })(e.state, e.view.dispatch)
  assert.equal(e.doc.child(0).type.name, 'heading')
  assert.deepEqual(refus, [])
})

test('hors suivi : sélection puis Entrée remplace la sélection, comme avant', () => {
  const { refus, surRefus } = refusCollecteur()
  const e = editeur(doc('Le chat noir dort.'), { suivi: false, surRefus })
  e.selection(9, 13)
  splitBlock(e.state, e.view.dispatch)
  assert.deepEqual(refus, [])
  assert.equal(e.texte(), 'Le chat \n dort.')
})

test('effaceDuTexte : texte retiré oui, bornes de blocs non', () => {
  const d = doc('Un.', 'Deux.')
  const base = editeur(d).state
  assert.equal(effaceDuTexte(base.tr.delete(1, 3)), true)
  assert.equal(effaceDuTexte(base.tr.join(5)), false)
  assert.equal(effaceDuTexte(base.tr.split(2)), false)
  const sel = base.tr.setSelection(TextSelection.create(d, 1, 3))
  assert.equal(effaceDuTexte(sel.deleteSelection()), true)
})
