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

// « Mod » de prosemirror-keymap = Cmd sur Mac, Ctrl ailleurs : lu une fois,
// sur le `navigator` natif de Node, avant que les tests installent celui de jsdom.
const MOD = /Mac|iP(hone|[oa]d)/.test(globalThis.navigator?.platform ?? '') ? { metaKey: true } : { ctrlKey: true }

const ALICE = { name: 'Alice', color: '#3d5a80' }

function monter(doc, { debut, fin = debut, suivi = false, peutPoser = true } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="e"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of [
    'HTMLElement',
    'Node',
    'Element',
    'getComputedStyle',
    'DocumentFragment',
    'Range',
    'MutationObserver',
    'Event',
    'KeyboardEvent',
  ])
    globalThis[k] = w[k]
  w.Range.prototype.getClientRects = () => []
  w.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 })
  const refus = []
  let state = EditorState.create({
    doc,
    schema,
    plugins: [
      trackChangesPlugin({ enabled: suivi }),
      raccourcisClavier({ user: ALICE, peutPoserLien: () => peutPoser, surRefusLien: () => refus.push(1) }),
      keymap(baseKeymap),
    ],
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
  for (const [key, marque] of [
    ['b', 'strong'],
    ['i', 'em'],
    ['u', 'underline'],
  ]) {
    assert.equal(e.touche(key, { ...MOD }), true, key)
    assert.ok(e.view.state.doc.rangeHasMark(1, 8, schema.marks[marque]), marque)
  }
})

test('Ctrl-Alt-F pose une note dans un paragraphe', () => {
  const e = monter(doc(para('Bonjour')), { debut: 4 })
  assert.equal(e.touche('f', { ...MOD, altKey: true }), true)
  let notes = 0
  e.view.state.doc.descendants((n) => {
    if (n.type.name === 'footnote') notes++
  })
  assert.equal(notes, 1)
})

test('Ctrl-K sans le droit de poser un lien : le refus est signalé, rien ne change', () => {
  const e = monter(doc(para('Bonjour')), { debut: 1, fin: 8, peutPoser: false })
  e.touche('k', { ...MOD })
  assert.equal(e.refus.length, 1)
  assert.ok(!e.view.state.doc.rangeHasMark(1, 8, schema.marks.link))
})

test('Entrée dans un élément de liste le coupe ; Tab hors liste et hors tableau n’est pas pris (la tabulation du navigateur reste)', () => {
  const liste = schema.node('bullet_list', null, [schema.node('list_item', null, [para('Un deux')])])
  const e = monter(doc(liste), { debut: 5 })
  assert.equal(e.touche('Enter'), true)
  assert.equal(e.view.state.doc.child(0).childCount, 2, 'deux éléments')
  const hors = monter(doc(para('Texte')), { debut: 2 })
  assert.equal(hors.touche('Tab'), false)
  assert.equal(hors.touche('Tab', { shiftKey: true }), false)
})

// ===================================================== listes à plusieurs niveaux

const item = (...blocs) => schema.node('list_item', null, blocs)
const puces = (...items) => schema.node('bullet_list', null, items)
const tache = (...blocs) => schema.node('task_item', { checked: false }, blocs)
const taches = (...items) => schema.node('task_list', null, items)

/** Position juste après le début du texte donné (premier paragraphe qui le contient). */
function posDe(d, texte) {
  let pos = null
  d.descendants((n, p) => {
    if (pos === null && n.isText && n.text.includes(texte)) pos = p + 1
  })
  assert.notEqual(pos, null, texte)
  return pos
}

test('Tab dans une liste descend l’élément d’un niveau (sous-liste), Maj+Tab le remonte', () => {
  const d = doc(puces(item(para('Un')), item(para('Deux'))))
  const e = monter(d, { debut: posDe(d, 'Deux') })
  assert.equal(e.touche('Tab'), true)
  assert.equal(e.view.state.doc.child(0).childCount, 1, 'un seul élément au premier niveau')
  assert.equal(e.view.state.doc.child(0).child(0).lastChild.type.name, 'bullet_list', 'une sous-liste')
  assert.equal(e.touche('Tab', { shiftKey: true }), true)
  assert.equal(e.view.state.doc.child(0).childCount, 2, 'de nouveau deux éléments')
})

