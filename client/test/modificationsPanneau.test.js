// Le panneau des modifications, monté dans un vrai éditeur (jsdom).
//
// Ce qui s'y teste : le geste de la relecture. Valider une modification
// doit faire descendre à la suivante — signalé par Sylvain le 20/09/2026,
// qui voyait la sélection remonter à celle du dessus parce que rien ne la
// déplaçait après coup.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction, listChanges, insertAISuggestion, regrouperEnLots } from '../src/trackChanges.js'
import { mountChangesPanel } from '../src/changesPanel.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }

function installerDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><body><div class="editor-container"><div id="editeur"></div></div><div id="panneau"></div></body>',
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
  // jsdom n'implémente pas le défilement : sans ça, la mise en évidence de
  // l'entrée courante jette, et le panneau ne se rend jamais.
  w.Element.prototype.scrollIntoView = () => {}
  return dom
}

/** Un éditeur en suivi de modifications, avec le panneau monté, et trois
 * suppressions proposées dans l'ordre du document. */
function monterAvecTroisModifs() {
  installerDom()
  const panneau = document.getElementById('panneau')
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('alpha bravo charlie delta echo foxtrot')]),
  ])
  const state = EditorState.create({
    doc,
    plugins: [trackChangesPlugin({ enabled: true }), mountChangesPanel(panneau, { canReview: true })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })

  // Trois passages barrés, du début vers la fin. On efface du dernier vers
  // le premier pour que les positions ne bougent pas en route.
  for (const [from, to] of [[27, 32], [14, 20], [1, 6]]) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
    view.dispatch(view.state.tr.delete(from, to))
  }
  return { view, panneau }
}

const entrees = (panneau) => [...panneau.querySelectorAll('.change-item')]
const accepter = (entree) =>
  [...entree.querySelectorAll('button')].find((b) => b.textContent === 'Accepter')
const rejeter = (entree) =>
  [...entree.querySelectorAll('button')].find((b) => b.textContent === 'Rejeter')

test('accepter une modification fait descendre à la suivante, jamais remonter', async () => {
  const { view, panneau } = monterAvecTroisModifs()
  await new Promise((r) => setTimeout(r, 30))
  const liste = entrees(panneau)
  assert.equal(liste.length, 3, 'trois modifications à relire')

  // On se place sur la deuxième, comme quelqu'un qui relit de haut en bas.
  const deuxieme = liste[1]
  deuxieme.dispatchEvent(new window.Event('click', { bubbles: true }))
  const avant = view.state.selection.from

  accepter(deuxieme).dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))

  const apres = view.state.selection.from
  assert.ok(
    apres > avant,
    `la sélection doit descendre (avant ${avant}, après ${apres})`
  )
  // Et elle se pose bien sur une modification, pas n'importe où.
  assert.ok(!view.state.selection.empty, 'la modification suivante est sélectionnée')
})

test('rejeter suit la même règle', async () => {
  const { view, panneau } = monterAvecTroisModifs()
  await new Promise((r) => setTimeout(r, 30))
  const liste = entrees(panneau)
  liste[0].dispatchEvent(new window.Event('click', { bubbles: true }))
  const avant = view.state.selection.from

  rejeter(liste[0]).dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))

  assert.ok(view.state.selection.from > avant, 'on descend, là encore')
})

test('valider la dernière ne renvoie pas au début du document', async () => {
  // Arrivé au bout d'une relecture, remonter au premier paragraphe est une
  // surprise, pas un service.
  const { view, panneau } = monterAvecTroisModifs()
  await new Promise((r) => setTimeout(r, 30))
  const liste = entrees(panneau)
  const derniere = liste[liste.length - 1]
  derniere.dispatchEvent(new window.Event('click', { bubbles: true }))
  const avant = view.state.selection.from

  accepter(derniere).dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))

  assert.ok(view.state.selection.from >= avant, 'la sélection ne remonte pas')
})

