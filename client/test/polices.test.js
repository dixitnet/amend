// Les polices de l'instance côté navigateur (24/10/2026) : le catalogue entre
// dans la liste partagée, les @font-face pointent vers l'instance, un échec
// ne casse rien.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { POLICES, POLICES_BASE, appliquerCatalogue, police } from '../../shared/style.js'
import { chargerPolices, assurerPolices } from '../src/polices.js'

const CATALOGUE = [
  {
    id: 'i-garamond-test',
    label: 'Garamond Test',
    famille: 'Garamond Test',
    generique: 'serif',
    fichiers: [
      { nom: 'i-garamond-test-aaaaaaaaaaaa.ttf', poids: 400, italique: false },
      { nom: 'i-garamond-test-bbbbbbbbbbbb.otf', poids: 700, italique: true },
    ],
  },
  // Un nom de famille qui s'échapperait d'une chaîne CSS : écarté.
  {
    id: 'i-piege',
    famille: 'x"}body{display:none',
    generique: 'serif',
    fichiers: [{ nom: 'i-piege-cccccccccccc.ttf', poids: 400, italique: false }],
  },
]

function preparer(reponse) {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const appels = []
  globalThis.fetch = async (url) => {
    appels.push(url)
    if (reponse instanceof Error) throw reponse
    return { ok: reponse.ok !== false, status: reponse.status || 200, json: async () => reponse.json }
  }
  return { appels, css: () => (document.getElementById('amend-polices-instance') || {}).textContent }
}

test('chargerPolices : applique le catalogue et déclare les fichiers de l’instance', async () => {
  const m = preparer({ json: { polices: CATALOGUE } })
  try {
    assert.equal(await chargerPolices(), 1, 'la police au nom piégé est écartée')
    assert.deepEqual(m.appels, ['/api/polices'])
    assert.equal(police('i-garamond-test').css, '"Garamond Test", serif')
    assert.equal(POLICES.length, POLICES_BASE.length + 1)
    const css = m.css()
    assert.match(
      css,
      /font-family:"Garamond Test";src:url\("\/api\/polices\/i-garamond-test\/i-garamond-test-aaaaaaaaaaaa\.ttf"\) format\("truetype"\);font-weight:400;font-style:normal/
    )
    assert.match(css, /i-garamond-test-bbbbbbbbbbbb\.otf"\) format\("opentype"\);font-weight:700;font-style:italic/)
    assert.ok(!css.includes('display:none'), 'rien de la famille piégée dans le CSS')
  } finally {
    appliquerCatalogue([])
  }
})

test('chargerPolices : un serveur qui répond mal laisse le catalogue comme il était', async () => {
  for (const reponse of [{ ok: false, status: 401, json: {} }, { json: { autre: 1 } }, new Error('réseau')]) {
    preparer(reponse)
    appliquerCatalogue([{ id: 'i-deja', famille: 'Déjà là', generique: 'serif' }])
    try {
      assert.equal(await chargerPolices(), null)
      assert.equal(police('i-deja').typst[0], 'Déjà là')
    } finally {
      appliquerCatalogue([])
    }
  }
})

test('assurerPolices : une seule requête par page', async () => {
  const m = preparer({ json: { polices: [] } })
  await Promise.all([assurerPolices(), assurerPolices()])
  await assurerPolices()
  assert.equal(m.appels.length, 1)
})
