// Le composeur de commentaires au doigt et le greffon du petit écran
// (client/src/composeurTactile.js), sortis de `mountEditor` le 13/10/2026.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { ySyncPlugin, prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import { ouvrirComposeurTactile, tactilePlugin } from '../src/composeurTactile.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }
const para = (t) => schema.node('paragraph', null, [schema.text(t)])

/** `petit` : l'écran est-il un téléphone (la requête des 700 px répond oui). */
function monter({ petit = true, plugins = () => [] } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="e"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.history = w.history
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent']) globalThis[k] = w[k]
  w.matchMedia = (requete) => ({ matches: petit && /max-width: 700px/.test(requete), media: requete, addEventListener() {}, removeEventListener() {} })
  globalThis.matchMedia = w.matchMedia
  w.Element.prototype.scrollIntoView = function () {}
  w.Range.prototype.getClientRects = () => []
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })

  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(schema.node('doc', null, [para('Bonjour tout le monde.')]), frag)
  const commentsMap = ydoc.getMap('commentaires')
  const state = EditorState.create({ schema, plugins: [ySyncPlugin(frag), ...plugins({ ydoc, commentsMap })] })
  const view = new EditorView(document.getElementById('e'), { state })
  view.coordsAtPos = () => ({ left: 0, right: 0, top: 0, bottom: 0 })
  const selectionner = (from, to = from) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  return { view, ydoc, commentsMap, selectionner }
}

const feuille = () => document.querySelector('.feuille')

test('sans passage sélectionné, le composeur n’ouvre rien', () => {
  const e = monter()
  e.selectionner(3)
  ouvrirComposeurTactile({ view: e.view, ydoc: e.ydoc, commentsMap: e.commentsMap, user: ALICE })
  assert.equal(feuille(), null)
})

test('le composeur s’ouvre en feuille modale et envoie le commentaire sur le passage choisi', () => {
  const e = monter()
  e.selectionner(1, 8)
  ouvrirComposeurTactile({ view: e.view, ydoc: e.ydoc, commentsMap: e.commentsMap, user: ALICE })
  assert.ok(feuille(), 'une feuille')
  const zone = feuille().querySelector('textarea[name="commentaire"]')
  assert.ok(zone)
  assert.equal(feuille().querySelector('button[type="submit"]').textContent, 'Commenter')

  zone.value = 'À reprendre.'
  feuille().querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  assert.equal(e.commentsMap.size, 1)
  const [c] = [...e.commentsMap.values()]
  assert.equal(c.text, 'À reprendre.')
  assert.equal(c.author, 'Alice')
  assert.equal(feuille(), null, 'la feuille se ferme')
})

test('un commentaire vide n’est pas envoyé, la feuille reste ouverte', () => {
  const e = monter()
  e.selectionner(1, 8)
  ouvrirComposeurTactile({ view: e.view, ydoc: e.ydoc, commentsMap: e.commentsMap, user: ALICE })
  feuille().querySelector('textarea').value = '   '
  feuille().querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  assert.equal(e.commentsMap.size, 0)
  assert.ok(feuille())
})

test('la sélection a bougé pendant l’écriture : le commentaire reste sur le passage du geste', () => {
  const e = monter()
  e.selectionner(1, 8)
  ouvrirComposeurTactile({ view: e.view, ydoc: e.ydoc, commentsMap: e.commentsMap, user: ALICE })
  e.selectionner(10, 15) // quelqu'un d'autre a fait bouger la sélection
  feuille().querySelector('textarea').value = 'Ici.'
  feuille().querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  assert.equal(e.commentsMap.size, 1)
  assert.deepEqual([e.view.state.selection.from, e.view.state.selection.to], [1, 8])
})

test('le greffon : appelle surMiseAJour à chaque changement d’état, ne prend jamais le clic', () => {
  let misesAJour = 0
  const e = monter({ plugins: ({ ydoc, commentsMap }) => [tactilePlugin({ ydoc, commentsMap, user: ALICE, surMiseAJour: () => misesAJour++ })] })
  const avant = misesAJour
  e.selectionner(2)
  assert.ok(misesAJour > avant)
  const plugin = e.view.state.plugins.at(-1)
  assert.equal(plugin.props.handleClick(e.view, 3), false, 'le clic passe toujours au texte')
})

test('le greffon ne s’occupe pas du clic sur un grand écran', () => {
  const e = monter({ petit: false, plugins: ({ ydoc, commentsMap }) => [tactilePlugin({ ydoc, commentsMap, user: ALICE, surMiseAJour() {} })] })
  assert.equal(e.view.state.plugins.at(-1).props.handleClick(e.view, 3), false)
})