test('un correcteur ne se voit proposer ni Accepter ni Rejeter', async () => {
  installerDom()
  const panneau = document.getElementById('panneau')
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('alpha bravo')])])
  const state = EditorState.create({
    doc,
    plugins: [trackChangesPlugin({ enabled: true }), mountChangesPanel(panneau, { canReview: false })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
  view.dispatch(view.state.tr.delete(1, 6))
  await new Promise((r) => setTimeout(r, 30))

  assert.equal(entrees(panneau).length, 1)
  assert.equal(panneau.querySelectorAll('.change-actions button').length, 0)
})

/** Un éditeur en suivi de modifications, avec le panneau monté, et un mot
 * remplacé par un autre — frappe par-dessus une sélection, le geste que
 * pairReplacements regroupe en une seule entrée « remplacement » (voir
 * claude/etude-suivi-remplacement.md, projet Amend). */
function monterAvecUnRemplacement() {
  installerDom()
  const panneau = document.getElementById('panneau')
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Le chat mange.')])])
  const state = EditorState.create({
    doc,
    plugins: [trackChangesPlugin({ enabled: true }), mountChangesPanel(panneau, { canReview: true })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })

  // « chat » (positions 4 à 8) remplacé par « chien ».
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 8)))
  view.dispatch(view.state.tr.insertText('chien', 4, 8))
  return { view, panneau }
}

test('remplacer une sélection en tapant par-dessus ne fait qu’une seule entrée', async () => {
  const { panneau } = monterAvecUnRemplacement()
  await new Promise((r) => setTimeout(r, 30))
  const liste = entrees(panneau)
  assert.equal(liste.length, 1, 'une carte, pas deux (voir claude/etude-suivi-remplacement.md)')
  assert.ok(liste[0].className.includes('change-remplacement'))
  assert.equal(panneau.querySelector('.change-ancien').textContent, 'chat')
  assert.equal(panneau.querySelector('.change-nouveau').textContent, 'chien')
})

test('accepter un remplacement groupé retire l’ancien et garde le nouveau', async () => {
  const { view, panneau } = monterAvecUnRemplacement()
  await new Promise((r) => setTimeout(r, 30))
  accepter(entrees(panneau)[0]).dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(view.state.doc.textContent, 'Le chien mange.')
  assert.equal(listChanges(view.state.doc).length, 0, 'plus rien en attente')
})

test('rejeter un remplacement groupé restaure l’ancien et efface le nouveau', async () => {
  const { view, panneau } = monterAvecUnRemplacement()
  await new Promise((r) => setTimeout(r, 30))
  rejeter(entrees(panneau)[0]).dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(view.state.doc.textContent, 'Le chat mange.')
  assert.equal(listChanges(view.state.doc).length, 0, 'plus rien en attente')
})

test('« traiter séparément » redonne accès aux deux décisions', async () => {
  const { view, panneau } = monterAvecUnRemplacement()
  await new Promise((r) => setTimeout(r, 30))
  const carte = entrees(panneau)[0]
  const toggle = [...carte.querySelectorAll('button')].find((b) => b.textContent === 'Traiter séparément')
  assert.ok(toggle, 'le lien existe')
  toggle.dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))

  const lignes = panneau.querySelectorAll('.change-detail-row')
  assert.equal(lignes.length, 2, 'ancien et nouveau, chacun avec sa décision')

  // Accepter seulement le nouveau texte (l'insertion) : le mot ajouté
  // reste, l'ancien redevient une entrée normale, seule.
  const boutonNouveau = [...lignes[1].querySelectorAll('button')].find((b) => b.textContent === 'Accepter')
  boutonNouveau.dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 30))

  const restant = entrees(panneau)
  assert.equal(restant.length, 1, 'il reste l’ancien texte, seul')
  assert.ok(restant[0].className.includes('change-deletion'), 'ce n’est plus un remplacement groupé')
  assert.equal(view.state.doc.textContent, 'Le chienchat mange.', 'le nouveau est resté, l’ancien encore barré')
})

test('la consigne de défilement survit à la réécriture en suivi', () => {
  // Banc iPhone du 23/09/2026 : en suivi de modifications, on écrivait
  // sous la barre d'outils sans que rien ne défile. La transaction
  // d'origine porte « ramène le curseur dans le champ de vision » — c'est
  // ProseMirror qui la pose sur toute saisie ; `rewriteForTracking` en
  // construit une autre, qui ne la portait pas. Défaut de tous les écrans,
  // trouvé sur le petit.
  installerDom()
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Un texte de départ.')])])
  let state = EditorState.create({ doc, plugins: [trackChangesPlugin()] })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.dispatch(view.state.tr.setMeta('setTrackChanges', true))

  // On intercepte la transaction réellement appliquée.
  let appliquee = null
  const vraiApply = view.state.constructor.prototype.apply
  view.state.constructor.prototype.apply = function (tr) {
    appliquee = tr
    return vraiApply.call(this, tr)
  }
  try {
    const tr = view.state.tr
      .setSelection(TextSelection.create(view.state.doc, 5))
      .insertText('AJOUT')
      .scrollIntoView()
    assert.equal(tr.scrolledIntoView, true, 'la transaction d’origine la porte')
    makeDispatchTransaction(view, () => ALICE)(tr)
    assert.notEqual(appliquee, tr, 'elle a bien été réécrite pour le suivi')
    assert.equal(appliquee.scrolledIntoView, true, 'et la consigne a suivi')
  } finally {
    view.state.constructor.prototype.apply = vraiApply
    view.destroy()
  }
})

