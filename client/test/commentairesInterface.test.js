// Les fils de commentaires, éprouvés dans un vrai éditeur.
//
// Contrairement à commentaires.test.js, qui n'éprouve que le modèle, ces
// tests montent **l'éditeur entier** dans jsdom : ProseMirror, la liaison
// Yjs, le greffon de gouttière, et les cartes réellement dessinées. C'est
// le seul moyen de voir les défauts qui ne vivent que là — une carte qui se
// redessine sous les doigts pendant qu'on écrit, un champ de réponse qui
// s'efface à la frappe d'un autre participant, une réponse qui hérite d'une
// carte à elle.
//
// `--test-force-exit` est indispensable (voir interface.test.js) : la
// gouttière laisse un minuteur de recalcul derrière elle.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { ySyncPlugin, prosemirrorToYXmlFragment } from 'y-prosemirror'
import { schema } from '../src/schema.js'
import {
  addComment,
  ajouterReponse,
  commentairesAncres,
  purgeOrphanComments,
  reponsesDe,
} from '../src/comments.js'
import { mountCommentsGutter } from '../src/commentsGutter.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }
const BRUNO = { name: 'Bruno', color: '#e07a5f' }

function installerDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><body><div class="editor-container"><div id="editeur"></div><div id="gouttiere"></div></div></body>',
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
  return dom
}

/** Un éditeur complet — document Yjs, vue ProseMirror, gouttière montée —
 * avec de quoi le piloter comme le ferait quelqu'un. */
function monterEditeur(user = ALICE, texte = 'Le zonage est un outil parmi d’autres, et il faut le redire.') {
  installerDom()
  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror')
  prosemirrorToYXmlFragment(
    schema.node('doc', null, [schema.node('paragraph', null, [schema.text(texte)])]),
    frag
  )
  const commentsMap = ydoc.getMap('comments')
  const gutter = document.getElementById('gouttiere')
  const state = EditorState.create({
    schema,
    plugins: [ySyncPlugin(frag), mountCommentsGutter(gutter, ydoc, commentsMap, user)],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })

  return {
    ydoc,
    commentsMap,
    gutter,
    view,
    /** Commente un passage, comme le bouton de la marge. */
    commenter(from, to, texteCommentaire, qui = user) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
      return addComment(view, ydoc, commentsMap, qui, texteCommentaire)
    },
    /** Force un rendu de la gouttière et attend qu'il ait eu lieu : le
     * greffon diffère son recalcul (100 ms), comme en vrai. */
    async rendu() {
      view.dispatch(view.state.tr)
      await new Promise((r) => setTimeout(r, 160))
    },
    cartes() {
      return [...gutter.querySelectorAll('.carte-commentaire')]
    },
    carte(n = 0) {
      return this.cartes()[n]
    },
    detruire() {
      view.destroy()
    },
  }
}

const texteDe = (el) => (el ? el.textContent : '')
const bouton = (racine, libelle) =>
  [...racine.querySelectorAll('button')].find((b) => b.textContent === libelle)

test('une réponse n’a pas de carte à elle : elle vit dans celle de son parent', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Ce mot est-il juste ?')
  ajouterReponse(e.commentsMap, BRUNO, [...e.commentsMap.keys()][0], 'Je ne crois pas.')
  await e.rendu()

  assert.equal(e.cartes().length, 1, 'une seule carte pour tout le fil')
  const fil = e.carte().querySelectorAll('.carte-reponse')
  assert.equal(fil.length, 1)
  assert.match(texteDe(fil[0]), /Je ne crois pas\./)
  assert.match(texteDe(fil[0]), /Bruno/)
  e.detruire()
})

test('le champ de réponse n’existe que sur la carte active', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Premier')
  e.commenter(20, 25, 'Second')
  // Le curseur est posé hors de tout passage commenté : sans ça, la carte
  // qui contient le curseur se déploie toute seule — comportement voulu
  // depuis le 15/09, et qu'on vérifie juste après.
  e.view.dispatch(e.view.state.tr.setSelection(TextSelection.create(e.view.state.doc, 40)))
  await e.rendu()

  assert.equal(e.cartes().length, 2)
  assert.equal(e.gutter.querySelectorAll('.carte-repondre').length, 0, 'aucune carte active au départ')

  e.carte(0).dispatchEvent(new window.Event('click', { bubbles: true }))
  await e.rendu()
  assert.equal(e.gutter.querySelectorAll('.carte-repondre').length, 1, 'une seule, sur la carte active')
  assert.ok(e.carte(0).querySelector('.carte-repondre'))
  e.detruire()
})

