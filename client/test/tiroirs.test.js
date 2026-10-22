// Les tiroirs du format M (lot M2, 21/10/2026) : sous 1 100 px, un volet se pose
// par-dessus le texte à sa largeur pleine, sans le déplacer ni le rétrécir ;
// il démarre fermé et n'est pas retenu d'une visite à l'autre.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { calculerDisposition, SUPERPOSE, FERME } from '../src/interface/disposition.js'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://amend.test/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
const { monterVolet } = await import('../src/interface/volets.js')

const PLAN = { ouvert: true, largeur: 260, minimum: 200 }
const DROITE = { ouvert: true, largeur: 320, minimum: 280 }
const FERMEE = { ouvert: false, largeur: 320 }

test('un tiroir garde sa largeur pleine et ne pousse jamais le texte', () => {
  for (const largeur of [701, 768, 834, 1024, 1100]) {
    const d = calculerDisposition({ largeur, texte: 710, gauche: FERMEE, droite: DROITE, tiroirs: true })
    assert.equal(d.droite, SUPERPOSE)
    assert.equal(d.largeurDroite, 320, `largeur ${largeur}`)
    assert.equal(d.margeGauche, 0)
    assert.equal(d.margeDroite, 0)
    assert.equal(d.gouttiere, false, 'pas de gouttière en M')
  }
})

test('un tiroir ne couvre jamais plus de 80 % de l’écran', () => {
  const d = calculerDisposition({ largeur: 300, texte: 710, gauche: PLAN, droite: FERMEE, tiroirs: true })
  assert.equal(d.largeurGauche, 240)
  const e = calculerDisposition({
    largeur: 701,
    texte: 710,
    gauche: FERMEE,
    droite: { ...DROITE, largeur: 900 },
    tiroirs: true,
  })
  assert.equal(e.largeurDroite, 560)
})

test('un tiroir fermé est fermé, sans largeur', () => {
  const d = calculerDisposition({ largeur: 768, texte: 710, gauche: FERMEE, droite: FERMEE, tiroirs: true })
  assert.equal(d.gauche, FERME)
  assert.equal(d.droite, FERME)
  assert.equal(d.largeurGauche, 0)
  assert.equal(d.largeurDroite, 0)
})

test('sans tiroirs, la disposition de L reste celle d’avant (le texte peut glisser)', () => {
  const d = calculerDisposition({ largeur: 1194, texte: 710, gauche: PLAN, droite: DROITE })
  assert.ok(d.margeGauche > 0 || d.margeDroite > 0 || d.largeurDroite <= 320)
})

function monter({ fermerAuDepart, memoriser, cle }) {
  const colonne = document.createElement('div')
  const rangee = document.createElement('div')
  document.body.append(rangee, colonne)
  const p = document.createElement('div')
  return monterVolet({
    colonne,
    hoteBoutons: rangee,
    panneaux: [{ id: 'plan', libelle: 'Plan', icone: 'plan', panneau: p }],
    cleMemoire: cle,
    defaut: 'plan',
    fermerAuDepart,
    memoriser,
  })
}

test('un tiroir démarre fermé quoi qu’on ait retenu en grand écran, sans écraser ce souvenir', () => {
  localStorage.clear()
  localStorage.setItem('essai.tiroir', 'plan')
  const v = monter({ fermerAuDepart: () => true, memoriser: () => false, cle: 'essai.tiroir' })
  assert.equal(v.etat(), FERME)
  assert.equal(localStorage.getItem('essai.tiroir'), 'plan', 'la préférence grand écran est intacte')
  v.ouvrir('plan')
  v.fermer()
  assert.equal(localStorage.getItem('essai.tiroir'), 'plan', 'ni à l’ouverture ni à la fermeture')
})

test('hors tiroir, l’état est retenu comme avant', () => {
  localStorage.clear()
  const v = monter({ fermerAuDepart: () => false, memoriser: () => true, cle: 'essai.normal' })
  assert.equal(v.etat(), 'plan')
  v.fermer()
  assert.equal(localStorage.getItem('essai.normal'), 'ferme')
})
