// Relire et commenter au doigt, dans un vrai éditeur (jsdom).
//
// Ces tests portent sur les deux renversements du petit écran : la carte
// n'est plus posée dans une marge mais convoquée par le texte, et la
// relecture n'est plus une liste mais un parcours.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { ySyncPlugin, prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction, listChanges } from '../src/trackChanges.js'
import { addComment, ajouterReponse, reponsesDe } from '../src/comments.js'
import { ouvrirFilCommentaire, monterBarreRelecture, monterBoutonCommenter } from '../src/relectureTactile.js'
import { fermerFeuille } from '../src/feuille.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }
const BRUNO = { name: 'Bruno', color: '#e07a5f' }

function installerDom({ petit = true } = {}) {
  const dom = new JSDOM(
    '<!DOCTYPE html><body><div class="editor-container"><div id="editeur"></div></div></body>',
    { url: 'http://localhost/', pretendToBeVisual: true }
  )
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.history = w.history
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent', 'getComputedStyle']) {
    globalThis[k] = w[k]
  }
  w.matchMedia = (requete) => ({ matches: petit && /max-width: 700px/.test(requete), media: requete, addEventListener() {}, removeEventListener() {} })
  globalThis.matchMedia = w.matchMedia
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  w.Element.prototype.scrollIntoView = function () {}
  return w
}

const TEXTE = 'Le zonage a longtemps servi de boussole à l’aménagement des territoires.'

function editeurCommente(user = ALICE) {
  installerDom()
  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(
    schema.node('doc', null, [schema.node('paragraph', null, [schema.text(TEXTE)])]),
    frag
  )
  const commentsMap = ydoc.getMap('comments')
  const state = EditorState.create({ schema, plugins: [ySyncPlugin(frag)] })
  const view = new EditorView(document.getElementById('editeur'), { state })
  return { ydoc, commentsMap, view, user }
}

const feuille = () => document.querySelector('.feuille')

test('le fil d’un commentaire s’ouvre en feuille, réponses comprises', () => {
  const e = editeurCommente()
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 4, 10)))
  addComment(e.view, e.ydoc, e.commentsMap, ALICE, 'Ce mot est-il juste ?')
  const id = [...e.commentsMap.keys()][0]
  ajouterReponse(e.commentsMap, BRUNO, id, 'Je ne crois pas.')

  ouvrirFilCommentaire(e.view, e.ydoc, e.commentsMap, ALICE, id)
  assert.ok(feuille(), 'la feuille monte')
  assert.match(feuille().textContent, /Ce mot est-il juste \?/)
  assert.match(feuille().textContent, /Je ne crois pas\./)
  assert.match(feuille().textContent, /Bruno/)
  assert.ok(feuille().querySelector('.feuille-repondre textarea'), 'et l’on peut répondre')
  fermerFeuille()
})

test('répondre depuis la feuille ajoute au même fil', () => {
  const e = editeurCommente()
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 4, 10)))
  addComment(e.view, e.ydoc, e.commentsMap, ALICE, 'Question')
  const id = [...e.commentsMap.keys()][0]
  ouvrirFilCommentaire(e.view, e.ydoc, e.commentsMap, BRUNO, id)

  const forme = feuille().querySelector('.feuille-repondre')
  forme.querySelector('textarea').value = 'Ma réponse depuis le téléphone'
  forme.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))

  assert.deepEqual(reponsesDe(e.commentsMap, id).map((r) => r.text), ['Ma réponse depuis le téléphone'])
  fermerFeuille()
})

test('une réponse en cours d’écriture n’est pas effacée par l’arrivée d’une autre', () => {
  // Même garde que dans la marge : le fil se redessine à chaque changement,
  // y compris venu de quelqu'un d'autre.
  const e = editeurCommente()
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 4, 10)))
  addComment(e.view, e.ydoc, e.commentsMap, ALICE, 'Question')
  const id = [...e.commentsMap.keys()][0]
  ouvrirFilCommentaire(e.view, e.ydoc, e.commentsMap, ALICE, id)

  const zone = feuille().querySelector('.feuille-repondre textarea')
  zone.value = 'Je suis en train d’écrire…'
  ajouterReponse(e.commentsMap, BRUNO, id, 'Réponse de Bruno')

  assert.equal(
    feuille().querySelector('.feuille-repondre textarea').value,
    'Je suis en train d’écrire…'
  )
  fermerFeuille()
})

