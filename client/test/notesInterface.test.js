// La fenêtre d'une note, dans un DOM (jsdom) : cliquer l'appel l'ouvre,
// ce qu'on y tape entre dans le document, le document la met à jour, et le
// suivi passe par la même porte que le reste (28/09/2026). Avec Yjs
// dessous, comme en vrai : c'est lui qui a décidé du modèle (les marques
// d'un nœud non texte ne se synchronisent pas, d'où l'attribut `suivi`).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { ySyncPlugin, prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import { footnotesPlugin, insererNote, monterListeDesNotes } from '../src/footnotes.js'
import { trackChangesPlugin, makeDispatchTransaction, listChanges, setTrackChangesEnabled } from '../src/trackChanges.js'
import { notesDuDocument } from '../src/notes.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div class="editor-main"><div class="editor-container"><div id="editeur"></div></div></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent', 'MouseEvent']) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  return dom
}

function monter({ suivi = false, texte = 'Un texte suivi.' } = {}) {
  installerDom()
  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(schema.node('doc', null, [schema.node('paragraph', null, [schema.text(texte)])]), frag)
  const main = document.querySelector('.editor-main')
  let liste
  const state = EditorState.create({
    schema,
    plugins: [ySyncPlugin(frag), trackChangesPlugin({ enabled: suivi }), footnotesPlugin(() => ALICE, { surChangement: (v) => liste && liste.rafraichir(v) })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  liste = monterListeDesNotes(main, () => view)
  liste.rafraichir(view)
  return {
    view,
    ydoc,
    frag,
    liste,
    appel: () => document.querySelector('.note-appel'),
    fenetre: () => document.querySelector('.note-fenetre'),
    /** Ce que voit un autre client : le document reconstruit depuis Yjs. */
    vuParUnAutre: () => yXmlFragmentToProseMirrorRootNode(frag, schema),
    attendre: () => new Promise((r) => setTimeout(r, 5)),
  }
}

test('insérer une note ouvre sa fenêtre ; ce qu’on y tape entre dans le document et dans Yjs', async () => {
  const e = monter()
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 3)))
  assert.ok(insererNote(e.view, ALICE))
  await e.attendre()
  assert.ok(e.appel(), 'l’appel est rendu')
  assert.ok(e.fenetre(), 'la fenêtre s’est ouverte')
  assert.ok(e.fenetre().querySelector('.ProseMirror'))
  // Taper dans la fenêtre : on passe par sa vue ProseMirror.
  const vueInterne = e.fenetre().vueInterne
  vueInterne.dispatch(vueInterne.state.tr.insertText('Ma note'))
  assert.equal(e.view.state.doc.nodeAt(3).textContent, 'Ma note')
  assert.equal(e.vuParUnAutre().nodeAt(3).textContent, 'Ma note', 'Yjs porte la note')
  // La liste de fin la montre.
  assert.match(e.liste.el.textContent, /Ma note/)
  assert.equal(e.liste.el.hidden, false)
})

test('le document met la fenêtre à jour, et la fermer rend le focus au texte', async () => {
  const e = monter()
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 3)))
  insererNote(e.view, ALICE)
  await e.attendre()
  // Une modification venue du document (un autre client, l'IA…).
  e.view.dispatch(e.view.state.tr.insertText('Venu du dehors', 4, 4))
  const interne = e.fenetre().vueInterne
  assert.equal(interne.state.doc.textContent, 'Venu du dehors')
  e.fenetre().querySelector('.note-fenetre-fermer').click()
  assert.equal(e.fenetre(), null)
  // Cliquer l'appel la rouvre.
  e.appel().dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  assert.ok(e.fenetre())
})

test('en suivi : la note naît proposée, son texte fait partie de la proposition, et Yjs garde l’attente', async () => {
  const e = monter({ suivi: true })
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 3)))
  insererNote(e.view, ALICE)
  await e.attendre()
  assert.ok(e.appel().classList.contains('note-inseree'))
  const interne = e.fenetre().vueInterne
  interne.dispatch(interne.state.tr.insertText('Proposée'))
  const l = listChanges(e.view.state.doc)
  assert.equal(l.length, 1, 'une seule proposition : la note entière')
  assert.equal(l[0].noeud, 'note')
  assert.equal(l[0].text, 'Note : Proposée')
  const autre = e.vuParUnAutre()
  assert.equal(autre.nodeAt(3).attrs.suivi.type, 'insertion', 'l’attente voyage dans Yjs')
  assert.equal(autre.nodeAt(3).textContent, 'Proposée')
})

test('une note sans attente : taper dedans est suivi mot à mot', async () => {
  const e = monter({ suivi: false })
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 3)))
  insererNote(e.view, ALICE)
  await e.attendre()
  let interne = e.fenetre().vueInterne
  interne.dispatch(interne.state.tr.insertText('Acceptée'))
  e.fenetre().querySelector('.note-fenetre-fermer').click()
  // On passe en suivi et on ajoute un mot dans la note.
  setTrackChangesEnabled(e.view, true)
  e.appel().dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  interne = e.fenetre().vueInterne
  interne.dispatch(interne.state.tr.insertText(' plus', interne.state.doc.content.size, interne.state.doc.content.size))
  const l = listChanges(e.view.state.doc)
  assert.deepEqual(l.map((c) => [c.type, c.text]), [['insertion', ' plus']])
  assert.equal(notesDuDocument(e.view.state.doc)[0].node.textContent, 'Acceptée plus')
})
