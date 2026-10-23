// Un lien d'invitation déjà utilisé sert de signet (23/10/2026,
// src/authPages.js → mountInviteAccept) : le document si la personne est
// connectée et y a accès, sinon « Mes documents » ; un lien utilisable ouvre le
// document ; un lien inutilisable le dit, avec un retour.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountInviteAccept } from '../src/authPages.js'
import { forgetSessionCache } from '../src/auth.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms))

/** `serveur` : "METHODE chemin" → réponse. Tout le reste : 404. */
function monter(serveur) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', {
    url: 'http://localhost/#/invite/jeton',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.location = dom.window.location
  forgetSessionCache()
  const appels = []
  globalThis.fetch = async (url, options = {}) => {
    const cle = `${options.method || 'GET'} ${url}`
    appels.push(cle)
    return serveur[cle] || json({}, 404)
  }
  const racine = document.getElementById('app')
  mountInviteAccept(racine, 'jeton')
  return { racine, appels }
}

// Une réponse ne se lit qu'une fois : un objet neuf à chaque test.
const utilisee = () => ({ 'POST /api/invitations/jeton': json({ dejaUtilisee: true, docId: 'doc42' }) })

test('un lien déjà utilisé, personne connectée avec accès : le document', async () => {
  monter({
    ...utilisee(),
    'GET /api/auth/me': json({ email: 'a@example.com' }),
    'GET /api/docs/doc42': json({ id: 'doc42' }),
  })
  await attendre()
  assert.equal(location.hash, '#/doc/doc42')
})

test('un lien déjà utilisé, personne connectée sans accès (retiré, supprimé) : Mes documents', async () => {
  monter({
    ...utilisee(),
    'GET /api/auth/me': json({ email: 'a@example.com' }),
    'GET /api/docs/doc42': json({ error: 'accès refusé' }, 403),
  })
  await attendre()
  assert.equal(location.hash, '#/')
})

test('un lien déjà utilisé, personne non connectée : Mes documents, sans même demander le document', async () => {
  const { appels } = monter({ ...utilisee(), 'GET /api/auth/me': json({}) })
  await attendre()
  assert.equal(location.hash, '#/')
  assert.ok(!appels.some((a) => a.startsWith('GET /api/docs/')))
})

test('un lien déjà utilisé, serveur injoignable pendant la vérification : Mes documents', async () => {
  monter({ ...utilisee() })
  globalThis.fetch = async (url, options = {}) => {
    if ((options.method || 'GET') === 'POST') return json({ dejaUtilisee: true, docId: 'doc42' })
    throw new Error('réseau coupé')
  }
  mountInviteAccept(document.getElementById('app'), 'jeton')
  await attendre()
  assert.equal(location.hash, '#/')
})

test('un lien utilisable ouvre le document', async () => {
  monter({ 'POST /api/invitations/jeton': json({ docId: 'doc42', email: 'a@example.com', role: 'lecteur' }) })
  await attendre()
  assert.equal(location.hash, '#/doc/doc42')
})

test('un lien inutilisable le dit, avec un retour', async () => {
  const { racine } = monter({ 'POST /api/invitations/jeton': json({ error: 'invitation expirée' }, 410) })
  await attendre()
  assert.match(racine.textContent, /Invitation inutilisable/)
  assert.match(racine.textContent, /invitation expirée/)
  assert.ok(racine.querySelector('a[href="#/"]'))
  assert.equal(location.hash, '#/invite/jeton')
})
