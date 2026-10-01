// Le choix du modèle de mise en page dans le menu Exporter (01/10/2026,
// src/modeleDocument.js), monté dans jsdom avec un faux serveur. Ce qu'on
// vérifie : le select dit le format de chaque modèle, changer de modèle
// enregistre ; s'il y a des réglages propres, rien ne part avant que la
// personne ait choisi (changer, garder, annuler) ; le modèle d'un
// collaborateur reste lisible ; « Revenir au modèle » efface les écarts.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { monterModeleDocument } from '../src/modeleDocument.js'
import { fusionner } from '../../shared/style.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Event']) globalThis[k] = w[k]
}
const laisser = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r))
}

const MODELES = [
  { id: 'defaut', nom: 'Par défaut', style: fusionner({}) },
  { id: 'livre', nom: 'Livre', description: 'Un livre', style: fusionner({ page: { size: 'A5' } }) },
  { id: 'note', nom: 'Note', style: fusionner({ page: { size: 'A4', orientation: 'paysage' } }) },
]

function fauxServeur({ modele = 'defaut', ecarts = 0, propre = false, modeles = MODELES, echecListe = false } = {}) {
  const etat = { modele, ecarts, propre, appels: [] }
  const nom = (id) => (MODELES.find((m) => m.id === id) || { nom: 'Celui de Bob' }).nom
  const resume = () => ({ id: etat.modele, nom: nom(etat.modele), portee: 'livre' })
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    const corps = options.body ? JSON.parse(options.body) : null
    etat.appels.push({ url, methode, corps })
    const rep = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (url === '/api/modeles') return echecListe ? rep(500, {}) : rep(200, { modeles, admin: false })
    if (url === '/api/docs/d1/style' && methode === 'GET')
      return rep(200, { style: fusionner({}), propre: etat.propre, ecarts: etat.ecarts, modele: resume() })
    if (url === '/api/docs/d1/style' && methode === 'DELETE') {
      etat.ecarts = 0
      etat.propre = false
      return rep(200, { style: fusionner({}), propre: false, ecarts: 0, modele: resume() })
    }
    if (url === '/api/docs/d1/modele' && methode === 'PUT') {
      etat.modele = corps.modeleId
      if (!corps.garderEcarts) {
        etat.ecarts = 0
        etat.propre = false
      }
      return rep(200, { style: fusionner({}), propre: etat.propre, ecarts: etat.ecarts, modele: resume() })
    }
    return rep(404, {})
  }
  return etat
}

async function monter(options, ouvertures = []) {
  installer()
  const etat = fauxServeur(options)
  const m = monterModeleDocument({
    docId: 'd1',
    ouvrirPersonnaliser: (id, o) => ouvertures.push({ id, o }),
  })
  document.body.appendChild(m.el)
  await m.charger()
  const select = m.el.querySelector('select')
  return { etat, m, select, ouvertures }
}
const puts = (etat) => etat.appels.filter((a) => a.url === '/api/docs/d1/modele')
const changerPour = (select, id) => {
  select.value = id
  select.dispatchEvent(new window.Event('change', { bubbles: true }))
}
const bouton = (m, texte) => [...m.el.querySelectorAll('button')].find((b) => b.textContent === texte)

test('le select liste les modèles avec leur format, et montre le modèle du document', async () => {
  const { select, m } = await monter({ modele: 'livre' })
  assert.deepEqual([...select.options].map((o) => o.textContent), ['Par défaut — A4', 'Livre — A5', 'Note — A4 paysage'])
  assert.equal(select.value, 'livre')
  assert.ok(m.el.textContent.includes('suit son modèle'))
  assert.equal(bouton(m, 'Revenir au modèle').hidden, true)
})

test('sans réglage propre, changer de modèle enregistre aussitôt', async () => {
  const { etat, select } = await monter()
  changerPour(select, 'note')
  await laisser()
  assert.deepEqual(puts(etat).map((a) => a.corps), [{ modeleId: 'note', garderEcarts: false }])
  assert.equal(select.value, 'note')
})

