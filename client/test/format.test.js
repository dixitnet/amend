// Les formats S, M, L (21/10/2026) : une seule fonction décide, un attribut
// `data-format` le publie (src/interface/format.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><body><div id="racine"></div></body>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document

const { formatDe, suivreLeFormat } = await import('../src/interface/format.js')

test('formatDe : S jusqu’à 700 px, M de 701 à 1 279, L à partir de 1 280', () => {
  assert.equal(formatDe(320), 'S')
  assert.equal(formatDe(390), 'S')
  assert.equal(formatDe(700), 'S')
  assert.equal(formatDe(701), 'M')
  assert.equal(formatDe(834), 'M')
  assert.equal(formatDe(1194), 'M')
  assert.equal(formatDe(1279), 'M')
  assert.equal(formatDe(1280), 'L')
  assert.equal(formatDe(1440), 'L')
  assert.equal(formatDe(0), 'L', 'une largeur inconnue donne le grand format, le moins surprenant')
})

/** Une fausse fenêtre dont on règle la largeur, avec ses écouteurs. */
function fenetre(largeur) {
  const ecouteurs = []
  const w = { largeur }
  w.matchMedia = (requete) => {
    const m = {
      media: requete,
      get matches() {
        const max = /max-width: (\d+)px/.exec(requete)
        const min = /min-width: (\d+)px/.exec(requete)
        return (!max || w.largeur <= +max[1]) && (!min || w.largeur >= +min[1])
      },
      addEventListener(_t, f) {
        ecouteurs.push(f)
      },
      removeEventListener(_t, f) {
        ecouteurs.splice(ecouteurs.indexOf(f), 1)
      },
    }
    return m
  }
  w.changer = (nouvelle) => {
    w.largeur = nouvelle
    for (const f of [...ecouteurs]) f()
  }
  w.nbEcouteurs = () => ecouteurs.length
  return w
}

test('suivreLeFormat pose data-format, le tient à jour et se défait', () => {
  const w = fenetre(390)
  window.matchMedia = w.matchMedia
  const racine = document.getElementById('racine')
  const vus = []
  const arreter = suivreLeFormat(racine, (f) => vus.push(f))
  assert.equal(racine.dataset.format, 'S')
  w.changer(834)
  assert.equal(racine.dataset.format, 'M')
  w.changer(900)
  assert.deepEqual(vus, ['S', 'M'], 'pas de rappel quand le format ne change pas')
  w.changer(1440)
  assert.equal(racine.dataset.format, 'L')
  arreter()
  assert.equal(racine.dataset.format, undefined)
  assert.equal(w.nbEcouteurs(), 0, 'plus aucun écouteur')
})

test('sans matchMedia : ni S ni L, donc M, sans exception', () => {
  delete window.matchMedia
  const racine = document.getElementById('racine')
  const arreter = suivreLeFormat(racine)
  assert.equal(racine.dataset.format, 'M', 'M par défaut')
  arreter()
})
