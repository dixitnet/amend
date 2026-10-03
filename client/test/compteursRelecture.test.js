// Les compteurs de relecture du bandeau (03/10/2026) : « n ✏️, » pour les
// modifications en attente, « n 💬, » pour les passages commentés. Comme le
// compteur des « !! », un clic mène au suivant, en boucle.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { ySyncPlugin, prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import { addComment } from '../src/comments.js'
import { trackChangesPlugin, makeDispatchTransaction } from '../src/trackChanges.js'
import { mountChangesPanel } from '../src/changesPanel.js'
import { mountCompteursRelecture, suivantApres } from '../src/compteursRelecture.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }

function installerDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><body><div class="editor-container"><div id="editeur"></div></div><div id="panneau"></div><span id="modifs"></span><span id="comms"></span></body>',
    { url: 'http://localhost/', pretendToBeVisual: true }
  )
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent']) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  w.Element.prototype.scrollIntoView = () => {}
  return dom
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const clic = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }))

test('suivantApres : le suivant, puis on reboucle', () => {
  const l = [{ from: 5 }, { from: 20 }, { from: 40 }]
  assert.equal(suivantApres(l, -1).from, 5)
  assert.equal(suivantApres(l, 5).from, 20)
  assert.equal(suivantApres(l, 40).from, 5, 'au bout, retour au premier')
  assert.equal(suivantApres([], 0), null)
})

test('modifications : le compteur suit le panneau, et le clic fait tourner', async () => {
  installerDom()
  const modifs = document.getElementById('modifs')
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('alpha bravo charlie delta echo foxtrot')]),
  ])
  const state = EditorState.create({
    doc,
    plugins: [
      trackChangesPlugin({ enabled: true }),
      mountChangesPanel(document.getElementById('panneau'), { canReview: true }),
      mountCompteursRelecture({ modifications: modifs, commentaires: null }, { ydoc: new Y.Doc(), commentsMap: new Y.Doc().getMap('comments') }),
    ],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })

  assert.equal(modifs.textContent, '', 'rien à relire : rien d’affiché')
  assert.ok(!modifs.classList.contains('cliquable'))

  for (const [from, to] of [[27, 32], [14, 20], [1, 6]]) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
    view.dispatch(view.state.tr.delete(from, to))
  }
  await attendre(600)
  assert.equal(modifs.textContent, '3 ✏️,')
  assert.ok(modifs.classList.contains('cliquable'))
  assert.match(modifs.title, /3 modifications en attente/)

  const departs = []
  for (let i = 0; i < 4; i++) {
    clic(modifs)
    departs.push(view.state.selection.from)
  }
  assert.deepEqual(departs, [1, 14, 27, 1], `dans l'ordre du document, puis retour au premier : ${departs}`)
  view.destroy()
})

test('commentaires : le compteur compte les fils, pas les réponses, et le clic fait tourner', async () => {
  installerDom()
  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(
    schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Le zonage est un outil parmi d’autres, et il faut le redire.')])]),
    frag
  )
  const commentsMap = ydoc.getMap('comments')
  const comms = document.getElementById('comms')
  const state = EditorState.create({
    schema,
    plugins: [ySyncPlugin(frag), mountCompteursRelecture({ modifications: null, commentaires: comms }, { ydoc, commentsMap })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  assert.equal(comms.textContent, '')

  // On commente le second passage d'abord : l'ordre du document, pas celui de
  // création, décide du tour.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 30, 40)))
  addComment(view, ydoc, commentsMap, ALICE, 'Pourquoi ?')
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 10)))
  addComment(view, ydoc, commentsMap, ALICE, 'Ce mot est-il juste ?')
  const [premier] = [...commentsMap.keys()]
  commentsMap.set('reponse-1', { id: 'reponse-1', parent: premier, text: 'Oui.', user: 'Bruno', color: '#e07a5f', createdAt: Date.now() })
  await attendre(600)

  assert.equal(comms.textContent, '2 💬,', 'deux fils, la réponse ne compte pas')
  assert.match(comms.title, /2 passages commentés/)

  const departs = []
  for (let i = 0; i < 3; i++) {
    clic(comms)
    departs.push(view.state.selection.from)
  }
  assert.deepEqual(departs, [4, 30, 4])
  view.destroy()
})
