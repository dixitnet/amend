// Où s'arrête la zone visible sur téléphone (23/09/2026).
//
// Sylvain : « le positionnement de la barre d'édition est toujours étrange,
// et pas posée au dessus du clavier, et le positionnement du curseur
// toujours bizarre. »
//
// Ce qu'un banc Chromium piloté au doigt a montré : la barre d'outils est
// `position: fixed`, donc hors du flux. ProseMirror, qui juge de la
// visibilité d'après le rectangle du conteneur de défilement, croyait donc
// visible une dernière ligne qui passait en réalité **sous** la barre — et
// ne faisait plus défiler. Mesure du banc, avant correctif : barre à 607,
// curseur à 642-663.
//
// Le remède n'est pas de retrancher la hauteur de la barre — dans un
// document court, la colonne ne défile pas et aucun défilement ne peut
// corriger un recouvrement. La barre est donc revenue **dans le flux** :
// elle occupe sa place, la colonne s'arrête d'elle-même au bon endroit.
// Ce fichier garde la trace des deux règles qui en découlent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="shell"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.history = w.history
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'MutationObserver', 'Event', 'KeyboardEvent']) globalThis[k] = w[k]
  w.matchMedia = (r) => ({ matches: true, media: r, addEventListener() {}, removeEventListener() {} })
  globalThis.matchMedia = w.matchMedia
  w.Element.prototype.scrollIntoView = function () {}
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1 }
  globalThis.cancelAnimationFrame = () => {}
  Object.defineProperty(w, 'innerHeight', { value: 664, configurable: true, writable: true })
  const ecouteurs = {}
  w.visualViewport = {
    height: 664,
    offsetTop: 0,
    addEventListener(t, f) { (ecouteurs[t] = ecouteurs[t] || []).push(f) },
    removeEventListener(t, f) { ecouteurs[t] = (ecouteurs[t] || []).filter((g) => g !== f) },
    _emettre(t) { for (const f of ecouteurs[t] || []) f() },
  }
  return w
}

const { monterInterfaceTelephone } = await import('../src/iphone.js')

/** Un simulacre de vue ProseMirror : on ne veut que les propriétés posées. */
function fausseVue() {
  const defilements = []
  return {
    props: {},
    dom: { blur() {}, focus() {} },
    focus() {},
    state: { tr: { scrollIntoView() { defilements.push(true); return this } } },
    dispatch() {},
    setProps(p) { Object.assign(this.props, p) },
    defilements,
  }
}

function monter(w, hauteurBarre = 57) {
  const el = (cls, tag = 'div') => {
    const e = w.document.createElement(tag)
    e.className = cls
    w.document.getElementById('shell').appendChild(e)
    return e
  }
  const racine = w.document.getElementById('shell')
  const toolbar = el('format-toolbar')
  toolbar.getBoundingClientRect = () => ({ height: hauteurBarre, top: 664 - hauteurBarre, bottom: 664 })
  const titleInput = el('title-input', 'input')
  titleInput.value = 'Un document'
  const vue = fausseVue()
  const api = monterInterfaceTelephone({
    racine,
    topBanner: el('top-banner'),
    titleInput,
    toolbar,
    outlineSidebar: el('outline-sidebar'),
    trackToggleLabel: el('track-toggle', 'label'),
    getView: () => vue,
    estCorrecteur: () => false,
    nbCommentaires: () => 0,
    ouvrirCommentaire: () => {},
  })
  return { racine, api, vue, toolbar }
}

test('en lecture, ProseMirror ne réserve rien en bas', () => {
  const w = installerDom()
  const { vue, api } = monter(w)
  assert.equal(vue.props.scrollMargin.bottom, 0, 'aucune barre à éviter en lecture')
  api.demonter()
})

test('la barre d’outils n’est pas comptée comme un recouvrement', () => {
  // Régression du 23/09 : on avait d'abord retranché sa hauteur de la zone
  // visible. Elle est dans le flux, elle ne recouvre rien — le faire
  // revenait à s'arrêter d'écrire 69 px trop haut.
  const w = installerDom()
  const { racine, vue, api } = monter(w, 57)
  racine.querySelector('.tel-crayon').dispatchEvent(new w.Event('click', { bubbles: true }))
  assert.equal(vue.props.scrollMargin.bottom, 0)
  assert.equal(vue.props.scrollThreshold.bottom, 0)
  api.demonter()
})

test("l'ouverture du clavier ramène le curseur dans la zone restante", () => {
  // Rien ne bouge dans le document quand le clavier s'ouvre : sans ce
  // rappel, le curseur reste où il était, c'est-à-dire sous le clavier.
  const w = installerDom()
  const { racine, vue, api } = monter(w)
  racine.querySelector('.tel-crayon').dispatchEvent(new w.Event('click', { bubbles: true }))
  const avant = vue.defilements.length
  w.visualViewport.height = 364
  w.visualViewport._emettre('resize')
  assert.equal(racine.style.getPropertyValue('--clavier'), '300px')
  assert.ok(vue.defilements.length > avant, 'un défilement a été demandé')
  api.demonter()
})

test('en démontant, la vue retrouve ses réglages d’origine', () => {
  const w = installerDom()
  const { racine, vue, api } = monter(w)
  racine.querySelector('.tel-crayon').dispatchEvent(new w.Event('click', { bubbles: true }))
  api.demonter()
  assert.equal(vue.props.scrollMargin.bottom, 0)
  assert.equal(vue.props.editable(), true)
})
