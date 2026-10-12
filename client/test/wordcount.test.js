// Compteur de mots et de signes (client/src/wordcount.js) : le total est
// tenu à jour **incrémentalement**, et ne doit jamais s'écarter d'un
// recomptage complet.

import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from 'prosemirror-state'
import { countText, mountWordCount } from '../src/wordcount.js'
import { doc, schema } from './harness.js'

const total = (d) => countText(d, 0, d.content.size)

test('countText : mots et signes, espaces compris', () => {
  assert.deepEqual(total(doc('Bonjour tout le monde')), { chars: 21, words: 4 })
  assert.deepEqual(total(doc('')), { chars: 0, words: 0 })
  assert.deepEqual(total(doc('  ')), { chars: 2, words: 0 })
})

test('countText : deux paragraphes voisins ne fusionnent pas leurs mots', () => {
  const d = doc('fin', 'début')
  assert.equal(total(d).words, 2)
  assert.equal(total(d).chars, 8, 'et aucun signe n’est ajouté à la frontière')
})

test('le total incrémental suit le recomptage complet à travers une série de modifications', () => {
  const container = { textContent: '' }
  const plugin = mountWordCount(container)
  let etat = EditorState.create({ doc: doc('Un premier paragraphe', 'Un second', { h: 1, texte: 'Titre du document' }), plugins: [plugin] })
  const verifier = (quoi) => {
    const attendu = total(etat.doc)
    assert.deepEqual(plugin.getState(etat), attendu, quoi)
  }
  verifier('état initial')

  etat = etat.apply(etat.tr.insertText(' et plus', 22))
  verifier('insertion à la fin d’un paragraphe')

  etat = etat.apply(etat.tr.delete(1, 7))
  verifier('suppression en début de paragraphe')

  etat = etat.apply(etat.tr.split(5))
  verifier('coupure d’un paragraphe en deux')

  etat = etat.apply(etat.tr.join(etat.doc.child(0).nodeSize))
  verifier('fusion de deux paragraphes')

  etat = etat.apply(etat.tr.replaceWith(0, etat.doc.content.size, [schema.node('paragraph', null, [schema.text('tout remplacé ici')])]))
  verifier('remplacement du document entier')

  etat = etat.apply(etat.tr.delete(0, etat.doc.content.size))
  verifier('document vidé')
})

/** Monte le compteur sur un état et renvoie le texte du premier rendu. */
function afficher(document, selection = null) {
  const container = { textContent: '' }
  const plugin = mountWordCount(container)
  const etat = EditorState.create({
    doc: document,
    plugins: [plugin],
    selection: selection ? TextSelection.create(document, selection[0], selection[1]) : undefined,
  })
  const instance = plugin.spec.view({ state: etat })
  instance.destroy()
  return container.textContent
}

test('l’affichage : singulier et pluriel', () => {
  assert.equal(afficher(doc('un', 'deux mots')), '3 mots, 11 signes')
  assert.equal(afficher(doc('x')), '1 mot, 1 signe')
  assert.equal(afficher(doc('')), '0 mot, 0 signe')
})

test('une sélection non vide prend le pas sur le total', () => {
  assert.equal(afficher(doc('bonjour le monde'), [1, 8]), 'Sélection : 1 mot, 7 signes')
})
