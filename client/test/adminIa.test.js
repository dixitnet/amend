// La page des réglages de l'IA du back-office (13/10/2026, src/adminIa.js),
// montée dans jsdom avec un faux serveur : les réglages de chaque fonction,
// leur enregistrement, les erreurs du serveur, la consommation du mois en
// signes et les jetons par modèle. Jamais de pages.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountAdminIa, libelleMois } from '../src/adminIa.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  return document.getElementById('app')
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms))

const compteur = (o = {}) => ({
  demandes: 0,
  signes: 0,
  echecs: 0,
  entree: 0,
  sortie: 0,
  cacheLu: 0,
  cacheEcrit: 0,
  usd: 0,
  ...o,
})

function donnees(surcharge = {}) {
  return {
    reglages: {
      corrections: {
        modele: 'claude-haiku-5-5',
        signesParDemande: 30000,
        demandesParHeure: 100,
        signesParMois: 500000,
        acces: 'editeur',
      },
      margo: {
        modele: 'claude-sonnet-5-5',
        signesParDemande: 60000,
        demandesParHeure: 30,
        signesParMois: 300000,
        acces: 'editeur',
        maniere: 'Tu vouvoies la personne.\nSois brève.',
      },
      modifieLe: null,
      modifiePar: null,
    },
    defauts: { margo: { maniere: 'TEXTE PAR DÉFAUT — tu vouvoies.' } },
    maniereMax: 2000,
    bornes: {
      signesParDemande: { min: 100, max: 5000000 },
      demandesParHeure: { min: 1, max: 100000 },
      signesParMois: { min: 1000, max: 1000000000 },
    },
    modeles: [
      { id: 'claude-haiku-5-5', nom: 'Haiku 5.5' },
      { id: 'claude-sonnet-5-5', nom: 'Sonnet 5.5' },
    ],
    niveaux: ['admin', 'editeur', 'correcteur'],
    fonctions: [
      { id: 'corrections', nom: 'Corrections IA' },
      { id: 'margo', nom: 'Margo' },
    ],
    mois: '2026-10',
    moisDisponibles: ['2026-10', '2026-09'],
    utilisateurs: [
      {
        email: 'alice@example.com',
        nom: 'Alice',
        corrections: compteur({ demandes: 3, signes: 12000, entree: 6000, sortie: 3000, usd: 0.0021 }),
        margo: compteur({
          demandes: 2,
          signes: 80000,
          echecs: 1,
          entree: 90000,
          sortie: 4000,
          cacheLu: 50000,
          cacheEcrit: 10000,
          usd: 0.31,
        }),
      },
    ],
    jetonsParModele: {
      'claude-haiku-5-5': {
        appels: 3,
        entree: 6000,
        sortie: 3000,
        cacheLu: 0,
        cacheEcrit: 0,
        usd: 0.0021,
        parFonction: { corrections: compteur({ appels: 3, entree: 6000, sortie: 3000, usd: 0.0021 }) },
      },
      'claude-sonnet-5-5': {
        appels: 3,
        entree: 90000,
        sortie: 4000,
        cacheLu: 50000,
        cacheEcrit: 10000,
        usd: 0.31,
        parFonction: {
          margo: compteur({ appels: 3, entree: 90000, sortie: 4000, cacheLu: 50000, cacheEcrit: 10000, usd: 0.31 }),
        },
      },
    },
    tarifsUsd: { 'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 }, 'claude-sonnet-5-5': { entree: 2, sortie: 10 } },
    ...surcharge,
  }
}

test('la rubrique IA montre les réglages de chaque fonction et jamais le mot « page »', async () => {
  const racine = installer()
  await mountAdminIa(racine, { fetcher: async () => json(donnees()) })
  assert.equal(racine.querySelector('h1').textContent, 'Back-office')
  assert.equal(racine.querySelector('.bo-onglet.actif').textContent.trim(), 'IA')
  assert.equal(racine.querySelector('h2').textContent, 'Réglages')
  const cartes = [...racine.querySelectorAll('.bo-ia-carte')]
  assert.deepEqual(
    cartes.map((c) => c.querySelector('legend').textContent),
    ['Corrections IA', 'Margo']
  )
  const val = (nom) => racine.querySelector(`[name="${nom}"]`).value
  assert.equal(val('corrections.modele'), 'claude-haiku-5-5')
  assert.equal(val('margo.modele'), 'claude-sonnet-5-5')
  assert.equal(val('corrections.signesParMois'), '500000')
  assert.equal(val('margo.demandesParHeure'), '30')
  assert.equal(val('margo.acces'), 'editeur')
  // Sans information sur les clés (ancienne réponse du serveur), aucun avertissement.
  assert.deepEqual(
    [...racine.querySelector('[name="margo.modele"]').options].map((o) => o.textContent),
    ['Haiku 5.5', 'Sonnet 5.5']
  )
  assert.deepEqual(
    [...racine.querySelector('[name="margo.acces"]').options].map((o) => o.value),
    ['admin', 'editeur', 'correcteur']
  )
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

test('Mistral Large 4 est proposé, et signalé « clé non configurée » tant que le serveur n’a pas la clé', async () => {
  const racine = installer()
  const d = donnees()
  d.modeles = [
    { id: 'claude-haiku-5-5', nom: 'Haiku 5.5', cle: true },
    { id: 'claude-sonnet-5-5', nom: 'Sonnet 5.5', cle: true },
    { id: 'mistral-large-4-0', nom: 'Mistral Large 4', cle: false },
  ]
  await mountAdminIa(racine, { fetcher: async () => json(d) })
  const options = [...racine.querySelector('[name="corrections.modele"]').options]
  assert.deepEqual(
    options.map((o) => o.textContent),
    ['Haiku 5.5', 'Sonnet 5.5', 'Mistral Large 4 — clé non configurée']
  )
  assert.deepEqual(
    options.map((o) => o.value),
    ['claude-haiku-5-5', 'claude-sonnet-5-5', 'mistral-large-4-0']
  )
})

test('les clics du bouton « Reformuler », retiré, restent comptés au cumul — sous leur nom', async () => {
  const racine = installer()
  const boutons = {
    depuis: '2026-10',
    parMois: { '2026-10': { corriger: 3, reformuler: 2 } },
    cumul: { corriger: 3, reformuler: 2 },
  }
  await mountAdminIa(racine, { fetcher: async () => json(donnees({ boutons })) })
  const ligne = (nom) =>
    [...racine.querySelectorAll('.bo-table tbody tr')]
      .find((tr) => tr.querySelector('th').textContent === nom)
      ?.querySelectorAll('td')
  const cellules = (nom) => [...(ligne(nom) || [])].map((td) => td.textContent)
  assert.deepEqual(cellules('Reformuler (bouton retiré)'), ['2', '2', '40 %'])
  assert.deepEqual(cellules('Corriger'), ['3', '3', '60 %'])
  // Sans clic ancien, la ligne n'apparaît pas.
  const racine2 = installer()
  await mountAdminIa(racine2, {
    fetcher: async () =>
      json(
        donnees({ boutons: { depuis: '2026-10', parMois: { '2026-10': { corriger: 1 } }, cumul: { corriger: 1 } } })
      ),
  })
  assert.ok(!/bouton retiré/.test(racine2.textContent))
})

test('enregistrer envoie les deux fonctions, en nombres, et redessine avec le message de confirmation', async () => {
  const racine = installer()
  const appels = []
  let etat = donnees()
  const fetcher = async (url, options = {}) => {
    appels.push({
      url: String(url),
      methode: options.method || 'GET',
      corps: options.body ? JSON.parse(options.body) : null,
    })
    if (options.method === 'PUT') {
      const p = JSON.parse(options.body)
      etat = donnees({
        reglages: {
          ...etat.reglages,
          ...p,
          modifieLe: Date.parse('2026-10-13T09:00:00Z'),
          modifiePar: 'admin@example.com',
        },
      })
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
  assert.equal(
    racine.querySelector('[name="margo.signesParDemande"]').value,
    '20000',
    'la page relue montre les nouvelles valeurs'
  )
})

test('une valeur refusée par le serveur s’affiche telle quelle, sans rien perdre', async () => {
  const racine = installer()
  const fetcher = async (url, options = {}) =>
    options.method === 'PUT'
      ? json({ error: 'Margo : le nombre de signes par mois doit être un entier entre 1 000 et 1 000 000 000.' }, 400)
      : json(donnees())
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

test('la manière de répondre : un texte libre sur la carte de Margo seulement, avec compteur et retour au texte par défaut', async () => {
  const racine = installer()
  await mountAdminIa(racine, { fetcher: async () => json(donnees()) })
  assert.ok(!racine.querySelector('[name="corrections.maniere"]'), 'Corrections IA n’en a pas')
  const champ = racine.querySelector('textarea[name="margo.maniere"]')
  assert.equal(champ.value, 'Tu vouvoies la personne.\nSois brève.')
  assert.equal(champ.maxLength, 2000)
  assert.equal(
    racine.querySelector('[data-maniere-compteur]').textContent,
    String('Tu vouvoies la personne.\nSois brève.'.length)
  )
  champ.value = 'abc'
  champ.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(racine.querySelector('[data-maniere-compteur]').textContent, '3')
  racine.querySelector('[data-maniere-defaut]').click()
  assert.equal(champ.value, 'TEXTE PAR DÉFAUT — tu vouvoies.')
  assert.match(racine.querySelector('.bo-ia-message').textContent, /enregistrez/)
  assert.match(racine.textContent, /ses outils.*ne se règlent pas ici/i)
})

test('enregistrer envoie la manière de répondre de Margo, et elle seule', async () => {
  const racine = installer()
  const appels = []
  const fetcher = async (url, options = {}) => {
    appels.push({ methode: options.method || 'GET', corps: options.body ? JSON.parse(options.body) : null })
    return json(donnees())
  }
  await mountAdminIa(racine, { fetcher })
  racine.querySelector('[name="margo.maniere"]').value = 'Réponds par oui ou par non.'
  racine.querySelector('.bo-ia-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(40)
  const put = appels.find((a) => a.methode === 'PUT')
  assert.equal(put.corps.margo.maniere, 'Réponds par oui ou par non.')
  assert.ok(!('maniere' in put.corps.corrections))
})

test('la rubrique IA réunit aussi l’activité récente de la vue d’ensemble, et fonctionne sans elle', async () => {
  const racine = installer()
  const periode = (n) => ({ appels: n, entree: n * 10, sortie: n, cacheLu: 0, cacheEcrit: 0 })
  const fenetre = { '24h': periode(1), '7j': periode(2), '30j': periode(3), parModele: [], parPersonne: [] }
  const apercu = {
    genereLe: Date.UTC(2026, 9, 14, 8),
    flux: {
      tokens: { barreLaterale: { '24h': periode(4), '7j': periode(5), '30j': periode(6) }, fenetre },
      ia: {
        coutEuros30j: 1.5,
        coutEuros7j: 0.5,
        coutEuros24h: 0.1,
        appels30j: 6,
        appels7j: 5,
        tokensEntree30j: 60,
        tokensSortie30j: 6,
        parPersonne: [],
        tarif: null,
      },
      support: { aTraiter: [{ cle: 'a' }, { cle: 'b' }], traites: [] },
    },
  }
  const fetcher = async (url) =>
    String(url) === '/api/admin/overview'
      ? json(apercu)
      : String(url) === '/api/admin/waitlist'
        ? json({ enAttente: 3, file: [] })
        : json(donnees())
  await mountAdminIa(racine, { fetcher })
  const h2 = [...racine.querySelectorAll('h2')].map((h) => h.textContent)
  assert.deepEqual(h2, [
    'Réglages',
    'Consommation de octobre 2026',
    'Boutons de Corrections IA',
    'Jetons par modèle',
    'Activité récente',
  ])
  assert.match(racine.textContent, /Consommation de l'IA en tokens/)
  assert.match(racine.textContent, /Corrections IA — barre latérale \(30 jours\)/)
  assert.match(racine.textContent.replace(/\s/g, ' '), /1,50 €/)
  // Les pastilles des onglets viennent de la même vue.
  assert.equal(racine.querySelector('a[href="#/admin/utilisateurs"] .bo-onglet-badge').textContent, '3')
  assert.equal(racine.querySelector('a[href="#/admin/retours"] .bo-onglet-badge').textContent, '2')

  // La vue en panne : les réglages restent là, sans l’activité récente.
  const seule = installer()
  await mountAdminIa(seule, {
    fetcher: async (url) => (String(url).startsWith('/api/admin/ia') ? json(donnees()) : json({}, 500)),
  })
  assert.ok(seule.querySelector('.bo-ia-form'))
  assert.ok(!/Activité récente/.test(seule.textContent))
})

const gardeFous = (valeurs = {}) => ({
  groupes: [
    { id: 'margo', nom: 'Margo', resume: 'Le dialogue flottant.' },
    { id: 'outils', nom: 'Outils sur le document', resume: 'Ce que chaque appel peut lire ou écrire.' },
  ],
  definitions: [
    {
      id: 'margoEtapes',
      groupe: 'margo',
      nom: 'Étapes d’une demande, au plus',
      unite: 'allers-retours avec le modèle',
      defaut: 100,
      min: 5,
      max: 10000,
      nature: 'emballement',
      quoi: 'Une demande à Margo est une boucle.',
    },
    {
      id: 'remplacementsParAppel',
      groupe: 'outils',
      nom: 'Remplacements par appel',
      unite: 'remplacements',
      defaut: 30,
      min: 1,
      max: 1000,
      nature: 'modele',
      quoi: 'Combien de remplacements tiennent dans un appel.',
    },
  ],
  valeurs: { margoEtapes: 100, remplacementsParAppel: 30, ...valeurs },
})

test('les garde-fous : regroupés, documentés, la nature dite, le réglé signalé, rétablissables un à un', async () => {
  const racine = installer()
  const fetcher = async () => json(donnees({ gardeFous: gardeFous({ remplacementsParAppel: 80 }) }))
  await mountAdminIa(racine, { fetcher })
  const bloc = racine.querySelector('.bo-gf-form')
  assert.ok(bloc, 'la section existe')
  assert.match(racine.textContent, /La seule limite d'usage est la taille de la demande, en signes/)
  assert.equal(bloc.querySelectorAll('.bo-gf-groupe').length, 2)
  assert.match(bloc.textContent, /Une demande à Margo est une boucle\./)
  assert.match(bloc.textContent, /verrou contre l’emballement/)
  assert.match(bloc.textContent, /limite du modèle/)
  assert.equal(bloc.elements['gf.remplacementsParAppel'].value, '80')
  assert.ok(bloc.querySelector('.bo-gf-regle'), 'la valeur réglée est signalée')
  assert.equal(bloc.querySelectorAll('.bo-gf-regle').length, 1, 'seule la valeur réglée')
  bloc.querySelector('[data-gf-defaut="remplacementsParAppel"]').click()
  assert.equal(bloc.elements['gf.remplacementsParAppel'].value, '30')
  assert.match(bloc.querySelector('.bo-gf-message').textContent, /enregistrez pour l’appliquer/)
})

test('enregistrer les garde-fous envoie des nombres sous « gardeFous », sans toucher aux réglages des fonctions', async () => {
  const racine = installer()
  const appels = []
  let etat = donnees({ gardeFous: gardeFous() })
  const fetcher = async (url, options = {}) => {
    appels.push({ methode: options.method || 'GET', corps: options.body ? JSON.parse(options.body) : null })
    if (options.method === 'PUT') etat = donnees({ gardeFous: gardeFous(JSON.parse(options.body).gardeFous) })
    return json(etat)
  }
  await mountAdminIa(racine, { fetcher })
  const f = racine.querySelector('.bo-gf-form')
  f.elements['gf.margoEtapes'].value = '60'
  f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(40)
  const put = appels.find((a) => a.methode === 'PUT')
  assert.deepEqual(put.corps, { gardeFous: { margoEtapes: 60, remplacementsParAppel: 30 } })
  assert.match(racine.querySelector('.bo-gf-message').textContent, /Garde-fous enregistrés/)
  assert.equal(racine.querySelector('.bo-gf-form').elements['gf.margoEtapes'].value, '60')
})

test('sans garde-fous dans la réponse (ancien serveur), la page se dessine quand même', async () => {
  const racine = installer()
  await mountAdminIa(racine, { fetcher: async () => json(donnees()) })
  assert.equal(racine.querySelector('.bo-gf-form'), null)
  assert.ok(racine.querySelector('.bo-ia-form'))
})
