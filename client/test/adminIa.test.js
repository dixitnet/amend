// La page des réglages de l'IA du back-office (13/10/2026, src/adminIa.js),
// montée dans jsdom avec un faux serveur : les réglages de chaque fonction,
// leur enregistrement, les erreurs du serveur, la consommation du mois en
// signes et les jetons par modèle. Jamais de pages.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountAdminIa, libelleMois } from '../src/adminIa.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return document.getElementById('app')
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms))

const compteur = (o = {}) => ({ demandes: 0, signes: 0, echecs: 0, entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0, usd: 0, ...o })

function donnees(surcharge = {}) {
  return {
    reglages: {
      corrections: { modele: 'claude-haiku-5-5', signesParDemande: 30000, demandesParHeure: 100, signesParMois: 500000, acces: 'editeur' },
      margo: { modele: 'claude-sonnet-5-5', signesParDemande: 60000, demandesParHeure: 30, signesParMois: 300000, acces: 'editeur' },
      modifieLe: null,
      modifiePar: null,
    },
    bornes: { signesParDemande: { min: 100, max: 5000000 }, demandesParHeure: { min: 1, max: 100000 }, signesParMois: { min: 1000, max: 1000000000 } },
    modeles: [{ id: 'claude-haiku-5-5', nom: 'Haiku 5.5' }, { id: 'claude-sonnet-5-5', nom: 'Sonnet 5.5' }],
    niveaux: ['admin', 'editeur', 'correcteur'],
    fonctions: [{ id: 'corrections', nom: 'Corrections IA' }, { id: 'margo', nom: 'Margo' }],
    mois: '2026-10',
    moisDisponibles: ['2026-10', '2026-09'],
    utilisateurs: [
      { email: 'alice@example.com', nom: 'Alice', corrections: compteur({ demandes: 3, signes: 12000, entree: 6000, sortie: 3000, usd: 0.0021 }), margo: compteur({ demandes: 2, signes: 80000, echecs: 1, entree: 90000, sortie: 4000, cacheLu: 50000, cacheEcrit: 10000, usd: 0.31 }) },
    ],
    jetonsParModele: {
      'claude-haiku-5-5': { appels: 3, entree: 6000, sortie: 3000, cacheLu: 0, cacheEcrit: 0, usd: 0.0021, parFonction: { corrections: compteur({ appels: 3, entree: 6000, sortie: 3000, usd: 0.0021 }) } },
      'claude-sonnet-5-5': { appels: 3, entree: 90000, sortie: 4000, cacheLu: 50000, cacheEcrit: 10000, usd: 0.31, parFonction: { margo: compteur({ appels: 3, entree: 90000, sortie: 4000, cacheLu: 50000, cacheEcrit: 10000, usd: 0.31 }) } },
    },
    tarifsUsd: { 'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 }, 'claude-sonnet-5-5': { entree: 2, sortie: 10 } },
    ...surcharge,
  }
}

test('la page montre les réglages de chaque fonction et jamais le mot « page »', async () => {
  const racine = installer()
  await mountAdminIa(racine, { fetcher: async () => json(donnees()) })
  assert.equal(racine.querySelector('h1').textContent, 'Réglages de l’IA')
  const cartes = [...racine.querySelectorAll('.bo-ia-carte')]
  assert.deepEqual(cartes.map((c) => c.querySelector('legend').textContent), ['Corrections IA', 'Margo'])
  const val = (nom) => racine.querySelector(`[name="${nom}"]`).value
  assert.equal(val('corrections.modele'), 'claude-haiku-5-5')
  assert.equal(val('margo.modele'), 'claude-sonnet-5-5')
  assert.equal(val('corrections.signesParMois'), '500000')
  assert.equal(val('margo.demandesParHeure'), '30')
  assert.equal(val('margo.acces'), 'editeur')
  // Seulement Haiku et Sonnet.
  assert.deepEqual([...racine.querySelector('[name="margo.modele"]').options].map((o) => o.textContent), ['Haiku 5.5', 'Sonnet 5.5'])
  assert.deepEqual([...racine.querySelector('[name="margo.acces"]').options].map((o) => o.value), ['admin', 'editeur', 'correcteur'])
  assert.match(racine.textContent, /signes, espaces compris/)
  assert.ok(!/\bpages?\b/i.test(racine.textContent), 'on ne parle qu’en signes')
})

test('la consommation du mois : par personne, en signes, avec jetons, coût estimé et jetons par signe', async () => {
  const racine = installer()
  await mountAdminIa(racine, { fetcher: async () => json(donnees()) })
  const texte = racine.querySelector('.bo-ia-table').textContent.replace(/ /g, ' ').replace(/ /g, ' ')
  assert.match(texte, /alice@example\.com/)
  assert.match(texte, /12 000 \/ 500 000 signes \(2 %\)/)
  assert.match(texte, /80 000 \/ 300 000 signes \(27 %\)/)
  assert.match(texte, /1 échec/)
  assert.match(texte, /6 000 entrée · 3 000 sortie/)
  assert.match(texte, /0,31 \$/)
  // Le total donne le rapport jetons / signes, pour chiffrer les quotas.
  assert.match(texte, /0,75 jeton\(s\) par signe/) // (6000+3000) / 12000
  const modeles = [...racine.querySelectorAll('table')].pop().textContent.replace(/ /g, ' ')
  assert.match(modeles, /Sonnet 5\.5/)
  assert.match(modeles, /↳ Margo/)
  assert.match(modeles, /2 \/ 10 \$ par million/)
  assert.equal(libelleMois('2026-10'), 'octobre 2026')
})

test('enregistrer envoie les deux fonctions, en nombres, et redessine avec le message de confirmation', async () => {
  const racine = installer()
  const appels = []
  let etat = donnees()
  const fetcher = async (url, options = {}) => {
    appels.push({ url: String(url), methode: options.method || 'GET', corps: options.body ? JSON.parse(options.body) : null })
    if (options.method === 'PUT') {
      const p = JSON.parse(options.body)
      etat = donnees({ reglages: { ...etat.reglages, ...p, modifieLe: Date.parse('2026-10-13T09:00:00Z'), modifiePar: 'admin@example.com' } })
    }
    return json(etat)
  }
  await mountAdminIa(racine, { fetcher })
  racine.querySelector('[name="margo.modele"]').value = 'claude-haiku-5-5'
  racine.querySelector('[name="margo.signesParDemande"]').value = '20000'
  racine.querySelector('[name="corrections.acces"]').value = 'correcteur'
  racine.querySelector('.bo-ia-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(40)
  const put = appels.find((a) => a.methode === 'PUT')
  assert.equal(put.url, '/api/admin/ia')
  assert.equal(put.corps.margo.modele, 'claude-haiku-5-5')
  assert.strictEqual(put.corps.margo.signesParDemande, 20000)
  assert.strictEqual(put.corps.margo.demandesParHeure, 30)
  assert.equal(put.corps.corrections.acces, 'correcteur')
  assert.match(racine.querySelector('.bo-ia-message').textContent, /Réglages enregistrés/)
  assert.equal(racine.querySelector('[name="margo.signesParDemande"]').value, '20000', 'la page relue montre les nouvelles valeurs')
})

test('une valeur refusée par le serveur s’affiche telle quelle, sans rien perdre', async () => {
  const racine = installer()
  const fetcher = async (url, options = {}) =>
    options.method === 'PUT' ? json({ error: 'Margo : le nombre de signes par mois doit être un entier entre 1 000 et 1 000 000 000.' }, 400) : json(donnees())
  await mountAdminIa(racine, { fetcher })
  racine.querySelector('[name="margo.signesParMois"]').value = '5'
  racine.querySelector('.bo-ia-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(30)
  assert.match(racine.querySelector('.bo-ia-message').textContent, /entier entre 1 000/)
  assert.ok(racine.querySelector('.bo-ia-message').classList.contains('bo-erreur'))
  assert.equal(racine.querySelector('[name="margo.signesParMois"]').value, '5', 'ce qu’on a tapé reste là')
})

test('changer de mois relit la consommation de ce mois ; un non-administrateur est renvoyé', async () => {
  const racine = installer()
  const urls = []
  await mountAdminIa(racine, { fetcher: async (url) => (urls.push(String(url)), json(donnees())) })
  const select = racine.querySelector('select[name="mois"]')
  select.value = '2026-09'
  select.dispatchEvent(new window.Event('change', { bubbles: true }))
  await attendre(20)
  assert.ok(urls.includes('/api/admin/ia?mois=2026-09'))

  const interdit = installer()
  await mountAdminIa(interdit, { fetcher: async () => json({ error: 'réservé aux administrateurs' }, 403) })
  assert.match(interdit.textContent, /Réservé aux administrateurs/)
})
