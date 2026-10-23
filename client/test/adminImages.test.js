// Les images orphelines au back-office (23/10/2026) : le bloc de la rubrique
// Système, avec un faux serveur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { blocImagesOrphelines, brancherImagesOrphelines } from '../src/adminImages.js'

function monter(reponses) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="racine">${blocImagesOrphelines()}</div></body>`, {
    url: 'http://localhost/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    appels.push({ url, methode: init.method || 'GET' })
    const r = reponses.shift()
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json }
  }
  const racine = document.getElementById('racine')
  brancherImagesOrphelines(racine)
  const clic = async (selecteur) => {
    racine.querySelector(selecteur).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
  }
  return { racine, appels, clic, texte: () => racine.textContent.replace(/\s+/g, ' ') }
}

const ANALYSE = {
  fichiers: 12,
  octets: 3_000_000,
  orphelines: 3,
  octetsOrphelines: 1_200_000,
  illisibles: [],
  documents: [
    {
      docId: 'd1',
      titre: 'Mon livre',
      orphelines: [
        { nom: 'a', octets: 800_000, ageJours: 40 },
        { nom: 'b', octets: 200_000, ageJours: 9 },
      ],
      recentes: 0,
      gardees: 4,
    },
    { docId: 'd2', titre: null, orphelines: [{ nom: 'c', octets: 200_000, ageJours: 20 }], recentes: 1, gardees: 0 },
  ],
}

test('rien n’est lu avant le clic : le bloc n’a qu’un bouton Analyser', () => {
  const m = monter([])
  assert.equal(m.appels.length, 0)
  assert.ok(m.racine.querySelector('button[data-orph="analyser"]'))
  assert.ok(!m.racine.querySelector('button[data-orph="supprimer"]'))
})

test('Analyser affiche le résumé et les documents, sans rien supprimer', async () => {
  const m = monter([{ json: ANALYSE }])
  await m.clic('button[data-orph="analyser"]')
  assert.deepEqual(m.appels, [{ url: '/api/admin/images-orphelines', methode: 'GET' }])
  assert.match(m.texte(), /3 orpheline/)
  assert.match(m.texte(), /Mon livre/)
  assert.match(m.texte(), /document supprimé/, 'un document disparu est dit tel')
  assert.ok(m.racine.querySelector('button[data-orph="supprimer"]'))
})

test('Supprimer demande confirmation : un clic arme, le second agit', async () => {
  const m = monter([{ json: ANALYSE }, { json: { ok: true, supprimees: 3, octets: 1_200_000, echecs: 0 } }])
  await m.clic('button[data-orph="analyser"]')
  await m.clic('button[data-orph="supprimer"]')
  assert.equal(m.appels.length, 1, 'le premier clic ne supprime rien')
  assert.match(m.racine.querySelector('button[data-orph="supprimer"]').textContent, /Confirmer/)
  await m.clic('button[data-orph="supprimer"]')
  assert.deepEqual(m.appels[1], { url: '/api/admin/images-orphelines', methode: 'POST' })
  assert.match(m.texte(), /3 image\(s\) supprimée\(s\)/)
})

test('rien à nettoyer : pas de bouton Supprimer', async () => {
  const m = monter([{ json: { ...ANALYSE, orphelines: 0, octetsOrphelines: 0, documents: [] } }])
  await m.clic('button[data-orph="analyser"]')
  assert.match(m.texte(), /Rien à nettoyer/)
  assert.ok(!m.racine.querySelector('button[data-orph="supprimer"]'))
})

test('une source illisible : le bloc le dit et ne propose pas de supprimer', async () => {
  const m = monter([{ json: { ...ANALYSE, illisibles: [{ chemin: 'x', erreur: 'EIO' }] } }])
  await m.clic('button[data-orph="analyser"]')
  assert.match(m.texte(), /n'a pas pu être lue/)
  assert.ok(!m.racine.querySelector('button[data-orph="supprimer"]'))
})

test('un refus du serveur à la suppression est affiché, le bouton revient', async () => {
  const m = monter([
    { json: ANALYSE },
    { ok: false, status: 409, json: { error: 'Une source n’a pas pu être lue (1) : rien n’a été supprimé.' } },
  ])
  await m.clic('button[data-orph="analyser"]')
  await m.clic('button[data-orph="supprimer"]')
  await m.clic('button[data-orph="supprimer"]')
  assert.match(m.texte(), /rien n’a été supprimé/)
  assert.equal(m.racine.querySelector('button[data-orph="supprimer"]').disabled, false)
})
