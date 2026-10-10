// Les commentaires pendant qu'une modification distante s'applique (10/10/2026).
//
// Relevé dans la console de Chrome, en production :
//   Uncaught TypeError: Cannot read properties of undefined (reading 'nodeSize')
// La pile remonte d'un observateur Yjs jusqu'à `relativePositionToAbsolutePosition`
// de y-prosemirror. Cette fonction lit `binding.mapping` (type Yjs → nœud
// ProseMirror) ; quand Yjs vient de recevoir un bloc que ProseMirror n'a pas
// encore mis en correspondance, `mapping.get(type)` est `undefined` et elle
// lève. La position d'un commentaire n'est alors **pas encore connaissable** :
// ce n'est pas une erreur, c'est `null` — que tout l'appelant sait déjà lire
// (« une ancre non résoluble n'est PAS un orphelin », voir `orphelins`).
// `presence.js` faisait déjà ce garde pour les curseurs ; pas `comments.js`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { prosemirrorToYXmlFragment, ySyncPluginKey } from 'y-prosemirror'

{
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent']) {
    globalThis[k] = w[k]
  }
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
}

const { schema } = await import('../src/schema.js')
const { resolveCommentRange, purgeOrphanComments, NOM_ORPHELINS } = await import('../src/comments.js')

const paragraphes = (...ts) => schema.node('doc', null, ts.map((t) => schema.node('paragraph', null, [schema.text(t)])))

/** Un document Yjs à deux paragraphes, un commentaire dans le second, et un
 * « état » dont la liaison ne connaît encore aucun bloc (`mapping` vide) :
 * exactement ce que voit un observateur appelé en plein milieu de
 * l'application d'une modification distante. */
function banc() {
  const ydoc = new Y.Doc()
  const frag = ydoc.getXmlFragment('prosemirror-content')
  prosemirrorToYXmlFragment(paragraphes('Premier paragraphe.', 'Second paragraphe, commenté.'), frag)
  const texte = frag.get(1).get(0)
  const ancre = (i) => Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(texte, i))
  const commentsMap = ydoc.getMap('comments')
  const comment = { id: 'c1', user: 'Alice', color: '#3d5a80', text: 'Hum.', anchorFrom: ancre(2), anchorTo: ancre(9) }
  commentsMap.set('c1', comment)
  const liaison = (mapping) => ({ [ySyncPluginKey.key]: { type: frag, binding: { mapping } } })
  return { ydoc, frag, commentsMap, comment, vide: liaison(new Map()) }
}

test('une liaison pas encore à jour donne « non résoluble », pas une exception', () => {
  const { ydoc, comment, vide } = banc()
  assert.doesNotThrow(() => resolveCommentRange(vide, ydoc, comment))
  assert.equal(resolveCommentRange(vide, ydoc, comment), null)
})

test('et ce « non résoluble » ne masque aucun commentaire', () => {
  const { ydoc, commentsMap, vide } = banc()
  purgeOrphanComments(vide, ydoc, commentsMap)
  assert.equal(ydoc.getMap(NOM_ORPHELINS).size, 0, 'rien n’est marqué orphelin')
  assert.ok(commentsMap.has('c1'), 'le commentaire est toujours là')
})

test('un état sans liaison reste « non résoluble » aussi', () => {
  const { ydoc, comment } = banc()
  assert.equal(resolveCommentRange({}, ydoc, comment), null)
})
