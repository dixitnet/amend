// Raccourcis Markdown à la saisie (client/src/markdownShortcuts.js) : taper
// « ## », « - », « 1. », « [] » ou « > » en début de ligne transforme le
// bloc, **sans** laisser le préfixe barré sous suivi des modifications.

import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from 'prosemirror-state'
import { markdownShortcutsPlugin } from '../src/markdownShortcuts.js'
import { schema, doc, UTILISATEUR } from './harness.js'
import { trackChangesPlugin, makeDispatchTransaction } from '../src/trackChanges.js'

/** Un éditeur dont le curseur est à `offset` dans le premier bloc, avec le
 * suivi des modifications actif — le cas où le contournement compte. */
function monter(document, offset = null, { suivi = true } = {}) {
  const plugin = markdownShortcutsPlugin(schema)
  let state = EditorState.create({ doc: document, plugins: [trackChangesPlugin({ enabled: suivi }), plugin] })
  const fin = offset ?? document.firstChild.content.size
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + fin)))
  const view = {
    get state() { return state },
    updateState(s) { state = s },
    dispatch(tr) { dispatcher(tr) },
  }
  const dispatcher = makeDispatchTransaction(view, () => UTILISATEUR, { peutModifierLibrement: () => true })
  return {
    view,
    get state() { return state },
    /** Tape `texte` : renvoie vrai si le raccourci a pris la main. */
    taper(texte) {
      const { from, to } = state.selection
      return Boolean(plugin.props.handleTextInput(view, from, to, texte))
    },
  }
}

const premier = (e) => e.state.doc.firstChild
const sansMarques = (e) => {
  let marque = false
  e.state.doc.descendants((n) => { if (n.marks.some((m) => ['insertion', 'deletion'].includes(m.type.name))) marque = true })
  return !marque
}

test('« ## » + espace : un titre de niveau 2, sans préfixe barré', () => {
  const e = monter(doc('##'))
  assert.equal(e.taper(' '), true)
  assert.equal(premier(e).type.name, 'heading')
  assert.equal(premier(e).attrs.level, 2)
  assert.equal(premier(e).textContent, '')
  assert.ok(sansMarques(e), 'aucune suppression marquée sous suivi')
})

test('trois niveaux seulement : « #### » n’est plus un titre', () => {
  assert.equal(monter(doc('###')).taper(' '), true)
  assert.equal(monter(doc('####')).taper(' '), false)
})

test('« - », « * » et « + » : une liste à puces', () => {
  for (const c of ['-', '*', '+']) {
    const e = monter(doc(c))
    assert.equal(e.taper(' '), true, c)
    assert.equal(premier(e).type.name, 'bullet_list', c)
  }
})

test('« 3. » + espace : une liste numérotée qui commence à 3', () => {
  const e = monter(doc('3.'))
  assert.equal(e.taper(' '), true)
  assert.equal(premier(e).type.name, 'ordered_list')
  assert.equal(premier(e).attrs.order, 3)
  const f = monter(doc('2)'))
  assert.equal(f.taper(' '), true)
  assert.equal(premier(f).attrs.order, 2)
})

test('« [] » donne une case à cocher vide, « [x] » une case cochée', () => {
  const vide = monter(doc('[]'))
  assert.equal(vide.taper(' '), true)
  assert.equal(premier(vide).type.name, 'task_list')
  assert.equal(premier(vide).firstChild.attrs.checked, false)

  const cochee = monter(doc('[x]'))
  assert.equal(cochee.taper(' '), true)
  assert.equal(premier(cochee).firstChild.attrs.checked, true)
})

test('« > » + espace : une citation', () => {
  const e = monter(doc('>'))
  assert.equal(e.taper(' '), true)
  assert.equal(premier(e).type.name, 'blockquote')
})

test('ce qui n’est pas un raccourci passe son chemin', () => {
  assert.equal(monter(doc('texte')).taper(' '), false)
  assert.equal(monter(doc('-')).taper('x'), false, 'le motif veut une espace')
  assert.equal(monter(doc('a -')).taper(' '), false, 'seulement en début de bloc')
})

test('dans un titre ou une sélection non vide, rien ne se déclenche', () => {
  assert.equal(monter(doc({ h: 1, texte: '##' })).taper(' '), false)
  const e = monter(doc('##'))
  e.view.updateState(e.state.apply(e.state.tr.setSelection(TextSelection.create(e.state.doc, 1, 3))))
  assert.equal(e.taper(' '), false)
})

test('dans une liste, « - » reste un tiret : pas de liste imbriquée', () => {
  const liste = schema.node('doc', null, [
    schema.node('bullet_list', null, [schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('-')])])]),
  ])
  const plugin = markdownShortcutsPlugin(schema)
  let state = EditorState.create({ doc: liste, plugins: [plugin] })
  // doc > bullet_list > list_item > paragraph : le texte commence en 3, « - » finit en 4.
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)))
  const view = { get state() { return state }, dispatch: () => assert.fail('aucune transformation attendue') }
  assert.equal(Boolean(plugin.props.handleTextInput(view, 4, 4, ' ')), false)
})
