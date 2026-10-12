// Point 60 : une citation ne doit jamais couper une paire de substitution
// (emoji) en deux — Yjs en ferait des U+FFFD, à des moments différents selon
// les clients.

import test from 'node:test'
import assert from 'node:assert/strict'
import { situer, coupeUnePaire } from '../agentTexte.js'

const bloc = { n: 1, texte: 'Un chat 🐈 dort sur le tapis 🪄 bleu.' }

test('une citation qui contient l’émoji entier est située normalement', () => {
  const r = situer(bloc, 'chat 🐈 dort')
  assert.equal(r.ok, true)
  assert.equal(bloc.texte.slice(r.debut, r.fin), 'chat 🐈 dort')
})

test('une citation qui finit au milieu d’un émoji est refusée avec une raison lisible', () => {
  const moitie = '🐈'[0] // moitié haute seule
  const r = situer(bloc, `chat ${moitie}`)
  assert.equal(r.ok, false)
  assert.match(r.raison, /émoji/)
})

test('une citation qui commence au milieu d’un émoji est refusée', () => {
  const moitie = '🐈'[1] // moitié basse seule
  const r = situer(bloc, `${moitie} dort`)
  assert.equal(r.ok, false)
  assert.match(r.raison, /émoji/)
})

test('coupeUnePaire : bords du texte et caractères ordinaires', () => {
  const t = 'a🐈b'
  assert.equal(coupeUnePaire(t, 1, 3), false, 'l’émoji entier')
  assert.equal(coupeUnePaire(t, 2, 4), true, 'commence entre les deux moitiés')
  assert.equal(coupeUnePaire(t, 0, 2), true, 'finit entre les deux moitiés')
  assert.equal(coupeUnePaire('abc', 0, 3), false)
  assert.equal(coupeUnePaire('', 0, 0), false)
})
