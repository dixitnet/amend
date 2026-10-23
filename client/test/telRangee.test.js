// La rangée d'édition et le bandeau de relecture du téléphone (21/10/2026,
// vue V4 de claude/vues-reference-formats.md).
//
//  - sous l'en-tête, une rangée : le bouton Plan en tête, puis les outils ;
//  - un bandeau de relecture, qui n'existe que pendant une relecture ;
//  - les barres qui s'effacent au défilement vers le bas (décision D14), sauf
//    clavier, relecture ou feuille ouverts, et que le réglage du menu ⋯ coupe.
//
// Régression gardée au passage : l'auteur affiché dans le bandeau est dans le
// nœud que l'on observe ; réécrire le même texte relançait l'observateur sans
// fin (la page se figeait à la première frappe).

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
  for (const k of [
    'HTMLElement',
    'Node',
    'Element',
    'MutationObserver',
    'Event',
    'KeyboardEvent',
    'getComputedStyle',
    'DocumentFragment',
    'Range',
    'Text',
  ]) {
    globalThis[k] = w[k]
  }
  w.matchMedia = (r) => ({ matches: true, media: r, addEventListener() {}, removeEventListener() {} })
  globalThis.matchMedia = w.matchMedia
  w.Element.prototype.scrollIntoView = function () {}
  globalThis.requestAnimationFrame = (fn) => {
    fn(0)
    return 1
  }
  globalThis.cancelAnimationFrame = () => {}
  Object.defineProperty(w, 'innerHeight', { value: 664, configurable: true, writable: true })
  w.visualViewport = { height: 664, offsetTop: 0, addEventListener() {}, removeEventListener() {} }
  // Le stockage du navigateur : un simple dictionnaire.
  const magasin = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
      setItem: (k, v) => magasin.set(k, String(v)),
    },
  })
  return w
}

const { monterInterfaceTelephone } = await import('../src/iphone.js')
const { fermerFeuille } = await import('../src/feuille.js')
const attendre = () => new Promise((r) => setTimeout(r, 20))

function fausseVue() {
  return {
    props: {},
    dom: { blur() {}, focus() {} },
    focus() {},
    state: {
      tr: {
        scrollIntoView() {
          return this
        },
      },
      selection: { from: 0 },
      doc: {},
    },
    dispatch() {},
    setProps(p) {
      Object.assign(this.props, p)
    },
  }
}

/** Le parcours des modifications, tel que `monterBarreRelecture` le rend. */
function fausseRelecture(w) {
  const el = w.document.createElement('div')
  el.className = 'barre-relecture'
  el.hidden = true
  el.innerHTML =
    '<button class="btn-tool">‹</button><span class="barre-relecture-position">1 / 2</span><button class="btn-tool">›</button><button class="btn-accept">Accepter</button><button class="btn-reject">Rejeter</button>'
  const r = {
    el,
    allers: 0,
    courant: { user: 'Lucie', userColor: '#2a7' },
    courante: () => r.courant,
    aller: () => {
      r.allers++
    },
  }
  return r
}

function monter(w, { relecture = fausseRelecture(w) } = {}) {
  const el = (cls, tag = 'div') => {
    const e = w.document.createElement(tag)
    e.className = cls
    w.document.getElementById('shell').appendChild(e)
    return e
  }
  const racine = w.document.getElementById('shell')
  const titleInput = el('title-input', 'input')
  titleInput.value = 'Un document'
  const api = monterInterfaceTelephone({
    racine,
    topBanner: el('top-banner'),
    titleInput,
    toolbar: el('format-toolbar'),
    outlineSidebar: el('outline-sidebar'),
    trackToggleLabel: el('track-toggle', 'label'),
    getView: () => fausseVue(),
    estCorrecteur: () => false,
    nbCommentaires: () => 0,
    ouvrirCommentaire: () => {},
    relecture,
  })
  return { racine, api, relecture }
}

test('l’en-tête garde trois éléments, la rangée porte le bouton Plan en premier', () => {
  const w = installerDom()
  const { racine, api } = monter(w)
  assert.equal(racine.querySelector('.tel-entete').children.length, 3)
  const rangee = racine.querySelector('.tel-rangee')
  assert.ok(rangee.firstElementChild.classList.contains('tel-plan'))
  assert.equal(rangee.firstElementChild.getAttribute('aria-label'), 'Plan du document')
  // Les deux sont dans le bloc qui reste collé en haut.
  assert.equal(racine.querySelector('.tel-haut').children.length, 3, 'en-tête, rangée, bandeau')
  api.demonter()
})

test('le bouton Plan ouvre le plan en feuille', () => {
  const w = installerDom()
  const { racine, api } = monter(w)
  racine.querySelector('.tel-plan').dispatchEvent(new w.Event('click', { bubbles: true }))
  assert.match(w.document.querySelector('.feuille').textContent, /Plan du document/)
  fermerFeuille()
  api.demonter()
})

test('pas de modification : ni bouton Relire, ni bandeau ; une modification : le bouton seul', async () => {
  const w = installerDom()
  const { racine, relecture, api } = monter(w)
  const relire = racine.querySelector('.tel-relire')
  const bandeau = racine.querySelector('.tel-relecture')
  assert.equal(relire.hidden, true)
  assert.equal(bandeau.hidden, true)
  relecture.el.hidden = false
  await attendre()
  assert.equal(relire.hidden, false, 'quelque chose à décider : on peut relire')
  assert.equal(bandeau.hidden, true, 'mais le bandeau n’existe pas encore')
  assert.ok(!/\d/.test(relire.textContent), 'aucun compteur dans le bouton (décision D13)')
  api.demonter()
})