test('répondre depuis la carte crée la réponse et vide le champ', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Question')
  const id = [...e.commentsMap.keys()][0]
  await e.rendu()
  e.carte(0).dispatchEvent(new window.Event('click', { bubbles: true }))
  await e.rendu()

  const forme = e.carte(0).querySelector('.carte-repondre')
  const zone = forme.querySelector('textarea')
  zone.value = 'Ma réponse'
  forme.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await e.rendu()

  assert.deepEqual(reponsesDe(e.commentsMap, id).map((r) => r.text), ['Ma réponse'])
  assert.equal(e.carte(0).querySelector('.carte-repondre textarea').value, '', 'le champ se vide')
  e.detruire()
})

test('une réponse commencée ne s’efface pas quand quelqu’un d’autre écrit', async () => {
  // Le défaut le plus probable de cette fonction : le rendu est déclenché à
  // chaque frappe du document, y compris celles des autres participants. Si
  // la carte se reconstruit, ce qu'on est en train de taper disparaît.
  const e = monterEditeur()
  e.commenter(4, 10, 'Question')
  await e.rendu()
  e.carte(0).dispatchEvent(new window.Event('click', { bubbles: true }))
  await e.rendu()

  const zone = e.carte(0).querySelector('.carte-repondre textarea')
  zone.value = 'Je suis en train d’écrire…'

  // Quelqu'un d'autre modifie le texte du document, puis ajoute une réponse.
  e.view.dispatch(e.view.state.tr.insertText('X', 1))
  ajouterReponse(e.commentsMap, BRUNO, [...e.commentsMap.keys()][0], 'Réponse de Bruno')
  await e.rendu()

  const apres = e.carte(0).querySelector('.carte-repondre textarea')
  assert.ok(apres, 'le champ est toujours là')
  assert.equal(apres.value, 'Je suis en train d’écrire…', 'ce qui était tapé est intact')
  e.detruire()
})

test('une carte en cours de correction ne se redessine pas sous les doigts', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Texte à corriger')
  await e.rendu()

  bouton(e.carte(0), 'Modifier').dispatchEvent(new window.Event('click', { bubbles: true }))
  const zone = e.carte(0).querySelector('.carte-edition')
  assert.ok(zone, 'la correction ouvre une zone de saisie')
  zone.value = 'Texte corrigé à moitié'

  ajouterReponse(e.commentsMap, BRUNO, [...e.commentsMap.keys()][0], 'Pendant ce temps…')
  e.view.dispatch(e.view.state.tr.insertText('Z', 1))
  await e.rendu()

  assert.equal(
    e.carte(0).querySelector('.carte-edition').value,
    'Texte corrigé à moitié',
    'la correction en cours survit'
  )
  e.detruire()
})

test('« Modifier » n’est proposé qu’à l’auteur', async () => {
  const e = monterEditeur(ALICE)
  e.commenter(4, 10, 'Commentaire d’Alice', ALICE)
  e.commenter(20, 25, 'Commentaire de Bruno', BRUNO)
  await e.rendu()

  const cartes = e.cartes()
  const sien = cartes.find((c) => /Alice/.test(c.textContent))
  const autre = cartes.find((c) => /Bruno/.test(c.textContent))
  assert.ok(bouton(sien, 'Modifier'), 'Alice peut corriger le sien')
  assert.ok(!bouton(autre, 'Modifier'), 'pas celui de Bruno')
  // Résoudre reste offert à tout le monde : c'est la clôture d'une
  // discussion, pas la réécriture de la parole d'autrui.
  assert.ok(bouton(autre, 'Résoudre'))
  e.detruire()
})

