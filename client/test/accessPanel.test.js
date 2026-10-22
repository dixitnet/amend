// Le panneau « Partager » (src/accessPanel.js), côté invitations en attente
// (22/10/2026) : où en est le courrier de chaque invitation, et « Copier le
// lien » — un nouveau lien, mis dans le presse-papiers, ou montré dans un champ
// si le presse-papiers est inaccessible. jsdom et un faux serveur ; jamais de
// réseau.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { openAccessPanel } from '../src/accessPanel.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))

function installer(presse) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: presse }, configurable: true })
}

const ENTREES = [
  { email: 'moi@example.com', role: 'editeur', status: 'actif', proprietaire: true },
  { email: 'remis@example.com', role: 'lecteur', status: 'invite', courrier: { etat: 'remis' } },
  {
    email: 'refuse@example.com',
    role: 'correcteur',
    status: 'invite',
    courrier: { etat: 'refuse', detail: '550 5.1.1 user unknown' },
  },
  { email: 'encours@example.com', role: 'lecteur', status: 'invite', courrier: { etat: 'en_cours' } },
  { email: 'inconnu@example.com', role: 'lecteur', status: 'invite', courrier: { etat: 'inconnu' } },
  { email: 'actif@example.com', role: 'lecteur', status: 'actif' },
]

/** Ouvre le panneau devant un faux serveur ; `lien` pilote la réponse de « copier le lien ». */
async function ouvrir({
  presse = { writeText: async () => {} },
  lien = { status: 200, corps: { lien: 'http://localhost/#/invite/abc' } },
} = {}) {
  installer(presse)
  const appels = []
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    appels.push({ url: String(url), methode, corps: options.body ? JSON.parse(options.body) : null })
    if (String(url).endsWith('/access') && methode === 'GET') return json({ access: ENTREES })
    if (String(url).endsWith('/invitations/lien')) return json(lien.corps, lien.status)
    return json({}, 404)
  }
  openAccessPanel('doc1', { jeSuisProprietaire: true })
  await attendre()
  return { appels }
}

const ligne = (email) => [...document.querySelectorAll('.access-list li')].find((li) => li.textContent.includes(email))

test('chaque invitation en attente dit où en est son courrier, et rien quand on ne sait pas', async () => {
  await ouvrir()
  const badge = (email) => ligne(email).querySelector('.access-courrier')
  assert.equal(badge('remis@example.com').textContent, 'courrier remis')
  assert.match(badge('remis@example.com').title, /indésirables ou en quarantaine/)
  assert.equal(badge('refuse@example.com').textContent, 'courrier refusé')
  assert.equal(
    ligne('refuse@example.com').querySelector('.access-courrier-detail').textContent,
    '550 5.1.1 user unknown'
  )
  assert.equal(badge('encours@example.com').textContent, 'envoi en cours')
  assert.equal(badge('inconnu@example.com'), null)
  assert.equal(badge('actif@example.com'), null, 'une personne déjà entrée n’a pas de courrier à suivre')
})

test('« Copier le lien » n’existe que pour une invitation en attente', async () => {
  await ouvrir()
  assert.ok(ligne('remis@example.com').querySelector('.copier-lien'))
  assert.ok(ligne('inconnu@example.com').querySelector('.copier-lien'))
  assert.equal(ligne('actif@example.com').querySelector('.copier-lien'), null)
  assert.equal(ligne('moi@example.com').querySelector('.copier-lien'), null)
})

test('« Copier le lien » demande un nouveau lien et le met dans le presse-papiers', async () => {
  const ecrits = []
  const { appels } = await ouvrir({ presse: { writeText: async (t) => ecrits.push(t) } })
  ligne('remis@example.com').querySelector('.copier-lien').click()
  await attendre()
  const post = appels.find((a) => a.methode === 'POST')
  assert.equal(post.url, '/api/docs/doc1/invitations/lien')
  assert.deepEqual(post.corps, { email: 'remis@example.com' })
  assert.deepEqual(ecrits, ['http://localhost/#/invite/abc'])
  const message = document.querySelector('.invite-message')
  assert.match(message.textContent, /Lien copié pour remis@example\.com/)
  assert.match(message.textContent, /ne fonctionne plus/)
  assert.equal(document.querySelector('.lien-copie'), null)
})

test('si le presse-papiers refuse, le lien est montré dans un champ à copier à la main', async () => {
  await ouvrir({
    presse: {
      writeText: async () => {
        throw new Error('refusé')
      },
    },
  })
  ligne('refuse@example.com').querySelector('.copier-lien').click()
  await attendre()
  const champ = document.querySelector('input.lien-copie')
  assert.ok(champ, 'un champ avec le lien')
  assert.equal(champ.value, 'http://localhost/#/invite/abc')
  assert.equal(champ.readOnly, true)
  assert.match(document.querySelector('.invite-message').textContent, /Copiez ce lien pour refuse@example\.com/)
})

test('si le serveur refuse, l’erreur est dite et rien n’est copié', async () => {
  const ecrits = []
  await ouvrir({
    presse: { writeText: async (t) => ecrits.push(t) },
    lien: { status: 404, corps: { error: 'aucune invitation en attente pour cette adresse' } },
  })
  ligne('encours@example.com').querySelector('.copier-lien').click()
  await attendre()
  const message = document.querySelector('.invite-message')
  assert.match(message.textContent, /aucune invitation en attente/)
  assert.match(message.className, /erreur/)
  assert.deepEqual(ecrits, [])
  assert.equal(document.querySelector('.lien-copie'), null)
})