test('avec des réglages propres : rien ne part avant le choix, puis changer abandonne', async () => {
  const { etat, select, m } = await monter({ ecarts: 2, propre: true })
  assert.ok(m.el.textContent.includes('2 réglages propres'))
  changerPour(select, 'livre')
  await laisser()
  assert.equal(puts(etat).length, 0)
  const conf = m.el.querySelector('.modele-doc-confirmation')
  assert.equal(conf.hidden, false)
  assert.ok(conf.textContent.includes('abandonnés'))
  bouton(m, 'Changer de modèle').click()
  await laisser()
  assert.deepEqual(puts(etat).map((a) => a.corps), [{ modeleId: 'livre', garderEcarts: false }])
  assert.ok(m.el.textContent.includes('suit son modèle'))
})

test('« Garder mes réglages » envoie garderEcarts', async () => {
  const { etat, select, m } = await monter({ ecarts: 1, propre: true })
  changerPour(select, 'note')
  bouton(m, 'Garder mes réglages').click()
  await laisser()
  assert.deepEqual(puts(etat).map((a) => a.corps), [{ modeleId: 'note', garderEcarts: true }])
  assert.ok(m.el.textContent.includes('1 réglage propre'))
})

test('« Annuler » : rien n’est envoyé, le select revient au modèle courant', async () => {
  const { etat, select, m } = await monter({ modele: 'livre', ecarts: 3, propre: true })
  changerPour(select, 'note')
  bouton(m, 'Annuler').click()
  await laisser()
  assert.equal(puts(etat).length, 0)
  assert.equal(select.value, 'livre')
  assert.equal(m.el.querySelector('.modele-doc-confirmation').hidden, true)
})

test('« Revenir au modèle » efface les écarts', async () => {
  const { etat, m } = await monter({ ecarts: 2, propre: true })
  const revenir = bouton(m, 'Revenir au modèle')
  assert.equal(revenir.hidden, false)
  revenir.click()
  await laisser()
  assert.ok(etat.appels.some((a) => a.methode === 'DELETE'))
  assert.equal(revenir.hidden, true)
  assert.ok(m.el.textContent.includes('suit son modèle'))
})

test('le modèle d’un collaborateur reste lisible dans le select', async () => {
  const { select } = await monter({ modele: 'm-12345678' })
  assert.equal(select.value, 'm-12345678')
  assert.ok(select.selectedOptions[0].textContent.includes('modèle d\'un collaborateur'))
})

test('liste illisible : le select est inerte et le dit, le reste fonctionne', async () => {
  const { select, m } = await monter({ echecListe: true })
  assert.equal(select.disabled, true)
  assert.ok(m.el.textContent.includes("n'a pas pu être chargée"))
})

test('« Personnaliser ce document… » ouvre le panneau, et son enregistrement relit l’état', async () => {
  const ouvertures = []
  const { etat, m } = await monter({}, ouvertures)
  bouton(m, 'Personnaliser ce document…').click()
  assert.equal(ouvertures.length, 1)
  assert.equal(ouvertures[0].id, 'd1')
  etat.ecarts = 4
  etat.propre = true
  ouvertures[0].o.onEnregistre()
  await laisser()
  assert.ok(m.el.textContent.includes('4 réglages propres'))
})

test('un changement qui échoue le dit et rend le select', async () => {
  const { select, m } = await monter()
  const normal = globalThis.fetch
  globalThis.fetch = async (url, o) => (url === '/api/docs/d1/modele' ? { ok: false, status: 500, json: async () => ({}) } : normal(url, o))
  changerPour(select, 'note')
  await laisser()
  assert.ok(m.el.textContent.includes('Échec'))
  assert.equal(select.disabled, false)
})

test('fin : nettoyage', () => {
  setTimeout(() => process.exit(0), 100)
})