test('Relire ouvre le bandeau sur la modification courante ; la croix le ferme', async () => {
  const w = installerDom()
  const { racine, relecture, api } = monter(w)
  relecture.el.hidden = false
  await attendre()
  racine.querySelector('.tel-relire').dispatchEvent(new w.Event('click', { bubbles: true }))
  const bandeau = racine.querySelector('.tel-relecture')
  assert.equal(bandeau.hidden, false)
  assert.equal(relecture.allers, 1, 'va à la modification courante')
  assert.ok(bandeau.contains(relecture.el), 'le même nœud, déménagé')
  assert.equal(racine.querySelector('.tel-relecture-auteur').textContent, 'Lucie')
  assert.equal(racine.querySelector('.tel-relire').hidden, true, 'le bouton cède la place au bandeau')

  racine.querySelector('.tel-relecture-fermer').dispatchEvent(new w.Event('click', { bubbles: true }))
  assert.equal(bandeau.hidden, true)
  assert.equal(racine.querySelector('.tel-relire').hidden, false)
  api.demonter()
})

test('le bandeau se ferme de lui-même quand il ne reste plus rien à décider', async () => {
  const w = installerDom()
  const { racine, relecture, api } = monter(w)
  relecture.el.hidden = false
  await attendre()
  racine.querySelector('.tel-relire').dispatchEvent(new w.Event('click', { bubbles: true }))
  relecture.el.hidden = true
  await attendre()
  assert.equal(racine.querySelector('.tel-relecture').hidden, true)
  assert.equal(racine.querySelector('.tel-relire').hidden, true)
  api.demonter()
})

test('toucher un passage marqué ouvre la relecture', async () => {
  const w = installerDom()
  const { racine, relecture, api } = monter(w)
  relecture.el.hidden = false
  await attendre()
  const marque = w.document.createElement('ins')
  marque.className = 'tracked-insertion'
  racine.appendChild(marque)
  marque.dispatchEvent(new w.Event('click', { bubbles: true }))
  await attendre()
  assert.equal(racine.querySelector('.tel-relecture').hidden, false)
  assert.equal(relecture.allers, 1)
  api.demonter()
})

test('l’auteur du bandeau ne relance pas l’observateur à chaque tour (la page ne se fige pas)', async () => {
  const w = installerDom()
  const { racine, relecture, api } = monter(w)
  let mutations = 0
  const compteur = new w.MutationObserver(() => mutations++)
  compteur.observe(relecture.el, { childList: true, subtree: true, characterData: true })
  relecture.el.hidden = false
  await attendre()
  racine.querySelector('.tel-relire').dispatchEvent(new w.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 60))
  compteur.disconnect()
  assert.ok(mutations < 5, `quelques mutations, pas une boucle (vu ${mutations})`)
  api.demonter()
})

test('en défilant vers le bas les barres s’effacent, en remontant elles reviennent', () => {
  const w = installerDom()
  const { racine, api } = monter(w)
  const haut = racine.querySelector('.tel-haut')
  const defiler = (y) => {
    Object.defineProperty(w, 'scrollY', { value: y, configurable: true })
    w.dispatchEvent(new w.Event('scroll'))
  }
  defiler(400)
  assert.ok(haut.classList.contains('tel-haut-masque'), 'masquées en descendant')
  defiler(380)
  assert.ok(!haut.classList.contains('tel-haut-masque'), 'de retour au moindre geste vers le haut')
  defiler(600)
  assert.ok(haut.classList.contains('tel-haut-masque'))
  defiler(0)
  assert.ok(!haut.classList.contains('tel-haut-masque'), 'toujours visibles en haut de page')
  api.demonter()
})

test('les barres ne s’effacent pas pendant une relecture ni feuille ouverte', async () => {
  const w = installerDom()
  const { racine, relecture, api } = monter(w)
  const haut = racine.querySelector('.tel-haut')
  const defiler = (y) => {
    Object.defineProperty(w, 'scrollY', { value: y, configurable: true })
    w.dispatchEvent(new w.Event('scroll'))
  }
  racine.querySelector('.tel-plan').dispatchEvent(new w.Event('click', { bubbles: true }))
  defiler(300)
  assert.ok(!haut.classList.contains('tel-haut-masque'), 'une feuille est ouverte')
  fermerFeuille()
  w.document.querySelector('.feuille')?.remove()

  relecture.el.hidden = false
  await attendre()
  racine.querySelector('.tel-relire').dispatchEvent(new w.Event('click', { bubbles: true }))
  defiler(0)
  defiler(500)
  assert.ok(!haut.classList.contains('tel-haut-masque'), 'une relecture est ouverte')
  api.demonter()
})

test('le réglage du menu ⋯ coupe l’effacement, et il est retenu', () => {
  const w = installerDom()
  const { racine, api } = monter(w)
  racine.querySelector('.tel-plus').dispatchEvent(new w.Event('click', { bubbles: true }))
  const entree = [...w.document.querySelectorAll('.tel-menu-entree')].find((b) =>
    /Masquer les barres/.test(b.textContent)
  )
  assert.ok(entree, 'l’entrée existe')
  assert.match(entree.textContent, /oui/)
  entree.dispatchEvent(new w.Event('click', { bubbles: true }))
  assert.match(entree.textContent, /non/)
  assert.equal(globalThis.localStorage.getItem('amend.tel.masquer-barres'), 'non')
  fermerFeuille()
  w.document.querySelector('.feuille')?.remove()

  Object.defineProperty(w, 'scrollY', { value: 500, configurable: true })
  w.dispatchEvent(new w.Event('scroll'))
  assert.ok(!racine.querySelector('.tel-haut').classList.contains('tel-haut-masque'), 'plus d’effacement')
  api.demonter()
})
