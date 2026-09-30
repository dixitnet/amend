// La section « Claude » du panneau Gérer les accès, montée dans jsdom avec
// un faux serveur (30/09/2026, src/claudeAccess.js). Ce qui s'y teste : ce
// que la section montre selon les droits que le serveur annonce, que
// l'adresse (un mot de passe) ne s'affiche qu'à la création et ne va
// nulle part ailleurs, et que couper ou changer l'accès de Claude demande
// deux clics.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { monterSectionClaude, formaterEcheance, formaterUsage } from '../src/claudeAccess.js'

const SECRET = 'AbCdEfGhIjKlMnOpQrStUv'
const ADRESSE = `https://www.amend.ink/mcp/${SECRET}`

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="racine"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Event']) globalThis[k] = w[k]
  return dom
}

/** Un faux serveur : ce que la route /agents répondrait, et la trace des appels. */
function fauxServeur({ autorise = true, agents = [] } = {}) {
  const appels = []
  const etat = { autorise, agents: [...agents] }
  let n = 0
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    const corps = options.body ? JSON.parse(options.body) : null
    appels.push({ url, methode, corps })
    const chemin = url.replace(/^\/api\/docs\/doc1\/agents/, '')
    const repondre = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (chemin === '' && methode === 'GET') return repondre(200, { autorise: etat.autorise, portee: 'admins', roles: ['lecteur', 'correcteur'], agents: etat.agents })
    if (chemin === '' && methode === 'POST') {
      const id = `ag-0000000${++n}`
      etat.agents.push({ id, docId: 'doc1', role: corps.role, nom: 'Claude (pour Sylvain)', par: 'sylvain@example.com', grantedAt: Date.now(), expiresAt: Date.now() + corps.jours * 86400000, dernierUsage: null, etat: 'active' })
      return repondre(200, { id, adresse: ADRESSE, expiresAt: Date.now() + corps.jours * 86400000 })
    }
    const m = chemin.match(/^\/(ag-[0-9a-f]{8})(?:\/(prolonger|regenerer))?$/)
    if (m && methode === 'DELETE') {
      etat.agents = etat.agents.filter((a) => a.id !== m[1])
      return repondre(200, { ok: true })
    }
    if (m && m[2] === 'prolonger') return repondre(200, { expiresAt: Date.now() + corps.jours * 86400000 })
    if (m && m[2] === 'regenerer') {
      const id = `ag-1000000${++n}`
      etat.agents = etat.agents.map((a) => (a.id === m[1] ? { ...a, id } : a))
      return repondre(200, { id, adresse: ADRESSE.replace('AbCd', 'ZyXw'), expiresAt: Date.now() + 7 * 86400000, remplace: m[1] })
    }
    return repondre(404, { error: 'introuvable' })
  }
  return { appels, etat }
}

const attendre = () => new Promise((r) => setTimeout(r, 20))
const clic = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }))
const AGENT = { id: 'ag-00000042', docId: 'doc1', role: 'correcteur', nom: 'Claude (pour Sylvain)', par: 'sylvain@example.com', grantedAt: Date.now() - 3600_000, expiresAt: Date.now() + 5 * 86400000, dernierUsage: Date.now() - 10 * 60_000, etat: 'active' }

async function monter(options) {
  installer()
  const serveur = fauxServeur(options)
  const racine = document.getElementById('racine')
  const { section } = monterSectionClaude(racine, 'doc1')
  await attendre()
  return { ...serveur, racine, section }
}

test('sans droit d’inviter et sans invitation, la section ne se montre pas', async () => {
  const { section } = await monter({ autorise: false, agents: [] })
  assert.equal(section.hidden, true)
})

test('un admin voit le formulaire ; inviter montre l’adresse une fois, avec le rôle et la durée choisis', async () => {
  const { section, appels } = await monter({ autorise: true })
  assert.equal(section.hidden, false)
  const form = section.querySelector('.claude-form')
  assert.equal(form.hidden, false)

  section.querySelector('.claude-role').value = 'lecteur'
  section.querySelector('.claude-duree').value = '30'
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre()

  const post = appels.find((a) => a.methode === 'POST')
  assert.deepEqual(post.corps, { role: 'lecteur', jours: 30 })
  const boite = section.querySelector('.claude-adresse')
  assert.equal(boite.hidden, false)
  assert.equal(boite.querySelector('input').value, ADRESSE)
  assert.match(boite.querySelector('.claude-adresse-titre').textContent, /ne sera plus affichée/)

  // La ligne apparaît dans la liste, sans l'adresse.
  const lignes = section.querySelectorAll('.claude-ligne')
  assert.equal(lignes.length, 1)
  assert.match(lignes[0].textContent, /Claude \(pour Sylvain\)/)
  assert.match(lignes[0].textContent, /jamais utilisée/)
  assert.ok(!lignes[0].textContent.includes(SECRET), 'la liste ne porte jamais l’adresse')
})

