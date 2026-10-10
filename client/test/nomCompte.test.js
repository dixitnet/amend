// Changer son nom (10/10/2026) : la fenêtre « Mon nom », le menu du compte
// qui l'ouvre, et le lien « Aide » qui l'accompagne.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

function installerDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="zone"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent']) globalThis[k] = w[k]
  return dom
}

/** Un faux serveur : /api/auth/me et /api/auth/name. */
function fauxServeur({ nom = 'Sylvain', admin = false, refus = null, panne = false } = {}) {
  const appels = []
  globalThis.fetch = async (url, opts = {}) => {
    appels.push({ url, opts })
    if (panne && url === '/api/auth/name') throw new Error('réseau')
    if (url === '/api/auth/me') return { ok: true, json: async () => ({ email: 'syl@example.com', admin, nom, couleur: '#3d5a80' }) }
    if (url === '/api/auth/name') {
      const corps = JSON.parse(opts.body)
      if (refus) return { ok: false, status: 400, json: async () => ({ error: refus }) }
      return { ok: true, status: 200, json: async () => ({ nom: corps.nom, couleur: '#3d5a80' }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return appels
}

const { ouvrirChangementDeNom } = await import('../src/nomCompte.js')
const { lienAide, URL_AIDE } = await import('../src/aide.js')

const soumettre = () => document.querySelector('.name-modal').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
const attendre = () => new Promise((r) => setTimeout(r, 5))

test('la fenêtre propose le nom actuel, l’enregistre, prévient, et se ferme', async () => {
  installerDom()
  const appels = fauxServeur()
  let recu = null
  const promesse = ouvrirChangementDeNom({ nomActuel: 'Sylvain', surChangement: (nom, couleur) => (recu = { nom, couleur }) })
  const input = document.querySelector('.name-modal input')
  assert.equal(input.value, 'Sylvain')
  input.value = '  Sylvain Grisot '
  soumettre()
  assert.equal(await promesse, 'Sylvain Grisot')
  assert.deepEqual(recu, { nom: 'Sylvain Grisot', couleur: '#3d5a80' })
  assert.equal(appels[0].url, '/api/auth/name')
  assert.equal(JSON.parse(appels[0].opts.body).nom, 'Sylvain Grisot')
  assert.equal(document.querySelector('.name-modal'), null, 'la fenêtre est fermée')
})

test('un nom vide ne part pas ; le même nom ne part pas non plus', async () => {
  installerDom()
  const appels = fauxServeur()
  const p1 = ouvrirChangementDeNom({ nomActuel: 'Sylvain' })
  document.querySelector('.name-modal input').value = '   '
  soumettre()
  assert.match(document.querySelector('.name-modal-erreur').textContent, /vide/)
  assert.equal(document.querySelector('.name-modal-erreur').hidden, false)
  document.querySelector('.name-modal input').value = 'Sylvain'
  soumettre()
  assert.equal(await p1, null, 'rien à changer : on ferme')
  assert.equal(appels.length, 0)
})

test('un nom refusé par le serveur reste à l’écran avec la raison, et la fenêtre reste ouverte', async () => {
  installerDom()
  fauxServeur({ refus: 'ce nom se donne pour celui d’une IA' })
  let appele = false
  ouvrirChangementDeNom({ nomActuel: 'Sylvain', surChangement: () => (appele = true) })
  document.querySelector('.name-modal input').value = 'Margo (IA)'
  soumettre()
  await attendre()
  assert.match(document.querySelector('.name-modal-erreur').textContent, /Nom refusé : ce nom se donne pour celui d’une IA/)
  assert.equal(appele, false)
  assert.equal(document.querySelector('.name-modal-ok').disabled, false, 'on peut corriger et réessayer')
})

test('le réseau en panne ne perd pas la fenêtre', async () => {
  installerDom()
  fauxServeur({ panne: true })
  ouvrirChangementDeNom({ nomActuel: 'Sylvain' })
  document.querySelector('.name-modal input').value = 'Autre'
  soumettre()
  await attendre()
  assert.match(document.querySelector('.name-modal-erreur').textContent, /n’a pas pu être enregistré/)
  assert.ok(document.querySelector('.name-modal'))
})

test('Échap et « Annuler » ferment sans rien envoyer', async () => {
  installerDom()
  const appels = fauxServeur()
  const p1 = ouvrirChangementDeNom({ nomActuel: 'A' })
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(await p1, null)
  const p2 = ouvrirChangementDeNom({ nomActuel: 'A' })
  document.querySelector('.name-modal-annuler').click()
  assert.equal(await p2, null)
  assert.equal(document.querySelector('.name-modal'), null)
  assert.equal(appels.length, 0)
})

test('le lien d’aide ouvre la page publiée dans un nouvel onglet', () => {
  installerDom()
  const a = lienAide()
  assert.equal(a.getAttribute('href'), URL_AIDE)
  assert.equal(URL_AIDE, '/p/scissors-dad-mechanic')
  assert.equal(a.target, '_blank')
  assert.match(a.rel, /noopener/)
  assert.equal(a.textContent, 'Aide')
})

test('le menu du compte : le nom et l’adresse en tête, « Changer mon nom… » et « Aide », et le nouveau nom se répercute', async () => {
  installerDom()
  fauxServeur({ nom: 'Marie Curie' })
  const { monterMenuCompte } = await import('../src/compteMenu.js')
  const { forgetSessionCache } = await import('../src/auth.js')
  forgetSessionCache()
  let nomRecu = null
  monterMenuCompte(document.getElementById('zone'), { surNom: (n) => (nomRecu = n) })
  await attendre()
  await attendre()
  const pastille = document.querySelector('.compte-pastille')
  assert.equal(pastille.textContent, 'MC', 'initiales du nom, comme dans la liste des présents')
  assert.match(document.querySelector('.menu-flottant-entete').textContent, /Marie Curie · syl@example.com/)
  const boutons = [...document.querySelectorAll('.menu-flottant-liste button, .menu-flottant-liste a')].map((e) => e.textContent)
  assert.ok(boutons.includes('Changer mon nom…') && boutons.includes('Aide'))
  document.querySelector('.compte-mon-nom').click()
  document.querySelector('.name-modal input').value = 'Marie Sklodowska'
  soumettre()
  await attendre()
  assert.equal(nomRecu, 'Marie Sklodowska')
  assert.equal(pastille.textContent, 'MS')
  assert.match(document.querySelector('.menu-flottant-entete').textContent, /Marie Sklodowska/)
})