test('Tab sur le premier élément (rien au-dessus où se ranger) est pris mais ne change rien', () => {
  const d = doc(puces(item(para('Un')), item(para('Deux'))))
  const e = monter(d, { debut: posDe(d, 'Un') })
  assert.equal(e.touche('Tab'), true, 'le focus ne doit pas quitter le texte')
  assert.ok(e.view.state.doc.eq(d))
})

test('Tab porte aussi sur les listes à cocher, et la sous-liste reste une liste à cocher', () => {
  const d = doc(taches(tache(para('Un')), tache(para('Deux'))))
  const e = monter(d, { debut: posDe(d, 'Deux') })
  assert.equal(e.touche('Tab'), true)
  assert.equal(e.view.state.doc.child(0).childCount, 1)
  assert.equal(e.view.state.doc.child(0).child(0).lastChild.type.name, 'task_list')
})

test('Tab déplace tous les éléments touchés par la sélection', () => {
  const d = doc(puces(item(para('Un')), item(para('Deux')), item(para('Trois'))))
  const e = monter(d, { debut: posDe(d, 'Deux'), fin: posDe(d, 'Trois') + 2 })
  assert.equal(e.touche('Tab'), true)
  const sous = e.view.state.doc.child(0).child(0).lastChild
  assert.equal(sous.type.name, 'bullet_list')
  assert.equal(sous.childCount, 2)
})

test('le plafond de six niveaux : au-delà, Tab est pris mais ne descend plus', () => {
  // niveaux 1..n emboîtés, chacun avec un premier élément « Nk » puis, au
  // dernier niveau seulement, un frère « Frère » que Tab voudrait descendre.
  const emboite = (k, n) =>
    k === n ? puces(item(para(`N${k}`)), item(para('Frère'))) : puces(item(para(`N${k}`), emboite(k + 1, n)))
  const sous6 = doc(emboite(1, 5)) // « Frère » est au niveau 5 : peut encore descendre
  const e5 = monter(sous6, { debut: posDe(sous6, 'Frère') })
  assert.equal(e5.touche('Tab'), true)
  assert.ok(!e5.view.state.doc.eq(sous6), 'descendu au sixième niveau')
  const plein = doc(emboite(1, 6)) // « Frère » est au niveau 6 : plafond
  const e6 = monter(plein, { debut: posDe(plein, 'Frère') })
  assert.equal(e6.touche('Tab'), true)
  assert.ok(e6.view.state.doc.eq(plein), 'rien ne change au plafond')
})

test('Maj+Tab au premier niveau fait sortir l’élément de la liste', () => {
  const d = doc(puces(item(para('Un')), item(para('Deux'))))
  const e = monter(d, { debut: posDe(d, 'Deux') })
  assert.equal(e.touche('Tab', { shiftKey: true }), true)
  assert.deepEqual(
    e.view.state.doc.children.map((n) => n.type.name),
    ['bullet_list', 'paragraph']
  )
})

test('Ctrl/Cmd-] et Ctrl/Cmd-[ font la même chose que Tab et Maj+Tab', () => {
  const d = doc(puces(item(para('Un')), item(para('Deux'))))
  const e = monter(d, { debut: posDe(d, 'Deux') })
  assert.equal(e.touche(']', MOD), true)
  assert.equal(e.view.state.doc.child(0).childCount, 1)
  assert.equal(e.touche('[', MOD), true)
  assert.equal(e.view.state.doc.child(0).childCount, 2)
})

test('Tab dans une cellule de tableau reste le passage à la cellule suivante', () => {
  const cellule = (t) => schema.node('table_cell', null, [para(t)])
  const tableau = schema.node('table', null, [schema.node('table_row', null, [cellule('A'), cellule('B')])])
  const d = doc(tableau)
  const e = monter(d, { debut: posDe(d, 'A') })
  assert.equal(e.touche('Tab'), true)
  assert.equal(e.view.state.selection.$from.parent.textContent, 'B')
})

test('Entrée sur un élément vide d’une sous-liste le remonte d’un niveau', () => {
  const d = doc(puces(item(para('Un'), puces(item(para('Sous')), item(schema.node('paragraph'))))))
  // position dans le paragraphe vide : juste avant la fin du document - 4
  let vide = null
  d.descendants((n, p) => {
    if (n.type.name === 'paragraph' && n.childCount === 0) vide = p + 1
  })
  const e = monter(d, { debut: vide })
  assert.equal(e.touche('Enter'), true)
  assert.equal(e.view.state.doc.child(0).childCount, 2, 'un nouvel élément au premier niveau')
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
