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
    state: {
      tr: { scrollIntoView() { defilements.push(true); return this }, setSelection(sel) { this.sel = sel; return this } },
      selection: { eq: (autre) => autre === undefined, from: 0 },
      doc: { resolve: (pos) => ({ pos }) },
    },
    posAtCoords: null,
    dispatch(tr) { this.envoyees.push(tr) },
    envoyees: [],
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

test('un soubresaut de la fenêtre visuelle ne ramène pas la vue au curseur', () => {
  // Le défaut signalé par Sylvain : clavier ouvert, on fait défiler pour
  // aller chercher un passage ; la barre du navigateur se replie, la
  // hauteur mesurée change, et l'ancienne version ramenait la vue au
  // curseur — le toucher qui suivait tombait sur un texte qui venait de
  // sauter. On ne défile qu'à l'ouverture, une fois.
  const w = installerDom()
  const { racine, vue, api } = monter(w)
  racine.querySelector('.tel-crayon').dispatchEvent(new w.Event('click', { bubbles: true }))

  w.visualViewport.height = 364
  w.visualViewport._emettre('resize')
  const apresOuverture = vue.defilements.length
  assert.ok(apresOuverture > 0, 'l’ouverture ramène bien le curseur')

  // Le clavier reste ouvert, seule la barre du navigateur bouge.
  w.visualViewport.height = 390
  w.visualViewport._emettre('resize')
  w.visualViewport.height = 364
  w.visualViewport._emettre('scroll')
  assert.equal(vue.defilements.length, apresOuverture, 'et plus rien ensuite')

  // Une vraie fermeture, puis une vraie réouverture : là, oui.
  w.visualViewport.height = 664
  w.visualViewport._emettre('resize')
  w.visualViewport.height = 364
  w.visualViewport._emettre('resize')
  assert.ok(vue.defilements.length > apresOuverture, 'une réouverture compte')
  api.demonter()
})


// --- Le rattrapage du toucher : ce sont ses garde-fous qui comptent.
function toucher(w, cible, { dx = 0, dy = 0, duree = 0 } = {}) {
  const point = (x, y) => ({ clientX: x, clientY: y, target: cible })
  const debut = point(100, 200)
  const fin = point(100 + dx, 200 + dy)
  cible.dispatchEvent(Object.assign(new w.Event('touchstart', { bubbles: true }), { touches: [debut], changedTouches: [debut] }))
  if (duree) {
    const maintenant = Date.now
    Date.now = () => maintenant() + duree
    cible.dispatchEvent(Object.assign(new w.Event('touchend', { bubbles: true }), { touches: [], changedTouches: [fin] }))
    Date.now = maintenant
    return
  }
  cible.dispatchEvent(Object.assign(new w.Event('touchend', { bubbles: true }), { touches: [], changedTouches: [fin] }))
}

function monterAvec(w, vue) {
  const el = (cls, tag = 'div') => {
    const e = w.document.createElement(tag)
    e.className = cls
    w.document.getElementById('shell').appendChild(e)
    return e
  }
  const titleInput = el('title-input', 'input')
  titleInput.value = 'Un document'
  const toolbar = el('format-toolbar')
  toolbar.getBoundingClientRect = () => ({ height: 57, top: 607, bottom: 664 })
  return {
    api: monterInterfaceTelephone({
      racine: w.document.getElementById('shell'),
      topBanner: el('top-banner'),
      titleInput,
      toolbar,
      outlineSidebar: el('outline-sidebar'),
      trackToggleLabel: el('track-toggle', 'label'),
      getView: () => vue,
      estCorrecteur: () => false,
      nbCommentaires: () => 0,
      ouvrirCommentaire: () => {},
    }),
  }
}

function avecVue(w) {
  const { racine, vue, api } = monter(w)
  const texte = w.document.createElement('div')
  racine.appendChild(texte)
  vue.dom = Object.assign(texte, { blur() {}, focus() {} })
  vue.focus = () => {}
  vue.posAtCoords = () => ({ pos: 42 })
  racine.querySelector('.tel-crayon').dispatchEvent(new w.Event('click', { bubbles: true }))
  vue.envoyees.length = 0
  return { racine, vue, api, texte }
}