test('résoudre le fil ferme la feuille : elle n’a plus d’objet', () => {
  const e = editeurCommente()
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 4, 10)))
  addComment(e.view, e.ydoc, e.commentsMap, ALICE, 'À clore')
  const id = [...e.commentsMap.keys()][0]
  ouvrirFilCommentaire(e.view, e.ydoc, e.commentsMap, ALICE, id)

  const resoudre = [...feuille().querySelectorAll('button')].find((b) => b.textContent === 'Résoudre')
  resoudre.dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(document.querySelectorAll('.feuille').length, 0)
  assert.equal(e.commentsMap.size, 0)
})

// ===================================================== la relecture

function editeurEnSuivi() {
  installerDom()
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('alpha bravo charlie delta echo foxtrot golf')]),
  ])
  const state = EditorState.create({ doc, plugins: [trackChangesPlugin({ enabled: true })] })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  for (const [from, to] of [[27, 32], [14, 20], [1, 6]]) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
    view.dispatch(view.state.tr.delete(from, to))
  }
  return view
}

const btn = (el, libelle) => [...el.querySelectorAll('button')].find((b) => b.textContent === libelle)

test('la barre annonce la position dans le parcours, pas une liste', () => {
  const view = editeurEnSuivi()
  const barre = monterBarreRelecture(() => view)
  document.body.appendChild(barre.el)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
  barre.rendre()

  assert.equal(barre.el.hidden, false)
  assert.match(barre.el.querySelector('.barre-relecture-position').textContent, /^1 \/ 3$/)
})

test('les flèches avancent et bouclent', () => {
  const view = editeurEnSuivi()
  const barre = monterBarreRelecture(() => view)
  document.body.appendChild(barre.el)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
  barre.rendre()

  const position = () => barre.el.querySelector('.barre-relecture-position').textContent
  btn(barre.el, '›').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(position(), '2 / 3')
  btn(barre.el, '›').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(position(), '3 / 3')
  btn(barre.el, '›').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(position(), '1 / 3', 'la dernière ramène à la première')
  btn(barre.el, '‹').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(position(), '3 / 3', 'et en arrière aussi')
})

test('accepter fait descendre à la suivante, et le compte diminue', () => {
  const view = editeurEnSuivi()
  const barre = monterBarreRelecture(() => view)
  document.body.appendChild(barre.el)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
  barre.rendre()

  const avant = view.state.selection.from
  btn(barre.el, 'Accepter').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(listChanges(view.state.doc).length, 2)
  assert.ok(view.state.selection.from >= avant, 'on ne remonte jamais')
  assert.match(barre.el.querySelector('.barre-relecture-position').textContent, /\/ 2$/)
})

test('la barre disparaît quand il n’y a plus rien à relire', () => {
  const view = editeurEnSuivi()
  const barre = monterBarreRelecture(() => view)
  document.body.appendChild(barre.el)
  for (let i = 0; i < 3; i++) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
    barre.rendre()
    btn(barre.el, 'Accepter').dispatchEvent(new window.Event('click', { bubbles: true }))
  }
  barre.rendre()
  assert.equal(listChanges(view.state.doc).length, 0)
  assert.equal(barre.el.hidden, true)
})

test('un correcteur n’a ni Accepter ni Rejeter, mais garde le parcours', () => {
  const view = editeurEnSuivi()
  const barre = monterBarreRelecture(() => view, { canReview: false })
  document.body.appendChild(barre.el)
  barre.rendre()
  assert.ok(!btn(barre.el, 'Accepter'))
  assert.ok(!btn(barre.el, 'Rejeter'))
  assert.ok(btn(barre.el, '›'), 'il peut toujours relire ce qu’il a proposé')
})

// ===================================================== le bouton Commenter

test('le bouton Commenter ne paraît que sur une sélection, et seulement en petit écran', () => {
  const view = editeurEnSuivi()
  const conteneur = document.querySelector('.editor-container')
  const c = monterBoutonCommenter(conteneur, () => view, () => {})

  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
  c.placer()
  assert.equal(c.bouton.hidden, true, 'curseur simple : rien')

  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
  c.placer()
  assert.equal(c.bouton.hidden, false, 'sélection : le bouton paraît')

  // Sur grand écran, c'est la marge qui s'en charge.
  window.matchMedia = () => ({ matches: false })
  globalThis.matchMedia = window.matchMedia
  c.placer()
  assert.equal(c.bouton.hidden, true)
})
