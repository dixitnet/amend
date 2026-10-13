// Une page périmée (13/10/2026) : voir src/versionClient.js. Un onglet resté
// ouvert sur l'ancien code supprime pour tout le monde les types de bloc qu'il
// ne connaît pas ; on le reconnaît au fichier principal qu'il a chargé.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  fichierPrincipalCharge,
  etatDeLaVersion,
  afficherBandeauVersion,
  surveillerLaVersion,
} from '../src/versionClient.js'

const page = (fichier) =>
  new JSDOM(`<!doctype html><html><body><script type="module" src="/assets/${fichier}"></script></body></html>`).window
    .document
const reponse =
  (fichier, ok = true) =>
  async () => ({
    ok,
    text: async () => `<html><script type="module" crossorigin src="/assets/${fichier}"></script></html>`,
  })

test('le fichier principal chargé se lit dans la page ; rien en développement', () => {
  assert.equal(fichierPrincipalCharge(page('index-Ek-eI6iF.js')), 'index-Ek-eI6iF.js')
  const dev = new JSDOM('<script type="module" src="/src/main.js"></script>').window.document
  assert.equal(fichierPrincipalCharge(dev), null)
})

test('même fichier : à jour ; autre fichier : périmée', async () => {
  const doc = page('index-AAA.js')
  assert.equal(await etatDeLaVersion({ doc, fetchFn: reponse('index-AAA.js') }), 'a_jour')
  assert.equal(await etatDeLaVersion({ doc, fetchFn: reponse('index-BBB.js') }), 'perimee')
})

test('réseau coupé, erreur du serveur, page sans script ou développement : jamais « périmée »', async () => {
  const doc = page('index-AAA.js')
  assert.equal(
    await etatDeLaVersion({
      doc,
      fetchFn: async () => {
        throw new Error('hors ligne')
      },
    }),
    'inconnue'
  )
  assert.equal(await etatDeLaVersion({ doc, fetchFn: reponse('index-BBB.js', false) }), 'inconnue')
  assert.equal(
    await etatDeLaVersion({ doc, fetchFn: async () => ({ ok: true, text: async () => '<html></html>' }) }),
    'inconnue'
  )
  const dev = new JSDOM('<body></body>').window.document
  assert.equal(await etatDeLaVersion({ doc: dev, fetchFn: reponse('index-BBB.js') }), 'inconnue')
})

test('le bandeau compte à rebours puis recharge ; le bouton recharge tout de suite', () => {
  const doc = page('index-AAA.js')
  let tic
  let rechargements = 0
  const b = afficherBandeauVersion({
    doc,
    secondes: 3,
    recharger: () => rechargements++,
    setIntervalFn: (f) => ((tic = f), 1),
    clearIntervalFn: () => {},
  })
  assert.match(b.bandeau.textContent, /dans 3 s/)
  tic()
  assert.match(b.bandeau.textContent, /dans 2 s/)
  tic()
  tic()
  assert.equal(rechargements, 1)
  b.bandeau.querySelector('button').click()
  assert.equal(rechargements, 2)
})

test('la surveillance affiche le bandeau une seule fois quand le serveur annonce un autre fichier', async () => {
  const doc = page('index-AAA.js')
  let verifier
  let rechargements = 0
  const arreter = surveillerLaVersion({
    doc,
    fetchFn: reponse('index-BBB.js'),
    recharger: () => rechargements++,
    setIntervalFn: (f) => ((verifier = f), 1),
  })
  await verifier()
  await verifier()
  assert.equal(doc.querySelectorAll('.bandeau-version').length, 1)
  arreter()
})
