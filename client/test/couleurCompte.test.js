// Choisir sa couleur (13/10/2026) : la fenêtre « Ma couleur » et l'entrée du
// menu du compte qui l'ouvre.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="zone"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent']) globalThis[k] = w[k]
  return dom
}

function fauxServeur({ refus = null, panne = false, couleur = '#3d5a80' } = {}) {
  const appels = []
  globalThis.fetch = async (url, opts = {}) => {
    appels.push({ url, opts })
    if (url === '/api/auth/me')
      return { ok: true, json: async () => ({ email: 'syl@example.com', admin: false, nom: 'Sylvain', couleur }) }
    if (url === '/api/auth/couleur') {
      if (panne) throw new Error('réseau')
      if (refus) return { ok: false, status: 400, json: async () => ({ error: refus }) }
      const corps = JSON.parse(opts.body)
      return { ok: true, status: 200, json: async () => ({ nom: 'Sylvain', couleur: corps.couleur }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return appels
}

const { ouvrirChoixDeCouleur } = await import('../src/couleurCompte.js')
const { COULEURS_CHOIX } = await import('../../shared/identite.js')

const soumettre = () =>
  document
    .querySelector('.couleur-modal')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
const attendre = () => new Promise((r) => setTimeout(r, 5))
const pastille = (hex) => document.querySelector(`.couleur-choix[data-couleur="${hex}"]`)

test('la fenêtre montre les seize couleurs, marque l’actuelle, et chaque pastille a un nom', () => {
  installerDom()
  fauxServeur()
  ouvrirChoixDeCouleur({ couleurActuelle: '#3D5A80' })
  const toutes = [...document.querySelectorAll('.couleur-choix')]
  assert.equal(toutes.length, 16)
  assert.deepEqual(
    toutes.map((b) => b.dataset.couleur),
    COULEURS_CHOIX
  )
  for (const b of toutes)
    assert.ok(
      b.getAttribute('aria-label') && !b.getAttribute('aria-label').startsWith('#'),
      `nom de ${b.dataset.couleur}`
    )
  const actives = toutes.filter((b) => b.getAttribute('aria-checked') === 'true')
  assert.deepEqual(
    actives.map((b) => b.dataset.couleur),
    ['#3d5a80']
  )
  assert.equal(document.querySelector('.couleur-grille').getAttribute('role'), 'radiogroup')
})

test('on choisit une pastille, on enregistre : la couleur part au serveur, l’appelant est prévenu, la fenêtre se ferme', async () => {
  installerDom()
  const appels = fauxServeur()
  let recu = null
  const promesse = ouvrirChoixDeCouleur({ couleurActuelle: '#3d5a80', surChangement: (c, nom) => (recu = { c, nom }) })
  pastille('#f48c06').click()
  assert.equal(pastille('#f48c06').getAttribute('aria-checked'), 'true')
  assert.equal(pastille('#3d5a80').getAttribute('aria-checked'), 'false')
  soumettre()
  assert.equal(await promesse, '#f48c06')
  assert.deepEqual(recu, { c: '#f48c06', nom: 'Sylvain' })
  assert.equal(appels[0].url, '/api/auth/couleur')
  assert.deepEqual(JSON.parse(appels[0].opts.body), { couleur: '#f48c06' })
  assert.equal(document.querySelector('.couleur-modal'), null)
})

test('la même couleur ne part pas ; Annuler et Échap non plus', async () => {
  installerDom()
  const appels = fauxServeur()
  const p1 = ouvrirChoixDeCouleur({ couleurActuelle: '#3d5a80' })
  soumettre()
  assert.equal(await p1, null)
  const p2 = ouvrirChoixDeCouleur({ couleurActuelle: '#3d5a80' })
  document.querySelector('.name-modal-annuler').click()
  assert.equal(await p2, null)
  const p3 = ouvrirChoixDeCouleur({ couleurActuelle: '#3d5a80' })
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(await p3, null)
  assert.equal(document.querySelector('.couleur-modal'), null)
  assert.equal(appels.length, 0)
})

test('une couleur refusée par le serveur, ou une panne, laisse la fenêtre ouverte avec un message', async () => {
  installerDom()
  fauxServeur({ refus: 'couleur hors de la palette' })
  let fini = false
  ouvrirChoixDeCouleur({ couleurActuelle: '' }).then(() => (fini = true))
  pastille('#ff006e').click()
  soumettre()
  await attendre()
  assert.equal(fini, false)
  const erreur = document.querySelector('.name-modal-erreur')
  assert.equal(erreur.hidden, false)
  assert.match(erreur.textContent, /hors de la palette/)
  assert.equal(document.querySelector('.name-modal-ok').disabled, false, 'on peut réessayer')

  document.querySelector('.couleur-modal').remove()
  installerDom()
  fauxServeur({ panne: true })
  ouvrirChoixDeCouleur({ couleurActuelle: '' })
  pastille('#ff006e').click()
  soumettre()
  await attendre()
  assert.match(document.querySelector('.name-modal-erreur').textContent, /connexion/)
})

test('sans couleur choisie, on le dit au lieu d’envoyer du vide', async () => {
  installerDom()
  const appels = fauxServeur()
  ouvrirChoixDeCouleur({ couleurActuelle: '' })
  soumettre()
  await attendre()
  assert.match(document.querySelector('.name-modal-erreur').textContent, /Choisissez/)
  assert.equal(appels.length, 0)
})

test('les flèches passent d’une pastille à l’autre, en bouclant', () => {
  installerDom()
  fauxServeur()
  ouvrirChoixDeCouleur({ couleurActuelle: COULEURS_CHOIX[0] })
  const premiere = pastille(COULEURS_CHOIX[0])
  premiere.focus()
  premiere.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  assert.equal(document.activeElement.dataset.couleur, COULEURS_CHOIX[1])
  assert.equal(pastille(COULEURS_CHOIX[1]).getAttribute('aria-checked'), 'true')
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  assert.equal(document.activeElement.dataset.couleur, COULEURS_CHOIX[15], 'on reboucle sur la dernière')
})

test('le menu du compte : « Changer ma couleur… » ouvre la fenêtre, teint la pastille et prévient l’éditeur', async () => {
  installerDom()
  fauxServeur({ couleur: '#3d5a80' })
  const { monterMenuCompte } = await import('../src/compteMenu.js')
  const { forgetSessionCache } = await import('../src/auth.js')
  forgetSessionCache()
  let recue = null
  monterMenuCompte(document.getElementById('zone'), { couleur: () => '#3d5a80', surCouleur: (c) => (recue = c) })
  await attendre()
  await attendre()
  const entrees = [...document.querySelectorAll('.menu-flottant-liste button')].map((b) => b.textContent)
  assert.ok(entrees.includes('Changer ma couleur…'))
  const pastilleCompte = document.querySelector('.compte-pastille')
  assert.equal(pastilleCompte.style.getPropertyValue('--user-color'), '#3d5a80')
  document.querySelector('.compte-ma-couleur').click()
  pastille('#7209b7').click()
  soumettre()
  await attendre()
  assert.equal(recue, '#7209b7')
  assert.equal(pastilleCompte.style.getPropertyValue('--user-color'), '#7209b7')
})