// ============================================ un geste de l'IA, une carte (S2)

const IA = { name: 'IA', color: '#5f7a4a' }

function monterAvecUneCorrectionIA() {
  installerDom()
  const panneau = document.getElementById('panneau')
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Le chat dort sur le tapis rouge, devant la cheminée, pendant que la pluie tombe sur le toit de la vieille maison du village.')]),
  ])
  const state = EditorState.create({
    doc,
    plugins: [trackChangesPlugin({ enabled: true }), mountChangesPanel(panneau, { canReview: true })],
  })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  insertAISuggestion(view, 1, view.state.doc.content.size - 1, 'Le chien dort sur le grand tapis bleu, devant la cheminée, pendant que la neige tombe sur le toit de la vieille maison du village.', IA)
  return { view, panneau }
}

test('une correction de l’IA fait une seule carte, avec le compte de ses changements', async () => {
  const { view, panneau } = monterAvecUneCorrectionIA()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(listChanges(view.state.doc).length, 4, 'quatre modifications en dessous')
  const liste = entrees(panneau)
  assert.equal(liste.length, 1, 'une carte')
  assert.ok(liste[0].className.includes('change-lot'))
  assert.match(liste[0].querySelector('.change-meta').textContent, /IA · 4 changements/)
  // « Traiter séparément » montre les quatre, chacune avec ses boutons.
  const detailBtn = [...liste[0].querySelectorAll('button')].find((b) => b.textContent === 'Traiter séparément')
  detailBtn.click()
  await new Promise((r) => setTimeout(r, 30))
  const lignes = panneau.querySelectorAll('.change-detail-row')
  assert.equal(lignes.length, 4)
  assert.match(lignes[0].textContent, /chat → chien/)
})

test('accepter le lot accepte tout ; le rejeter rend le texte d’origine', async () => {
  const a = monterAvecUneCorrectionIA()
  await new Promise((r) => setTimeout(r, 30))
  a.view.dispatch(a.view.state.tr.setSelection(TextSelection.create(a.view.state.doc, 5)))
  await new Promise((r) => setTimeout(r, 30))
  ;[...entrees(a.panneau)[0].querySelectorAll('button')].find((b) => b.textContent === 'Accepter').click()
  assert.equal(listChanges(a.view.state.doc).length, 0)
  assert.equal(a.view.state.doc.textContent, 'Le chien dort sur le grand tapis bleu, devant la cheminée, pendant que la neige tombe sur le toit de la vieille maison du village.')

  const r = monterAvecUneCorrectionIA()
  await new Promise((r2) => setTimeout(r2, 30))
  r.view.dispatch(r.view.state.tr.setSelection(TextSelection.create(r.view.state.doc, 5)))
  await new Promise((r2) => setTimeout(r2, 30))
  ;[...entrees(r.panneau)[0].querySelectorAll('button')].find((b) => b.textContent === 'Rejeter').click()
  assert.equal(listChanges(r.view.state.doc).length, 0)
  assert.equal(r.view.state.doc.textContent, 'Le chat dort sur le tapis rouge, devant la cheminée, pendant que la pluie tombe sur le toit de la vieille maison du village.')
})

test('regrouperEnLots : même auteur et même instant, deux entrées au moins', () => {
  const e = (type, from, to, user, ts) => ({ type, from, to, user, userColor: '#000', ts, text: 'x' })
  const lots = regrouperEnLots([e('insertion', 1, 2, 'IA', 5), e('deletion', 2, 3, 'IA', 5), e('insertion', 9, 10, 'Alice', 5), e('insertion', 12, 13, 'IA', 7)])
  assert.deepEqual(lots.map((c) => c.type), ['lot', 'insertion', 'insertion'])
  assert.equal(lots[0].membres.length, 2)
  assert.equal(lots[0].to, 3)
})
