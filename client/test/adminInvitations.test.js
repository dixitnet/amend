// Les invitations sans réponse du back-office (23/10/2026,
// src/adminInvitations.js) : le tableau, le badge du courrier, copier le lien,
// et les deux gestes en deux clics (renvoyer, supprimer). jsdom et un faux
// serveur ; jamais de réseau.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { brancherInvitations, chargerEtatsCourrier, tableInvitations } from '../src/adminInvitations.js'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))

const LISTE = [
  {
    email: 'simple@example.com',
    docId: 'doc1',
    titre: 'Un <b>titre</b>',
    role: 'correcteur',
    invitePar: 'anne@example.com',
    depuisJours: 3,
    bienvenue: false,
  },
  {
    email: 'beta@example.com',
    docId: 'doc2',
    titre: 'Bienvenue sur amend.ink',
    role: 'editeur',
    invitePar: 'admin@example.com',
    depuisJours: 0,
    bienvenue: true,
  },
]

function monter({ presse = { writeText: async () => {} }, reponses = {} } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: presse }, configurable: true })
  const racine = document.getElementById('app')
  racine.innerHTML = tableInvitations(LISTE)
  const appels = []
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    appels.push({ url: String(url), methode, corps: options.body ? JSON.parse(options.body) : null })
    const r = reponses[`${methode} ${url}`]
    if (r) return json(r.corps, r.status ?? 200)
    return json({}, 404)
  }
  const apres = []
  brancherInvitations(racine, async (info) => {
    apres.push(info)
  })
  return { racine, appels, apres }
}

const ligne = (racine, email) => racine.querySelector(`tr[data-inv-email="${email}"]`)
const bouton = (racine, email, geste) => ligne(racine, email).querySelector(`button[data-inv="${geste}"]`)

test('le tableau échappe les titres, distingue l’embarquement, et ne s’affiche pas sans invitation', () => {
  assert.equal(tableInvitations([]), '')
  const { racine } = monter()
  assert.match(racine.textContent, /correcteur sur « Un <b>titre<\/b> »/, 'le titre est du texte, pas du HTML')
  assert.equal(racine.querySelector('b'), null)
  assert.match(ligne(racine, 'beta@example.com').textContent, /document de bienvenue \(embarquement\)/)
  assert.equal(ligne(racine, 'simple@example.com').dataset.invBienvenue, '')
  assert.equal(ligne(racine, 'beta@example.com').dataset.invBienvenue, 'oui')
  assert.match(ligne(racine, 'simple@example.com').textContent, /depuis 3.j/)
  assert.match(ligne(racine, 'simple@example.com').textContent, /invité·e par anne@example\.com/)
})

test('les badges du courrier se remplissent après coup, sans rien afficher quand on ne sait pas', async () => {
  const { racine } = monter({
    reponses: {
      'GET /api/admin/invitations/courrier': {
        corps: {
          etats: {
            'doc1|simple@example.com': { etat: 'refuse', detail: '550 5.1.1 user unknown' },
            'doc2|beta@example.com': { etat: 'inconnu' },
          },
        },
      },
    },
  })
  await chargerEtatsCourrier(racine)
  const cellule = (email) => ligne(racine, email).querySelector('[data-inv-courrier]')
  assert.equal(cellule('simple@example.com').querySelector('.access-courrier').textContent, 'courrier refusé')
  assert.equal(
    cellule('simple@example.com').querySelector('.access-courrier-detail').textContent,
    '550 5.1.1 user unknown'
  )
  assert.equal(cellule('beta@example.com').textContent, '')
})

test('si la lecture des états échoue, le tableau reste intact', async () => {
  const { racine } = monter()
  await chargerEtatsCourrier(racine)
  assert.equal(ligne(racine, 'simple@example.com').querySelector('[data-inv-courrier]').textContent, '')
})

test('« Copier le lien » demande un nouveau lien et le met dans le presse-papiers', async () => {
  const ecrits = []
  const { racine, appels } = monter({
    presse: { writeText: async (t) => ecrits.push(t) },
    reponses: { 'POST /api/admin/invitations/lien': { corps: { lien: 'http://localhost/#/invite/abc' } } },
  })
  bouton(racine, 'simple@example.com', 'copier').click()
  await attendre()
  assert.deepEqual(appels.at(-1), {
    url: '/api/admin/invitations/lien',
    methode: 'POST',
    corps: { docId: 'doc1', email: 'simple@example.com' },
  })
  assert.deepEqual(ecrits, ['http://localhost/#/invite/abc'])
  assert.match(ligne(racine, 'simple@example.com').querySelector('.bo-inv-msg').textContent, /Lien copié/)
})

