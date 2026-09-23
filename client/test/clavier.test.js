// La hauteur du clavier virtuel (23/09/2026).
//
// Ce test existe parce que je m'étais fié à deux affirmations fausses :
// que `100dvh` suivrait l'ouverture du clavier, et que
// `env(keyboard-inset-height)` serait disponible partout. Sur iPhone, ni
// l'un ni l'autre — la barre d'outils se retrouvait sous le clavier, et
// semblait n'arriver qu'« après avoir validé une modification », c'est-à-dire
// au moment où le clavier se refermait.
//
// La seule chose qui bouge sur iOS quand le clavier s'ouvre est la fenêtre
// visuelle : c'est elle qu'on mesure.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { suivreLeClavier } from '../src/clavier.js'

/** Une fenêtre visuelle pilotable, comme celle d'un navigateur mobile. */
function installerDom({ innerHeight = 800, avecFenetreVisuelle = true } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="shell"></div></body>', { url: 'http://localhost/' })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.requestAnimationFrame = (fn) => {
    fn(0)
    return 1
  }
  globalThis.cancelAnimationFrame = () => {}
  Object.defineProperty(w, 'innerHeight', { value: innerHeight, configurable: true, writable: true })
  if (avecFenetreVisuelle) {
    const ecouteurs = {}
    w.visualViewport = {
      height: innerHeight,
      offsetTop: 0,
      addEventListener(type, fn) {
        ;(ecouteurs[type] = ecouteurs[type] || []).push(fn)
      },
      removeEventListener(type, fn) {
        ecouteurs[type] = (ecouteurs[type] || []).filter((f) => f !== fn)
      },
      _emettre(type) {
        for (const fn of ecouteurs[type] || []) fn()
      },
      _ecouteurs: ecouteurs,
    }
  } else {
    w.visualViewport = undefined
  }
  return w
}

const hauteur = (el) => el.style.getPropertyValue('--clavier')

test('clavier fermé : aucune hauteur réservée', () => {
  const w = installerDom()
  const el = w.document.getElementById('shell')
  suivreLeClavier(el)
  assert.equal(hauteur(el), '0px')
})

test('clavier ouvert : la hauteur cachée est publiée', () => {
  const w = installerDom({ innerHeight: 800 })
  const el = w.document.getElementById('shell')
  suivreLeClavier(el)

  // iOS ne redimensionne pas la page : il réduit la fenêtre visuelle.
  w.visualViewport.height = 460
  w.visualViewport._emettre('resize')
  assert.equal(hauteur(el), '340px')
})

test('le décalage de défilement compte aussi', () => {
  // Faire défiler pendant que le clavier est ouvert déplace la fenêtre
  // visuelle sans la redimensionner — d'où l'écoute de `scroll`.
  const w = installerDom({ innerHeight: 800 })
  const el = w.document.getElementById('shell')
  suivreLeClavier(el)
  w.visualViewport.height = 460
  w.visualViewport.offsetTop = 40
  w.visualViewport._emettre('scroll')
  assert.equal(hauteur(el), '300px')
})

test('les quelques pixels de la barre d’adresse ne font pas bouger l’interface', () => {
  const w = installerDom({ innerHeight: 800 })
  const el = w.document.getElementById('shell')
  suivreLeClavier(el)
  w.visualViewport.height = 788 // 12 px : du bruit
  w.visualViewport._emettre('resize')
  assert.equal(hauteur(el), '0px')
})

test('une fenêtre visuelle plus grande que la page ne donne jamais de hauteur négative', () => {
  const w = installerDom({ innerHeight: 800 })
  const el = w.document.getElementById('shell')
  suivreLeClavier(el)
  w.visualViewport.height = 900
  w.visualViewport._emettre('resize')
  assert.equal(hauteur(el), '0px')
})

test('tout se défait proprement', () => {
  const w = installerDom({ innerHeight: 800 })
  const el = w.document.getElementById('shell')
  const arreter = suivreLeClavier(el)
  w.visualViewport.height = 460
  w.visualViewport._emettre('resize')
  assert.equal(hauteur(el), '340px')

  arreter()
  assert.equal(hauteur(el), '', 'la variable est retirée')
  assert.equal(w.visualViewport._ecouteurs.resize.length, 0, 'et les écouteurs avec')
})

test('sans fenêtre visuelle, rien ne casse', () => {
  // Un navigateur ancien, ou un environnement de test : l'application doit
  // continuer, simplement sans savoir où est le clavier.
  const w = installerDom({ avecFenetreVisuelle: false })
  const el = w.document.getElementById('shell')
  const arreter = suivreLeClavier(el)
  assert.equal(typeof arreter, 'function')
  arreter()
})

test("le changement de hauteur est annoncé, et seulement quand il change", () => {
  // Pourquoi c'est nécessaire : l'ouverture du clavier rétrécit la zone de
  // texte sans rien déplacer dans le document. Sans ce signal, le curseur
  // reste là où il était — c'est-à-dire sous le clavier.
  const w = installerDom({ innerHeight: 800 })
  const el = w.document.getElementById('shell')
  const vues = []
  const arreter = suivreLeClavier(el, (h) => vues.push(h))

  w.visualViewport.height = 460
  w.visualViewport._emettre('resize')
  assert.deepEqual(vues, [0, 340], "l'état initial, puis le clavier")

  // Un défilement qui ne change rien ne doit pas réveiller l'interface.
  w.visualViewport._emettre('scroll')
  assert.deepEqual(vues, [0, 340], 'aucune annonce inutile')

  w.visualViewport.height = 800
  w.visualViewport._emettre('resize')
  assert.deepEqual(vues, [0, 340, 0], 'et la fermeture est annoncée')
  arreter()
})