test('l’adresse n’est écrite dans aucun stockage du navigateur', async () => {
  const { section } = await monter({ autorise: true })
  section.querySelector('.claude-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre()
  const stocks = [window.localStorage, window.sessionStorage].map((s) => JSON.stringify({ ...s }))
  for (const st of stocks) assert.ok(!st.includes(SECRET))
  assert.ok(!document.cookie.includes(SECRET))
})

test('révoquer demande deux clics, retire la ligne et cache l’adresse de cette invitation', async () => {
  const { section, appels } = await monter({ autorise: true })
  section.querySelector('.claude-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre()
  const revoquer = section.querySelector('.claude-revoquer')
  clic(revoquer)
  assert.equal(revoquer.textContent, 'Confirmer ?')
  assert.ok(!appels.some((a) => a.methode === 'DELETE'), 'un seul clic ne coupe rien')
  clic(revoquer)
  await attendre()
  assert.ok(appels.some((a) => a.methode === 'DELETE'))
  assert.equal(section.querySelectorAll('.claude-ligne').length, 0)
  assert.equal(section.querySelector('.claude-adresse').hidden, true)
  assert.equal(section.querySelector('.claude-adresse input').value, '', 'l’adresse est effacée de la page')
})

test('régénérer montre la nouvelle adresse après confirmation ; prolonger reprend la durée choisie', async () => {
  const { section, appels } = await monter({ autorise: true, agents: [AGENT] })
  section.querySelector('.claude-duree').value = '30'
  clic(section.querySelector('.claude-prolonger'))
  await attendre()
  const prolonge = appels.find((a) => a.url.endsWith('/prolonger'))
  assert.deepEqual(prolonge.corps, { jours: 30 })
  assert.equal(section.querySelector('.claude-adresse').hidden, true, 'prolonger ne montre pas d’adresse : elle n’a pas changé')

  const regenerer = section.querySelector('.claude-regenerer')
  clic(regenerer)
  assert.equal(regenerer.textContent, 'Confirmer ?')
  assert.ok(!appels.some((a) => a.url.endsWith('/regenerer')))
  clic(regenerer)
  await attendre()
  assert.ok(appels.some((a) => a.url.endsWith('/regenerer')))
  const boite = section.querySelector('.claude-adresse')
  assert.equal(boite.hidden, false)
  assert.match(boite.querySelector('input').value, /ZyXw/)
  assert.match(boite.querySelector('.claude-adresse-titre').textContent, /ancienne ne marche plus/)
})

test('un éditeur sans droit d’inviter voit l’invitation et ne peut que la révoquer', async () => {
  const { section } = await monter({ autorise: false, agents: [AGENT] })
  assert.equal(section.hidden, false)
  assert.equal(section.querySelector('.claude-form').hidden, true)
  assert.equal(section.querySelector('.claude-prolonger'), null)
  assert.equal(section.querySelector('.claude-regenerer'), null)
  assert.ok(section.querySelector('.claude-revoquer'))
  assert.match(section.querySelector('.claude-detail').textContent, /invité par sylvain@example.com/)
  assert.match(section.querySelector('.claude-detail').textContent, /utilisée il y a 10 min/)
})

test('une invitation expirée se signale, et peut être prolongée', async () => {
  const { section } = await monter({ autorise: true, agents: [{ ...AGENT, expiresAt: Date.now() - 1000, etat: 'expirée' }] })
  assert.match(section.querySelector('.claude-ligne').textContent, /expirée/)
  assert.ok(section.querySelector('.claude-prolonger'))
})

test('les dates se disent en clair', () => {
  const t = new Date('2026-09-30T10:00:00').getTime()
  assert.equal(formaterEcheance(t - 1, t), 'expirée')
  assert.match(formaterEcheance(t + 3 * 3600_000, t), /^expire à 13:00$/)
  assert.match(formaterEcheance(t + 20 * 3600_000, t), /^expire demain à 06:00$/)
  assert.match(formaterEcheance(t + 7 * 86400000, t), /^expire le 7 octobre$/)
  assert.equal(formaterUsage(null, t), 'jamais utilisée')
  assert.equal(formaterUsage(t - 30_000, t), 'utilisée à l’instant')
  assert.equal(formaterUsage(t - 10 * 60_000, t), 'utilisée il y a 10 min')
  assert.equal(formaterUsage(t - 3 * 3600_000, t), 'utilisée il y a 3 h')
  assert.equal(formaterUsage(t - 2 * 86400000, t), 'utilisée il y a 2 j')
})