test('si le presse-papiers refuse, le lien est montré à copier à la main ; si le serveur refuse, l’erreur est dite', async () => {
  const refus = {
    writeText: async () => {
      throw new Error('non')
    },
  }
  const a = monter({
    presse: refus,
    reponses: { 'POST /api/admin/invitations/lien': { corps: { lien: 'http://localhost/#/invite/xyz' } } },
  })
  bouton(a.racine, 'beta@example.com', 'copier').click()
  await attendre()
  const champ = ligne(a.racine, 'beta@example.com').querySelector('input.lien-copie')
  assert.equal(champ.value, 'http://localhost/#/invite/xyz')

  const b = monter({
    reponses: {
      'POST /api/admin/invitations/lien': {
        status: 404,
        corps: { error: 'aucune invitation en attente pour cette adresse' },
      },
    },
  })
  bouton(b.racine, 'beta@example.com', 'copier').click()
  await attendre()
  const msg = ligne(b.racine, 'beta@example.com').querySelector('.bo-inv-msg')
  assert.match(msg.textContent, /aucune invitation en attente/)
  assert.ok(msg.classList.contains('bo-erreur'))
})

test('renvoyer se fait en deux clics : le premier arme, le second écrit', async () => {
  const { racine, appels, apres } = monter({
    reponses: { 'POST /api/admin/invitations/renvoyer': { corps: { renvoyee: true } } },
  })
  const b = bouton(racine, 'simple@example.com', 'renvoyer')
  b.click()
  await attendre()
  assert.equal(appels.length, 0, 'rien d’envoyé au premier clic')
  assert.equal(b.textContent, 'Confirmer ?')
  assert.match(
    ligne(racine, 'simple@example.com').querySelector('.bo-inv-msg').textContent,
    /Écrire de nouveau à simple@example\.com/
  )
  b.click()
  await attendre()
  assert.deepEqual(appels, [
    { url: '/api/admin/invitations/renvoyer', methode: 'POST', corps: { docId: 'doc1', email: 'simple@example.com' } },
  ])
  assert.deepEqual(apres, ['Invitation renvoyée à simple@example.com.'])
})

test('supprimer se fait en deux clics, et dit ce qui part avec pour un embarquement', async () => {
  const { racine, appels, apres } = monter({
    reponses: {
      'DELETE /api/admin/invitations': { corps: { ok: true, documentSupprime: true, remiseEnAttente: true } },
    },
  })
  const b = bouton(racine, 'beta@example.com', 'supprimer')
  b.click()
  await attendre()
  assert.equal(appels.length, 0)
  assert.match(
    ligne(racine, 'beta@example.com').querySelector('.bo-inv-msg').textContent,
    /document de bienvenue de beta@example\.com ; l'adresse retournera dans la liste d'attente/
  )
  b.click()
  await attendre()
  assert.deepEqual(appels, [
    { url: '/api/admin/invitations', methode: 'DELETE', corps: { docId: 'doc2', email: 'beta@example.com' } },
  ])
  assert.deepEqual(apres, [
    "Invitation de beta@example.com supprimée ; l'adresse est de nouveau dans la liste d'attente.",
  ])
})

test('supprimer une invitation ordinaire le dit autrement, et une erreur du serveur reste affichée', async () => {
  const a = monter()
  const b = bouton(a.racine, 'simple@example.com', 'supprimer')
  b.click()
  assert.match(
    ligne(a.racine, 'simple@example.com').querySelector('.bo-inv-msg').textContent,
    /elle n'aura plus accès au document/
  )
  b.click()
  await attendre()
  const msg = ligne(a.racine, 'simple@example.com').querySelector('.bo-inv-msg')
  assert.ok(msg.classList.contains('bo-erreur'))
  assert.equal(b.disabled, false, 'on peut réessayer')
  assert.deepEqual(a.apres, [])
})

test('rappeler brancherInvitations ne double pas les écouteurs', async () => {
  const { racine, appels } = monter({
    reponses: { 'POST /api/admin/invitations/renvoyer': { corps: { renvoyee: true } } },
  })
  brancherInvitations(racine, async () => {})
  brancherInvitations(racine, async () => {})
  const b = bouton(racine, 'simple@example.com', 'renvoyer')
  b.click()
  b.click()
  await attendre()
  assert.equal(appels.filter((a) => a.methode === 'POST').length, 1)
})