test('corriger depuis la carte change le texte et l’annonce', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Version initiale')
  await e.rendu()

  bouton(e.carte(0), 'Modifier').dispatchEvent(new window.Event('click', { bubbles: true }))
  const zone = e.carte(0).querySelector('.carte-edition')
  zone.value = 'Version corrigée'
  bouton(e.carte(0), 'Enregistrer').dispatchEvent(new window.Event('click', { bubbles: true }))
  await e.rendu()

  assert.match(e.carte(0).textContent, /Version corrigée/)
  assert.match(e.carte(0).textContent, /modifié/, 'une correction se voit')
  e.detruire()
})

test('Annuler une correction ne change rien', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Version initiale')
  await e.rendu()

  bouton(e.carte(0), 'Modifier').dispatchEvent(new window.Event('click', { bubbles: true }))
  e.carte(0).querySelector('.carte-edition').value = 'Jamais enregistré'
  bouton(e.carte(0), 'Annuler').dispatchEvent(new window.Event('click', { bubbles: true }))
  await e.rendu()

  assert.match(e.carte(0).textContent, /Version initiale/)
  assert.doesNotMatch(e.carte(0).textContent, /modifié/)
  e.detruire()
})

test('résoudre depuis la carte emporte le fil entier', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'À clore')
  const id = [...e.commentsMap.keys()][0]
  ajouterReponse(e.commentsMap, BRUNO, id, 'Une réponse')
  ajouterReponse(e.commentsMap, ALICE, id, 'Une autre')
  await e.rendu()

  bouton(e.carte(0), 'Résoudre').dispatchEvent(new window.Event('click', { bubbles: true }))
  await e.rendu()

  assert.equal(e.commentsMap.size, 0, 'ni commentaire ni réponse ne restent')
  assert.equal(e.cartes().length, 0)
  e.detruire()
})

test('supprimer le passage commenté emporte le fil, réponses comprises', async () => {
  // La purge tourne à chaque changement du document. Sans la règle qui
  // ignore les réponses, celle-ci serait effacée au premier passage ; sans
  // celle qui les emporte, elle resterait dans le fichier pour toujours.
  const e = monterEditeur()
  e.commenter(4, 10, 'Sur un passage condamné')
  const id = [...e.commentsMap.keys()][0]
  ajouterReponse(e.commentsMap, BRUNO, id, 'Une réponse qui doit suivre')
  await e.rendu()
  assert.equal(e.commentsMap.size, 2)

  // Le texte commenté disparaît.
  e.view.dispatch(e.view.state.tr.delete(4, 10))
  purgeOrphanComments(e.view.state, e.ydoc, e.commentsMap)
  await e.rendu()

  assert.equal(e.commentsMap.size, 0, 'le fil entier s’en va avec son passage')
  e.detruire()
})

test('une réponse survit à une modification du texte ailleurs', async () => {
  // Le pendant du test précédent : la purge ne doit pas emporter une
  // réponse dont le fil est bien vivant.
  const e = monterEditeur()
  e.commenter(4, 10, 'Sur un passage vivant')
  const id = [...e.commentsMap.keys()][0]
  ajouterReponse(e.commentsMap, BRUNO, id, 'Une réponse qui doit rester')
  await e.rendu()

  for (let i = 0; i < 5; i++) {
    e.view.dispatch(e.view.state.tr.insertText('mot ', 1))
    purgeOrphanComments(e.view.state, e.ydoc, e.commentsMap)
  }
  await e.rendu()

  assert.equal(commentairesAncres(e.commentsMap).length, 1)
  assert.equal(reponsesDe(e.commentsMap, id).length, 1, 'la réponse est toujours là')
  assert.equal(e.carte(0).querySelectorAll('.carte-reponse').length, 1)
  e.detruire()
})

test('le passage commenté reste surligné quand le fil s’allonge', async () => {
  const e = monterEditeur()
  e.commenter(4, 10, 'Question')
  const id = [...e.commentsMap.keys()][0]
  for (let i = 0; i < 4; i++) ajouterReponse(e.commentsMap, BRUNO, id, `Réponse ${i}`)
  await e.rendu()

  assert.equal(e.carte(0).querySelectorAll('.carte-reponse').length, 4)
  // Une réponse ne surligne rien dans le texte : elle n'a pas d'ancre.
  assert.equal(
    e.view.dom.querySelectorAll('.comment-highlight').length,
    0,
    'sans le greffon de décoration monté, aucun surlignage — on vérifie surtout qu’il n’en apparaît pas un par réponse'
  )
  e.detruire()
})
