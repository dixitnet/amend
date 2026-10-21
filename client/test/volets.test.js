// Les volets (lot L1, 21/10/2026, interface/volets.js) : leurs boutons vivent
// dans la rangée fixe, pas dans la colonne ; ouvrir ou fermer ne change rien
// à ces boutons, sinon leur état enfoncé ; l'état est retenu par appareil.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://amend.test/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage

const { monterVolet, FERME } = await import('../src/interface/volets.js')

function monter({ defaut = 'modifications', cle = 'essai.volet' } = {}) {
  const colonne = document.createElement('div')
  const rangee = document.createElement('div')
  document.body.append(rangee, colonne)
  const modifs = document.createElement('div')
  const margo = document.createElement('div')
  const changements = []
  const v = monterVolet({
    colonne,
    hoteBoutons: rangee,
    panneaux: [
      { id: 'modifications', libelle: 'Modifications', icone: 'coche', panneau: modifs },
      { id: 'margo', libelle: 'Margo (IA)', icone: 'etincelle', panneau: margo },
    ],
    cleMemoire: cle,
    defaut,
    surChangement: (e) => changements.push(e),
  })
  const bouton = (id) => rangee.querySelector(`.volet-bouton[data-panneau="${id}"]`)
  return { colonne, rangee, modifs, margo, v, bouton, changements }
}

test('les boutons sont dans la rangée, les panneaux dans la colonne', () => {
  localStorage.clear()
  const { colonne, rangee, modifs, margo, v, bouton } = monter()
  assert.equal(rangee.querySelectorAll('.volet-bouton').length, 2)
  assert.equal(colonne.querySelectorAll('.volet-bouton').length, 0, 'rien dans la colonne')
  assert.equal(modifs.parentNode, colonne)
  assert.equal(v.etat(), 'modifications')
  assert.equal(bouton('modifications').getAttribute('aria-pressed'), 'true')
  assert.equal(modifs.hidden, false)
  assert.equal(margo.hidden, true, 'un seul panneau à la fois')
  assert.ok(bouton('margo').querySelector('svg'), 'une icône SVG')
  assert.equal(bouton('margo').getAttribute('aria-label'), 'Margo (IA)')
})

test('fermer le volet ne change rien aux boutons, sinon leur état enfoncé', () => {
  localStorage.clear()
  const { rangee, colonne, v, bouton, changements } = monter()
  const avant = rangee.innerHTML.replace(/ class="[^"]*"| aria-pressed="[^"]*"/g, '')
  bouton('modifications').click()
  assert.equal(v.etat(), FERME, 'le bouton du panneau ouvert ferme le volet')
  assert.ok(colonne.classList.contains('volet-ferme'))
  assert.equal(rangee.innerHTML.replace(/ class="[^"]*"| aria-pressed="[^"]*"/g, ''), avant, 'mêmes boutons, même ordre')
  assert.equal(bouton('modifications').getAttribute('aria-pressed'), 'false')
  bouton('margo').click()
  assert.equal(v.etat(), 'margo', 'un bouton rouvre le volet sur son panneau')
  bouton('modifications').click()
  assert.equal(v.etat(), 'modifications', 'et passe d’un panneau à l’autre')
  assert.deepEqual(changements, ['modifications', FERME, 'margo', 'modifications'])
})

test('l’état est retenu (par appareil) et rejoué au montage suivant', () => {
  localStorage.clear()
  const a = monter()
  a.bouton('margo').click()
  assert.equal(localStorage.getItem('essai.volet'), 'margo')
  assert.equal(monter().v.etat(), 'margo')
  monter().v.fermer()
  assert.equal(monter().v.etat(), FERME, 'fermé, il le reste au rechargement')
})

test('cacher le bouton du panneau ouvert (pas de droit à Margo) ramène à un panneau disponible', () => {
  localStorage.clear()
  const { v, bouton } = monter({ defaut: 'margo' })
  v.afficherPanneau('margo', false)
  assert.ok(bouton('margo').hidden)
  assert.equal(v.etat(), 'modifications')
  v.ouvrir('margo')
  assert.equal(v.etat(), 'modifications', 'un panneau caché ne s’ouvre pas')
})

test('un stockage local qui refuse d’écrire ne casse rien', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError')
    },
  })
  try {
    const { v, bouton } = monter()
    assert.equal(v.etat(), 'modifications')
    bouton('margo').click()
    assert.equal(v.etat(), 'margo')
  } finally {
    Object.defineProperty(globalThis, 'localStorage', original)
  }
})
