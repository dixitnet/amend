// Les raccourcis clavier (client/src/raccourcis.js), sortis de `mountEditor`
// le 13/10/2026 : on envoie de vraies touches à une vraie vue ProseMirror
// (dans jsdom), avec le seul greffon des raccourcis et le clavier de base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { schema } from '../src/schema.js'
import { trackChangesPlugin } from '../src/trackChanges.js'
import { raccourcisClavier } from '../src/raccourcis.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }

function monter(doc, { debut, fin = debut, suivi = false, peutPoser = true } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="e"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent']) globalThis[k] = w[k]
  w.Range.prototype.getClientRects = () => []
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })
  const refus = []
  let state = EditorState.create({
    doc,
    schema,
    plugins: [trackChangesPlugin({ enabled: suivi }), raccourcisClavier({ user: ALICE, peutPoserLien: () => peutPoser, surRefusLien: () => refus.push(1) }), keymap(baseKeymap)],
  })
  state = state.apply(state.tr.setSelection(TextSelection.create(doc, debut, fin)))
  const view = new EditorView(document.getElementById('e'), { state })
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 })
  const touche = (key, options = {}) => {
    const evt = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
    let pris = false
    view.someProp('handleKeyDown', (f) => (pris = f(view, evt)))
    return pris
  }
  return { view, touche, refus }
}

const para = (t) => schema.node('paragraph', null, [schema.text(t)])
const doc = (...b) => schema.node('doc', null, b)

test('Ctrl-B, Ctrl-I et Ctrl-U posent gras, italique et souligné sur la sélection', () => {
  const e = monter(doc(para('Bonjour')), { debut: 1, fin: 8 })
  for (const [key, marque] of [['b', 'strong'], ['i', 'em'], ['u', 'underline']]) {
    assert.equal(e.touche(key, { ctrlKey: true }), true, key)
    assert.ok(e.view.state.doc.rangeHasMark(1, 8, schema.marks[marque]), marque)
  }
})

test('Ctrl-Alt-F pose une note dans un paragraphe', () => {
  const e = monter(doc(para('Bonjour')), { debut: 4 })
  assert.equal(e.touche('f', { ctrlKey: true, altKey: true }), true)
  let notes = 0
  e.view.state.doc.descendants((n) => {
    if (n.type.name === 'footnote') notes++
  })
  assert.equal(notes, 1)
})

test('Ctrl-K sans le droit de poser un lien : le refus est signalé, rien ne change', () => {
  const e = monter(doc(para('Bonjour')), { debut: 1, fin: 8, peutPoser: false })
  e.touche('k', { ctrlKey: true })
  assert.equal(e.refus.length, 1)
  assert.ok(!e.view.state.doc.rangeHasMark(1, 8, schema.marks.link))
})

test('Entrée dans un élément de liste le coupe ; Tab hors tableau n’est pas pris (la tabulation du navigateur reste)', () => {
  const liste = schema.node('bullet_list', null, [schema.node('list_item', null, [para('Un deux')])])
  const e = monter(doc(liste), { debut: 5 })
  assert.equal(e.touche('Enter'), true)
  assert.equal(e.view.state.doc.child(0).childCount, 2, 'deux éléments')
  assert.equal(e.touche('Tab'), false)
})

test('Retour arrière en suivi : le texte effacé reste à l’écran, barré, au nom de la personne', () => {
  const e = monter(doc(para('Bonjour')), { debut: 4, suivi: true })
  assert.equal(e.touche('Backspace'), true)
  const texte = e.view.state.doc.textContent
  assert.equal(texte, 'Bonjour', 'rien n’a disparu')
  let suppression = null
  e.view.state.doc.descendants((n) => {
    for (const m of n.marks) if (m.type.name === 'deletion') suppression = m
  })
  assert.ok(suppression, 'une marque de suppression suivie')
  assert.equal(suppression.attrs.user, 'Alice')
})

test('Retour arrière hors suivi, au milieu d’un mot : pas pris — c’est le navigateur qui efface le caractère', () => {
  const e = monter(doc(para('Bonjour')), { debut: 4, suivi: false })
  assert.equal(e.touche('Backspace'), false)
  assert.equal(e.view.state.doc.textContent, 'Bonjour')
})

test('Retour arrière en début de bloc, hors suivi : la fusion avec le bloc précédent reste prise en charge', () => {
  const e = monter(doc(para('Un'), para('Deux')), { debut: 5, suivi: false })
  assert.equal(e.touche('Backspace'), true)
  assert.equal(e.view.state.doc.childCount, 1)
  assert.equal(e.view.state.doc.textContent, 'UnDeux')
})
