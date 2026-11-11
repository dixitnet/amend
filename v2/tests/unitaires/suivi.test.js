// Le suivi du back-office (application/client/suivi.js) : la courbe de la
// mémoire d'un processus, à partir des relevés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { courbeDeMemoire } from '../../application/client/suivi.js'

test('courbe de mémoire : un processus, la période, la part du plus haut relevé', () => {
  const mesures = [
    { le: 50, processus: 'serveur', memoire: 999 }, // avant la période
    { le: 100, processus: 'serveur', memoire: 100 },
    { le: 150, processus: 'collaboration', memoire: 300 },
    { le: 150, processus: 'serveur', memoire: 200 },
    { le: 200, processus: 'serveur', memoire: 150 },
  ]
  assert.deepEqual(courbeDeMemoire(mesures, 'serveur', { debut: 100, fin: 200 }), {
    points: [
      { x: 0, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0.75 },
    ],
    min: 100,
    max: 200,
    dernier: 150,
  })
})

test('courbe de mémoire : rien à tracer sans deux relevés, ni sur une période vide', () => {
  const un = [{ le: 100, processus: 'serveur', memoire: 100 }]
  assert.equal(courbeDeMemoire(un, 'serveur', { debut: 0, fin: 200 }), null)
  assert.equal(courbeDeMemoire([], 'serveur', { debut: 0, fin: 200 }), null)
  assert.equal(
    courbeDeMemoire([...un, { le: 150, processus: 'serveur', memoire: 5 }], 'collaboration', { debut: 0, fin: 200 }),
    null,
  )
  assert.equal(courbeDeMemoire([...un, ...un], 'serveur', { debut: 200, fin: 200 }), null)
})
