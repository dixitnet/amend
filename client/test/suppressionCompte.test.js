// Supprimer son compte (13/10/2026) : la fenêtre dit ce qui va se passer,
// refuse quand un document est bloquant, exige l'adresse en toutes lettres.

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
  globalThis.location = w.location
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent']) globalThis[k] = w[k]
  return dom
}

const APERCU = {
  email: 'syl@example.com',
  supprimes: [
    { id: 'a', title: 'Brouillon', corbeille: false },
    { id: 'b', title: 'Vieux', corbeille: true },
  ],
  transferes: [{ id: 'c', title: 'Livre', vers: 'marie@example.com', versNom: 'Marie' }],
  quittes: [{ id: 'd', title: 'Thèse de Paul' }],
  bloquants: [],
  agents: 2,
  modeles: 1,
  possible: true,
}

function fauxServeur({ apercu = APERCU, refus = null, panneApercu = false, panneSuppression = false } = {}) {
  const appels = []
  globalThis.fetch = async (url, opts = {}) => {
    appels.push({ url, opts })
    if (url === '/api/auth/compte/suppression') {
      if (panneApercu) return { ok: false, status: 500, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => apercu }
    }
    if (url === '/api/auth/compte/supprimer') {
      if (panneSuppression) throw new Error('réseau')
      if (refus) return { ok: false, status: 409, json: async () => ({ error: refus }) }
      return { ok: true, status: 200, json: async () => ({ ok: true, documentsSupprimes: 2 }) }
    }
    if (url === '/api/auth/me')
      return {
        ok: true,
        json: async () => ({ email: 'syl@example.com', admin: false, nom: 'Sylvain', couleur: '#3d5a80' }),
      }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return appels
}

const { ouvrirSuppressionDeCompte } = await import('../src/suppressionCompte.js')
const attendre = () => new Promise((r) => setTimeout(r, 5))
const champ = () => document.querySelector('.suppression-confirmation input')
const bouton = () => document.querySelector('.suppression-ok')
const saisir = (texte) => {
  champ().value = texte
  champ().dispatchEvent(new window.Event('input', { bubbles: true }))
}
const soumettre = () =>
  document
    .querySelector('.suppression-modal')
    .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))

test('la fenêtre liste ce qui disparaît, ce qui est confié, ce qu’on quitte', async () => {
  installerDom()
  fauxServeur()
  ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  const texte = document.querySelector('.suppression-corps').textContent
  assert.match(texte, /Brouillon/)
  assert.match(texte, /Vieux \(dans la corbeille\)/)
  assert.match(texte, /Livre → Marie/)
  assert.match(texte, /Thèse de Paul/)
  assert.match(texte, /2 invitations de Claude seront révoquées/)
  assert.match(texte, /1 modèle de mise en page personnel sera supprimé/)
  assert.match(texte, /Compte supprimé/)
  assert.equal(document.querySelector('.suppression-bloquants'), null)
})

test('les titres des autres sont du texte, jamais du HTML', async () => {
  installerDom()
  fauxServeur({ apercu: { ...APERCU, quittes: [{ id: 'x', title: '<img src=x onerror=alert(1)>' }] } })
  ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  assert.equal(document.querySelector('.suppression-corps img'), null)
  assert.match(document.querySelector('.suppression-corps').textContent, /<img src=x/)
})

test('le bouton reste éteint tant que l’adresse saisie n’est pas la bonne (casse et espaces tolérés)', async () => {
  installerDom()
  const appels = fauxServeur()
  ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  assert.equal(bouton().disabled, true)
  saisir('marie@example.com')
  assert.equal(bouton().disabled, true)
  soumettre()
  await attendre()
  assert.equal(appels.filter((a) => a.url === '/api/auth/compte/supprimer').length, 0, 'rien ne part')
  saisir('  Syl@Example.com ')
  assert.equal(bouton().disabled, false)
})

