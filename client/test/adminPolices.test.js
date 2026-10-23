// Les polices au back-office (24/10/2026) : le bloc de la rubrique Système,
// avec un faux serveur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { appliquerCatalogue } from '../../shared/style.js'
import { blocPolices, brancherPolices } from '../src/adminPolices.js'

const POLICE = {
  id: 'i-garamond-test',
  label: 'Garamond Test',
  famille: 'Garamond Test',
  generique: 'serif',
  licence: 'SIL Open Font License 1.1',
  fichiers: [
    { nom: 'i-garamond-test-aaaaaaaaaaaa.ttf', poids: 400, italique: false, octets: 90_000 },
    { nom: 'i-garamond-test-bbbbbbbbbbbb.ttf', poids: 700, italique: true, octets: 95_000 },
  ],
}
const DETAIL = { polices: [POLICE], octets: 185_000, octetsMax: 100 * 1048576, familles: 30 }

/** `serveur` : fonction (url, init) -> { ok?, status?, json } ; tous les appels sont notés. */
function monter(serveur) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="racine">${blocPolices()}</div></body>`, {
    url: 'http://localhost/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    appels.push({ url, methode: init.method || 'GET', corps: init.body })
    const r = (await serveur(url, init)) || { json: {} }
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json }
  }
  const racine = document.getElementById('racine')
  brancherPolices(racine)
  const attendre = async () => {
    for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r))
  }
  return {
    dom,
    racine,
    appels,
    attendre,
    texte: () => racine.textContent.replace(/\s+/g, ' '),
    clic: async (selecteur) => {
      racine.querySelector(selecteur).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await attendre()
    },
  }
}

const catalogueVide = { json: { polices: [] } }

test('le bloc liste les familles déposées, leurs styles et leur licence', async () => {
  const m = monter((url) => (url === '/api/admin/polices' ? { json: DETAIL } : catalogueVide))
  await m.attendre()
  assert.match(m.texte(), /Garamond Test/)
  assert.match(m.texte(), /Regular, Bold italique/)
  assert.match(m.texte(), /SIL Open Font License/)
  assert.match(m.texte(), /1 famille\(s\) sur 30/)
})

test('liste vide : le bloc le dit et propose le dépôt', async () => {
  const m = monter((url) =>
    url === '/api/admin/polices' ? { json: { ...DETAIL, polices: [], octets: 0 } } : catalogueVide
  )
  await m.attendre()
  assert.match(m.texte(), /Aucune police déposée/)
  assert.ok(m.racine.querySelector('input[data-polices-fichier][multiple]'))
})

test('un échec de lecture est dit, sans exception', async () => {
  const m = monter((url) => (url === '/api/admin/polices' ? { ok: false, status: 500, json: {} } : catalogueVide))
  await m.attendre()
  assert.match(m.texte(), /n’a pas pu être chargée/)
})

test('supprimer : un clic arme, le second supprime, puis la liste est relue', async () => {
  let supprimee = false
  const m = monter((url, init) => {
    if (url === '/api/admin/polices/i-garamond-test' && init.method === 'DELETE') {
      supprimee = true
      return { json: { ok: true } }
    }
    if (url === '/api/admin/polices') return { json: supprimee ? { ...DETAIL, polices: [] } : DETAIL }
    return catalogueVide
  })
  await m.attendre()
  await m.clic('button[data-police-supprimer]')
  assert.equal(supprimee, false, 'le premier clic n’efface rien')
  assert.match(m.texte(), /retomberont sur la police de base/)
  await m.clic('button[data-police-supprimer]')
  assert.equal(supprimee, true)
  assert.match(m.texte(), /Aucune police déposée/)
  appliquerCatalogue([])
})

test('déposer plusieurs fichiers : un envoi par fichier, un compte rendu par fichier', async () => {
  const reponses = []
  const m = monter((url, init) => {
    if (url === '/api/admin/polices' && init.method === 'POST') {
      const n = reponses.length
      reponses.push(init.body.name)
      if (n === 1)
        return { ok: false, status: 400, json: { error: 'les polices variables ne sont pas prises en charge' } }
      return { status: 201, json: { police: POLICE, fichier: POLICE.fichiers[n], cree: n === 0, remplace: false } }
    }
    return url === '/api/admin/polices' ? { json: DETAIL } : catalogueVide
  })
  await m.attendre()
  const champ = m.racine.querySelector('input[data-polices-fichier]')
  const f = (nom) => new m.dom.window.File([new Uint8Array([1, 2, 3])], nom)
  Object.defineProperty(champ, 'files', { value: [f('a.ttf'), f('b.ttf'), f('c.ttf')], configurable: true })
  champ.dispatchEvent(new m.dom.window.Event('change', { bubbles: true }))
  await m.attendre()
  assert.deepEqual(reponses, ['a.ttf', 'b.ttf', 'c.ttf'])
  const posts = m.appels.filter((a) => a.methode === 'POST')
  assert.equal(posts.length, 3)
  assert.match(m.texte(), /a\.ttf : Garamond Test Regular/)
  assert.match(m.texte(), /b\.ttf : les polices variables/)
  assert.ok(
    m.racine.querySelector('[data-polices-msg]').classList.contains('bo-erreur'),
    'une erreur colore le message'
  )
  appliquerCatalogue([])
})
