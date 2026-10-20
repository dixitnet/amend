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
import {
  trackChangesPlugin,
  makeDispatchTransaction,
  listChanges,
  acceptAllChanges,
  rejectAllChanges,
} from '../src/trackChanges.js'
import { getOutline } from '../src/outline.js'
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


// ======================================================= Maj+Entrée (20/10/2026)

const titre = (niveau, t) => schema.node('heading', { level: niveau }, [schema.text(t)])
const MAJ = { shiftKey: true }
/** Le texte d'un bloc avec « ⏎ » pour chaque retour à la ligne. */
const lu = (bloc) => bloc.textBetween(0, bloc.content.size, undefined, (n) => (n.type.name === 'hard_break' ? '⏎' : ''))
const monterSuivi = (doc, pos) => {
  const e = monter(doc, { debut: pos.debut, fin: pos.fin ?? pos.debut, suivi: true })
  e.view.setProps({ dispatchTransaction: makeDispatchTransaction(e.view, () => ALICE) })
  return e
}

test('Maj+Entrée dans un paragraphe pose un retour à la ligne, une espace avant, et le curseur après', () => {
  const e = monter(doc(para('Bonjour')), { debut: 8 })
  assert.equal(e.touche('Enter', MAJ), true)
  const bloc = e.view.state.doc.child(0)
  assert.equal(e.view.state.doc.childCount, 1, 'toujours un seul paragraphe')
  assert.equal(lu(bloc), 'Bonjour ⏎')
  assert.equal(e.view.state.selection.from, 10, 'le curseur est après le saut')
  e.view.dispatch(e.view.state.tr.insertText('suite'))
  assert.equal(lu(e.view.state.doc.child(0)), 'Bonjour ⏎suite')
})

test('Maj+Entrée : pas d’espace en trop au début du bloc, après une espace, avant une espace, ni après un autre saut', () => {
  const debut = monter(doc(para('Bonjour')), { debut: 1 })
  debut.touche('Enter', MAJ)
  assert.equal(lu(debut.view.state.doc.child(0)), '⏎Bonjour')
  const apres = monter(doc(para('Bonjour monde')), { debut: 9 })
  apres.touche('Enter', MAJ)
  assert.equal(lu(apres.view.state.doc.child(0)), 'Bonjour ⏎monde')
  const avant = monter(doc(para('Bonjour monde')), { debut: 8 })
  avant.touche('Enter', MAJ)
  assert.equal(lu(avant.view.state.doc.child(0)), 'Bonjour⏎ monde', 'l’espace d’après sépare déjà')
  const deux = monter(doc(para('Un')), { debut: 3 })
  deux.touche('Enter', MAJ)
  deux.touche('Enter', MAJ)
  assert.equal(lu(deux.view.state.doc.child(0)), 'Un ⏎⏎')
})

test('Maj+Entrée dans un titre et dans les styles Titre / Sous-titre : le bloc reste un seul bloc', () => {
  const h = monter(doc(titre(1, 'Premier second')), { debut: 8 })
  h.touche('Enter', MAJ)
  assert.equal(h.view.state.doc.childCount, 1)
  assert.equal(h.view.state.doc.child(0).type.name, 'heading')
  assert.equal(lu(h.view.state.doc.child(0)), 'Premier⏎ second', 'l’espace d’après est gardée telle quelle')
  for (const style of ['titre', 'sous-titre']) {
    const p = schema.node('paragraph', { style }, [schema.text('Mon titre')])
    const e = monter(doc(p), { debut: 4 })
    e.touche('Enter', MAJ)
    assert.equal(e.view.state.doc.childCount, 1, style)
    assert.equal(e.view.state.doc.child(0).attrs.style, style, style)
    assert.equal(lu(e.view.state.doc.child(0)), 'Mon⏎ titre', style)
  }
})

test('Maj+Entrée dans un élément de liste, une citation et une cellule de tableau : pas de nouvel élément', () => {
  const liste = schema.node('bullet_list', null, [schema.node('list_item', null, [para('Un deux')])])
  const l = monter(doc(liste), { debut: 5 })
  assert.equal(l.touche('Enter', MAJ), true)
  assert.equal(l.view.state.doc.child(0).childCount, 1, 'toujours un seul élément')
  const cit = schema.node('blockquote', null, [para('Citation')])
  const c = monter(doc(cit), { debut: 5 })
  c.touche('Enter', MAJ)
  assert.equal(c.view.state.doc.child(0).childCount, 1)
  const table = schema.node('table', null, [
    schema.node('table_row', null, [schema.node('table_cell', null, [para('Cellule')])]),
  ])
  const t = monter(doc(table), { debut: 5 })
  assert.equal(t.touche('Enter', MAJ), true)
  let sauts = 0
  t.view.state.doc.descendants((n) => {
    if (n.type.name === 'hard_break') sauts++
  })
  assert.equal(sauts, 1)
})

test('Maj+Entrée sur une sélection hors suivi : elle est remplacée par le saut', () => {
  const e = monter(doc(para('Avant XXX après')), { debut: 7, fin: 10 })
  e.touche('Enter', MAJ)
  assert.equal(lu(e.view.state.doc.child(0)), 'Avant ⏎ après')
})