test('la confirmation part au serveur, l’appelant est prévenu, la fenêtre se ferme', async () => {
  installerDom()
  const appels = fauxServeur()
  let bilan = null
  const promesse = ouvrirSuppressionDeCompte({ apres: (b) => (bilan = b) })
  await attendre()
  saisir('syl@example.com')
  soumettre()
  assert.equal(await promesse, true)
  const envoi = appels.find((a) => a.url === '/api/auth/compte/supprimer')
  assert.equal(envoi.opts.method, 'POST')
  assert.deepEqual(JSON.parse(envoi.opts.body), { confirmation: 'syl@example.com' })
  assert.equal(bilan.documentsSupprimes, 2)
  assert.equal(document.querySelector('.suppression-modal'), null)
})

test('un document bloquant : on le dit, on ne demande pas l’adresse, rien ne peut partir', async () => {
  installerDom()
  const appels = fauxServeur({
    apercu: { ...APERCU, bloquants: [{ id: 'z', title: 'Le livre à lire' }], possible: false },
  })
  ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  assert.match(document.querySelector('.suppression-bloquants').textContent, /Le livre à lire/)
  assert.equal(document.querySelector('.suppression-confirmation').hidden, true)
  assert.equal(bouton().disabled, true)
  soumettre()
  await attendre()
  assert.equal(appels.filter((a) => a.url === '/api/auth/compte/supprimer').length, 0)
})

test('un refus du serveur, ou une panne, laisse la fenêtre ouverte avec un message', async () => {
  installerDom()
  fauxServeur({ refus: 'une suppression est déjà en cours' })
  let fini = false
  ouvrirSuppressionDeCompte({ apres: () => {} }).then(() => (fini = true))
  await attendre()
  saisir('syl@example.com')
  soumettre()
  await attendre()
  assert.equal(fini, false)
  assert.match(document.querySelector('.name-modal-erreur').textContent, /déjà en cours/)
  assert.equal(bouton().disabled, false, 'on peut réessayer')

  document.querySelector('.suppression-modal').remove()
  installerDom()
  fauxServeur({ panneSuppression: true })
  ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  saisir('syl@example.com')
  soumettre()
  await attendre()
  assert.match(document.querySelector('.name-modal-erreur').textContent, /connexion/)
})

test('si l’aperçu ne se lit pas, on ne propose rien de destructeur', async () => {
  installerDom()
  fauxServeur({ panneApercu: true })
  ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  assert.match(document.querySelector('.suppression-corps').textContent, /Impossible de savoir/)
  assert.equal(document.querySelector('.suppression-confirmation').hidden, true)
  assert.equal(bouton().disabled, true)
})

test('Annuler et Échap renoncent sans rien envoyer', async () => {
  installerDom()
  const appels = fauxServeur()
  const p1 = ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  document.querySelector('.name-modal-annuler').click()
  assert.equal(await p1, false)
  const p2 = ouvrirSuppressionDeCompte({ apres: () => {} })
  await attendre()
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  assert.equal(await p2, false)
  assert.equal(appels.filter((a) => a.url === '/api/auth/compte/supprimer').length, 0)
})

test('le menu du compte : « Supprimer mon compte… » ouvre la fenêtre, en dernier', async () => {
  installerDom()
  fauxServeur()
  const { monterMenuCompte } = await import('../src/compteMenu.js')
  const { forgetSessionCache } = await import('../src/auth.js')
  forgetSessionCache()
  monterMenuCompte(document.getElementById('zone'), { couleur: () => '#3d5a80' })
  await attendre()
  await attendre()
  const entrees = [...document.querySelectorAll('.menu-flottant-liste button')].map((b) => b.textContent)
  assert.equal(entrees[entrees.length - 1], 'Supprimer mon compte…')
  document.querySelector('.compte-supprimer').click()
  await attendre()
  assert.ok(document.querySelector('.suppression-modal'))
})