test('un toucher que le navigateur ignore pose le curseur', async () => {
  // Le cas Safari : les évènements tactiles arrivent, mais le navigateur
  // n'a rien placé. Vraie vue ProseMirror : c'est elle qui doit bouger.
  const w = installerDom()
  const { EditorState, TextSelection } = await import('prosemirror-state')
  const { EditorView } = await import('prosemirror-view')
  const { schema } = await import('../src/schema.js')
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Un texte assez long pour viser au doigt.')]),
  ])
  const hote = w.document.createElement('div')
  w.document.getElementById('shell').appendChild(hote)
  const vraie = new EditorView(hote, { state: EditorState.create({ doc }) })
  vraie.posAtCoords = () => ({ pos: 12, inside: 0 })
  vraie.dispatch(vraie.state.tr.setSelection(TextSelection.create(vraie.state.doc, 1)))

  const { api } = monterAvec(w, vraie)
  w.document.querySelector('.tel-crayon').dispatchEvent(new w.Event('click', { bubbles: true }))
  toucher(w, vraie.dom)
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(vraie.state.selection.from, 12, 'le curseur est allé sous le doigt')
  api.demonter()
  vraie.destroy()
})

test('un glissement ne pose rien : c’est un défilement', async () => {
  const w = installerDom()
  const { vue, api, texte } = avecVue(w)
  toucher(w, texte, { dy: 60 })
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(vue.envoyees.length, 0)
  api.demonter()
})

test('un appui long ne pose rien : c’est la sélection de mot', async () => {
  const w = installerDom()
  const { vue, api, texte } = avecVue(w)
  toucher(w, texte, { duree: 900 })
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(vue.envoyees.length, 0)
  api.demonter()
})

test('en lecture, le toucher ne pose jamais de curseur', async () => {
  const w = installerDom()
  const { vue, api, texte, racine } = avecVue(w)
  racine.querySelector('.tel-gauche').dispatchEvent(new w.Event('click', { bubbles: true }))
  toucher(w, texte)
  await new Promise((r) => setTimeout(r, 120))
  assert.equal(vue.envoyees.length, 0)
  api.demonter()
})

test('la taille du texte se règle depuis le menu ⋯, et le zoom a cinq crans', () => {
  // Revirement du 23/09/2026 : plus de suivi de la taille système, un zoom
  // à nous. Il doit donc être atteignable sur téléphone — et c'est le
  // **même** élément que celui de la barre, pas une copie, sans quoi deux
  // réglages divergeraient.
  const w = installerDom()
  const zoom = w.document.createElement('select')
  zoom.className = 'zoom-select'
  for (const pct of ['50', '75', '100', '125', '150']) {
    const o = w.document.createElement('option')
    o.value = pct
    o.textContent = `${pct}%`
    zoom.appendChild(o)
  }
  const el = (cls, tag = 'div') => {
    const e = w.document.createElement(tag)
    e.className = cls
    w.document.getElementById('shell').appendChild(e)
    return e
  }
  const titleInput = el('title-input', 'input')
  titleInput.value = 'Un document'
  const toolbar = el('format-toolbar')
  toolbar.getBoundingClientRect = () => ({ height: 0, top: 0, bottom: 0 })
  toolbar.appendChild(zoom)
  const api = monterInterfaceTelephone({
    racine: w.document.getElementById('shell'),
    topBanner: el('top-banner'),
    titleInput,
    toolbar,
    outlineSidebar: el('outline-sidebar'),
    trackToggleLabel: el('track-toggle', 'label'),
    getView: () => fausseVue(),
    estCorrecteur: () => false,
    nbCommentaires: () => 0,
    ouvrirCommentaire: () => {},
    zoomSelect: zoom,
  })

  w.document.querySelector('.tel-plus').dispatchEvent(new w.Event('click', { bubbles: true }))
  const ligne = w.document.querySelector('.feuille .tel-menu-zoom')
  assert.ok(ligne, 'la taille du texte est dans le menu')
  assert.match(ligne.textContent, /Taille du texte/)
  assert.equal(ligne.querySelector('.zoom-select'), zoom, 'le même élément, déménagé')
  assert.deepEqual(
    [...zoom.options].map((o) => o.value),
    ['50', '75', '100', '125', '150'],
    'cinq crans : il manquait le petit pas'
  )
  api.demonter()
})
