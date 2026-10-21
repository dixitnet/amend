// La disposition des volets (lot L1 puis L4, 21/10/2026, interface/disposition.js) :
// un volet ouvert se pose toujours par-dessus le fond, dans la marge ; le texte
// ne bouge pas si la marge suffit, glisse du strict nécessaire sinon, se
// rétrécit entre les volets en dernier recours, et la gouttière des commentaires
// se replie plutôt que d'étrangler la colonne.

import test from 'node:test'
import assert from 'node:assert/strict'
import { calculerDisposition, decalageBarre, SUPERPOSE, FERME, MARGE_MINIMALE } from '../src/interface/disposition.js'

const PLAN = { ouvert: true, largeur: 220, minimum: 200 }
const DROITE = { ouvert: true, largeur: 320, minimum: 280 }
const ferme = (v) => ({ ...v, ouvert: false })
const TEXTE = 797 // 78 ch + marges intérieures
const PEUPLEE = 280
const VIDE = 44

test('fermés : rien à disposer, le texte ne bouge pas', () => {
  const d = calculerDisposition({
    largeur: 1440,
    texte: TEXTE,
    gouttiere: VIDE,
    gouttiereMax: PEUPLEE,
    gauche: ferme(PLAN),
    droite: ferme(DROITE),
  })
  assert.deepEqual([d.gauche, d.droite, d.margeGauche, d.margeDroite], [FERME, FERME, 0, 0])
})

test('1 440 px, gouttière vide : les deux volets dans les marges, le droit un peu rétréci, texte immobile', () => {
  const d = calculerDisposition({
    largeur: 1440,
    texte: TEXTE,
    gouttiere: VIDE,
    gouttiereMax: PEUPLEE,
    gauche: PLAN,
    droite: DROITE,
  })
  assert.deepEqual([d.gauche, d.droite], [SUPERPOSE, SUPERPOSE])
  assert.equal(d.largeurGauche, 220)
  assert.equal(d.largeurDroite, 299, 'rétréci pour tenir dans la marge')
  assert.deepEqual([d.margeGauche, d.margeDroite], [0, 0])
})

test('1 920 px : place pour tout, à la largeur prévue, sans bouger', () => {
  const d = calculerDisposition({
    largeur: 1920,
    texte: TEXTE,
    gouttiere: PEUPLEE,
    gouttiereMax: PEUPLEE,
    gauche: PLAN,
    droite: DROITE,
  })
  assert.deepEqual([d.largeurGauche, d.largeurDroite, d.margeGauche, d.margeDroite], [220, 320, 0, 0])
  assert.equal(d.gouttiere, true)
})

test('gouttière peuplée à 1 440 px, volet droit seul : le texte glisse du strict nécessaire', () => {
  const d = calculerDisposition({
    largeur: 1440,
    texte: TEXTE,
    gouttiere: PEUPLEE,
    gauche: ferme(PLAN),
    droite: DROITE,
  })
  // marge naturelle (1 440 − 1 077) / 2 = 181 ; il en faut 280 : le groupe glisse de 98 px
  assert.equal(d.largeurDroite, 280)
  assert.equal(d.margeGauche, 0)
  assert.equal(d.margeDroite, 197, 'le groupe est recentré dans une zone réduite de 2 × 98,5 px')
  assert.equal(d.gouttiere, true)
})

test('le plan seul glisse le texte vers la droite, pas plus', () => {
  const d = calculerDisposition({
    largeur: 1366,
    texte: TEXTE,
    gouttiere: PEUPLEE,
    gauche: PLAN,
    droite: ferme(DROITE),
  })
  // marge naturelle (1 366 − 1 077) / 2 = 144 ; le plan en prend 200 (son minimum) : glisse de 56
  assert.equal(d.largeurGauche, 200)
  assert.equal(d.margeGauche, 111)
  assert.equal(d.margeDroite, 0)
})

test('le texte garde une marge minimale contre le bord de la fenêtre', () => {
  const d = calculerDisposition({
    largeur: 1000,
    texte: TEXTE,
    gouttiere: 0,
    gouttiereMax: 0,
    gauche: ferme(PLAN),
    droite: ferme(DROITE),
  })
  // 1 000 px pour 797 : la marge naturelle (101) dépasse le minimum
  assert.deepEqual([d.margeGauche, d.margeDroite], [0, 0])
  const e = calculerDisposition({
    largeur: 840,
    texte: TEXTE,
    gouttiere: 0,
    gouttiereMax: 0,
    gauche: ferme(PLAN),
    droite: ferme(DROITE),
  })
  assert.deepEqual(
    [e.margeGauche, e.margeDroite],
    [MARGE_MINIMALE, MARGE_MINIMALE],
    'il ne resterait que 21 px de chaque côté : la colonne se rétrécit'
  )
  const f = calculerDisposition({
    largeur: 700,
    texte: TEXTE,
    gouttiere: 0,
    gouttiereMax: 0,
    gauche: ferme(PLAN),
    droite: ferme(DROITE),
  })
  assert.deepEqual([f.margeGauche, f.margeDroite], [MARGE_MINIMALE, MARGE_MINIMALE])
})

test('1 280 px, deux volets : la gouttière se replie, le texte garde sa largeur', () => {
  const d = calculerDisposition({ largeur: 1280, texte: TEXTE, gouttiere: PEUPLEE, gauche: PLAN, droite: DROITE })
  assert.equal(d.gouttiere, false)
  assert.equal(d.margeGauche, 220)
  assert.equal(d.margeDroite, 280)
  assert.equal(1280 - d.margeGauche - d.margeDroite, 780, 'la colonne ne descend pas sous 560 px')
})

test('1 366 px, deux volets : la gouttière tient encore, la colonne reste au-dessus de son minimum', () => {
  const d = calculerDisposition({ largeur: 1366, texte: TEXTE, gouttiere: PEUPLEE, gauche: PLAN, droite: DROITE })
  assert.equal(d.gouttiere, true)
  assert.ok(1366 - d.margeGauche - d.margeDroite - PEUPLEE >= 560)
})

test('le repli ne dépend pas de ce que la gouttière contient à cet instant', () => {
  const vide = calculerDisposition({
    largeur: 1300,
    texte: TEXTE,
    gouttiere: VIDE,
    gouttiereMax: PEUPLEE,
    gauche: PLAN,
    droite: DROITE,
  })
  const peuplee = calculerDisposition({
    largeur: 1300,
    texte: TEXTE,
    gouttiere: PEUPLEE,
    gouttiereMax: PEUPLEE,
    gauche: PLAN,
    droite: DROITE,
  })
  assert.equal(vide.gouttiere, peuplee.gouttiere)
})

test('gouttière absente de ce format : jamais de repli annoncé', () => {
  const d = calculerDisposition({
    largeur: 1200,
    texte: TEXTE,
    gouttiere: 0,
    gouttiereMax: 0,
    gauche: PLAN,
    droite: DROITE,
  })
  assert.equal(d.gouttiere, false)
})

test('la barre s’aligne sur le bord du texte, sans descendre sous le minimum', () => {
  assert.equal(decalageBarre({ gaucheBarre: 49, bordTexte: 370 }), 321)
  assert.equal(decalageBarre({ gaucheBarre: 49, bordTexte: 40 }), 8)
  assert.equal(decalageBarre({ gaucheBarre: 0, bordTexte: 20.4, minimum: 0 }), 20)
})