test('Maj+Entrée sur une sélection qui traverse deux blocs : rien ne bouge, le navigateur n’improvise pas', () => {
  const e = monter(doc(para('Un'), para('Deux')), { debut: 2, fin: 6 })
  const avant = e.view.state.doc
  assert.equal(e.touche('Enter', MAJ), true)
  assert.ok(e.view.state.doc.eq(avant))
})

test('Maj+Entrée en suivi : le saut et l’espace sont des propositions au nom de l’auteur ; accepter les garde, refuser les retire', () => {
  const e = monterSuivi(doc(para('Bonjour')), { debut: 8 })
  e.touche('Enter', MAJ)
  const bloc = e.view.state.doc.child(0)
  assert.equal(lu(bloc), 'Bonjour ⏎')
  const saut = bloc.child(bloc.childCount - 1)
  assert.equal(saut.type.name, 'hard_break')
  assert.equal(saut.attrs.suivi.type, 'insertion')
  assert.equal(saut.attrs.suivi.user, 'Alice')
  const changes = listChanges(e.view.state.doc)
  assert.ok(changes.some((c) => c.noeud === 'hard_break' && c.text === 'Saut de ligne'), 'le panneau le liste')
  assert.ok(changes.some((c) => c.type === 'insertion' && c.text === ' '), 'et l’espace insérée')
  rejectAllChanges(e.view)
  assert.equal(lu(e.view.state.doc.child(0)), 'Bonjour', 'refusé : comme avant')
  assert.equal(listChanges(e.view.state.doc).length, 0)

  const f = monterSuivi(doc(para('Bonjour')), { debut: 8 })
  f.touche('Enter', MAJ)
  acceptAllChanges(f.view)
  const accepte = f.view.state.doc.child(0)
  assert.equal(lu(accepte), 'Bonjour ⏎')
  assert.equal(accepte.child(accepte.childCount - 1).attrs.suivi, null, 'plus en attente')
  assert.equal(listChanges(f.view.state.doc).length, 0)
})

test('Maj+Entrée en suivi dans un titre : un seul titre, et ce qui suit se tape en proposition', () => {
  const e = monterSuivi(doc(titre(2, 'Titre')), { debut: 6 })
  e.touche('Enter', MAJ)
  e.view.dispatch(e.view.state.tr.insertText('suite'))
  assert.equal(e.view.state.doc.childCount, 1)
  assert.equal(e.view.state.doc.child(0).type.name, 'heading')
  assert.equal(lu(e.view.state.doc.child(0)), 'Titre ⏎suite')
  rejectAllChanges(e.view)
  assert.equal(lu(e.view.state.doc.child(0)), 'Titre')
})

test('Retour arrière après son propre saut en suivi : il disparaît pour de bon ; sur le saut d’un autre, il est barré', () => {
  const e = monterSuivi(doc(para('Bonjour')), { debut: 8 })
  e.touche('Enter', MAJ)
  e.touche('Backspace')
  assert.ok(!lu(e.view.state.doc.child(0)).includes('⏎'), 'son propre saut est retiré')
  // Le saut d’un autre auteur, déjà accepté : le retirer le propose à la suppression.
  const saut = schema.node('hard_break')
  const f = monterSuivi(doc(schema.node('paragraph', null, [schema.text('Un '), saut, schema.text('deux')])), { debut: 5 })
  f.touche('Backspace')
  const bloc = f.view.state.doc.child(0)
  let barre = null
  bloc.forEach((n) => {
    if (n.type.name === 'hard_break') barre = n
  })
  assert.ok(barre, 'le saut est toujours là')
  assert.equal(barre.attrs.suivi.type, 'deletion')
  assert.equal(barre.attrs.suivi.user, 'Alice')
  rejectAllChanges(f.view)
  assert.equal(lu(f.view.state.doc.child(0)), 'Un ⏎deux', 'refuser la suppression le rend')
  acceptAllChanges(f.view)
})

test('Maj+Entrée en suivi sur une sélection : l’ancien passage reste barré, le saut vient après', () => {
  const e = monterSuivi(doc(para('Avant XXX après')), { debut: 7, fin: 10 })
  e.touche('Enter', MAJ)
  const types = listChanges(e.view.state.doc).map((c) => c.noeud || c.type)
  assert.ok(types.includes('deletion') && types.includes('hard_break'), JSON.stringify(types))
  rejectAllChanges(e.view)
  assert.equal(lu(e.view.state.doc.child(0)), 'Avant XXX après')
})

test('le plan lit un retour à la ligne comme une espace', () => {
  const titreDouble = schema.node('heading', { level: 1 }, [schema.text('Premier'), schema.node('hard_break'), schema.text('second')])
  const collé = schema.node('heading', { level: 2 }, [schema.text('Fin '), schema.node('hard_break'), schema.text(' suite')])
  const d = doc(titreDouble, para('Texte'), collé)
  assert.deepEqual(
    getOutline(d).map((i) => i.text),
    ['Premier second', 'Fin suite']
  )
})
