// Les menus Partager et Exporter du bandeau (client/src/menusPartageExport.js),
// sortis de `mountEditor` le 13/10/2026. On les monte seuls, dans jsdom, avec
// un document et un titre fournis par des fonctions — comme `editor.js`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { schema } from '../src/schema.js'

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="bandeau"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'Event']) globalThis[k] = w[k]
  return dom
}

const respirer = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const doc = () => schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Bonjour tout le monde')])])

/** Monte les deux menus ; `reseau` répond aux appels, `telechargements` garde ce qui a été « téléchargé ». */
async function monter({ reseau = {}, titre = 'Mon essai' } = {}) {
  installerDom()
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    appels.push({ url: String(url), methode: init.method || 'GET', corps: init.body })
    const r = reseau[Object.keys(reseau).find((k) => String(url).includes(k))] ?? { ok: true, json: {} }
    return {
      ok: r.ok !== false,
      status: r.status || (r.ok === false ? 500 : 200),
      json: async () => r.json || {},
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    }
  }
  const telechargements = []
  globalThis.URL.createObjectURL = (blob) => {
    telechargements.push({ blob })
    return `blob:essai-${telechargements.length}`
  }
  globalThis.URL.revokeObjectURL = () => {}
  document.defaultView.HTMLAnchorElement.prototype.click = function () {
    telechargements.at(-1).nom = this.download
  }

  const { creerFabriqueMenus, monterMenusPartageExport } = await import('../src/menusPartageExport.js')
  const ecouteursGlobaux = []
  const menuDeroulant = creerFabriqueMenus(ecouteursGlobaux)
  const m = monterMenusPartageExport({ menuDeroulant, docId: 'abc123', docMeta: { jeSuisProprietaire: true }, getDoc: doc, getTitre: () => titre })
  document.getElementById('bandeau').appendChild(m.groupeForme)
  return { ...m, ecouteursGlobaux, appels, telechargements, menuDeroulant }
}

const bouton = (liste, texte) => [...liste.querySelectorAll('button')].find((b) => b.textContent.startsWith(texte))
const ouvert = (menu) => !menu.liste.hidden

test('les deux menus : Exporter puis Partager, fermés au départ, un seul ouvert à la fois', async () => {
  const m = await monter()
  const boutons = [...m.groupeForme.querySelectorAll('.menu-flottant-bouton')].map((b) => b.textContent)
  assert.deepEqual(boutons, ['Exporter ▾', 'Partager ▾'])
  assert.equal(ouvert(m.menuExport) || ouvert(m.menuPartage), false)

  m.menuExport.el.querySelector('button').click()
  assert.equal(ouvert(m.menuExport), true)
  m.menuPartage.el.querySelector('button').click()
  assert.equal(ouvert(m.menuPartage), true)
  assert.equal(ouvert(m.menuExport), false, 'ouvrir Partager ferme Exporter')
})

test('un clic ailleurs ferme les menus ; au démontage les écouteurs de document sont retirés', async () => {
  const m = await monter()
  m.menuExport.el.querySelector('button').click()
  document.body.click()
  assert.equal(ouvert(m.menuExport), false)

  assert.equal(m.ecouteursGlobaux.length, 2, 'un écouteur de document par menu')
  m.menuExport.liste.hidden = false
  for (const retirer of m.ecouteursGlobaux.splice(0)) retirer()
  document.body.click()
  assert.equal(ouvert(m.menuExport), true, 'plus personne n’écoute le document')
})

test('le menu Exporter relit le modèle de mise en page à chaque ouverture', async () => {
  const m = await monter({ reseau: { '/api/modeles': { json: { modeles: [] } }, '/style': { json: {} } } })
  assert.equal(typeof m.menuExport.surOuverture, 'function')
  const avant = m.appels.length
  m.menuExport.el.querySelector('button').click()
  await respirer()
  assert.ok(m.appels.length > avant, 'une lecture au clic')
})

test('Publier sur le web : caché tant que le serveur n’a pas dit que cette personne peut', async () => {
  const refuse = await monter({ reseau: { '/publication': { json: { autorise: false } } } })
  refuse.chargerPublication()
  await respirer()
  assert.equal(bouton(refuse.menuPartage.liste, 'Publier').hidden, true)

  const accepte = await monter({ reseau: { '/publication': { json: { autorise: true, publiee: false } } } })
  assert.equal(bouton(accepte.menuPartage.liste, 'Publier').hidden, true, 'pas avant le chargement')
  accepte.chargerPublication()
  await respirer()
  assert.equal(bouton(accepte.menuPartage.liste, 'Publier').hidden, false)
  assert.equal(bouton(accepte.menuPartage.liste, 'Publier').textContent, 'Publier sur le web…')

  const publiee = await monter({ reseau: { '/publication': { json: { autorise: true, publiee: true } } } })
  publiee.chargerPublication()
  await respirer()
  assert.equal(bouton(publiee.menuPartage.liste, 'Page publiée').hidden, false)

  const enPanne = await monter({ reseau: { '/publication': { ok: false } } })
  enPanne.chargerPublication()
  await respirer()
  assert.equal(bouton(enPanne.menuPartage.liste, 'Publier').hidden, true, 'une panne du serveur ne casse rien')
})

test('Markdown : le fichier porte le texte du document et le titre courant, et le menu se ferme', async () => {
  const m = await monter({ titre: 'Mon essai' })
  m.menuExport.liste.hidden = false
  bouton(m.menuExport.liste, 'Markdown').click()
  assert.equal(ouvert(m.menuExport), false)
  assert.equal(m.telechargements.length, 1)
  assert.match(m.telechargements[0].nom, /\.md$/)
  assert.match(m.telechargements[0].nom, /Mon essai|mon-essai|Mon_essai/i)
  assert.match(await m.telechargements[0].blob.text(), /Bonjour tout le monde/)
})

test('PDF : le bouton annonce la composition, envoie le document au serveur, puis se rétablit', async () => {
  const m = await monter({ reseau: { '/pdf': { json: {} }, '/style': { json: { style: null } } } })
  const pdf = bouton(m.menuExport.liste, 'PDF')
  const libelle = pdf.textContent
  const attente = pdf.onclick()
  assert.equal(pdf.disabled, true)
  assert.equal(pdf.textContent, 'Composition…')
  await attente
  assert.equal(pdf.disabled, false)
  assert.equal(pdf.textContent, libelle)
  const envoi = m.appels.find((a) => a.url.endsWith('/api/docs/abc123/pdf'))
  assert.ok(envoi, 'le PDF est demandé au serveur')
  assert.equal(envoi.methode, 'POST')
  assert.match(JSON.parse(envoi.corps).source, /Bonjour tout le monde/)
  assert.match(m.telechargements.at(-1).nom, /\.pdf$/)
})

test('PDF : un échec du serveur s’affiche, et le bouton se rétablit quand même', async () => {
  const m = await monter({ reseau: { '/pdf': { ok: false, status: 501, json: { error: 'Typst est indisponible.' } }, '/style': { json: { style: null } } } })
  const pdf = bouton(m.menuExport.liste, 'PDF')
  await pdf.onclick()
  assert.equal(pdf.disabled, false)
  assert.equal(pdf.textContent, 'PDF (.pdf)')
  const message = document.querySelector('.message-fugace.erreur')
  assert.ok(message, 'un message d’erreur')
  assert.equal(message.textContent, 'Typst est indisponible.')
  assert.equal(m.telechargements.length, 0)
})
