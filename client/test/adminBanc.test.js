// Le banc d'essai de Margo (03/11/2026, src/adminBanc.js), monté dans jsdom avec
// un faux serveur : les colonnes préremplies, l'estimation en signes,
// l'avertissement de limite de production, l'envoi, puis l'affichage côte à
// côte des réponses, modifications et commentaires reçus en flux.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountAdminBanc, signesApproximatifs, modelesParDefaut } from '../src/adminBanc.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.Event = dom.window.Event
  return document.getElementById('app')
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const ndjson = (...evts) =>
  new Response(evts.map((e) => JSON.stringify(e)).join('\n') + '\n', {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms))

const DONNEES = {
  modeles: [
    {
      id: 'claude-haiku-5-5',
      nom: 'Haiku 5.5',
      fournisseur: 'Anthropic',
      cle: true,
      reflexion: { niveaux: ['aucune', 'low', 'medium', 'high'], defaut: 'aucune' },
    },
    {
      id: 'claude-sonnet-5-5',
      nom: 'Sonnet 5.5',
      fournisseur: 'Anthropic',
      cle: true,
      reflexion: { niveaux: ['aucune', 'low', 'medium', 'high'], defaut: 'aucune' },
    },
    {
      id: 'mistral-large-4-0',
      nom: 'Mistral Large 4',
      fournisseur: 'Mistral (UE)',
      cle: false,
      reflexion: { niveaux: ['low', 'medium', 'high'], defaut: 'low' },
    },
    {
      id: 'qwen3.5-397b-a17b',
      nom: 'Qwen 3.5',
      fournisseur: 'Scaleway',
      cle: true,
      reflexion: { niveaux: ['aucune'], defaut: 'aucune' },
    },
  ],
  modeleMargo: 'claude-sonnet-5-5',
  maniere: 'Sois brève.',
  signesParDemande: 50,
  colonnesMax: 3,
  enCours: false,
}

function serveur(reponseBanc) {
  const appels = []
  const fetcher = async (url, init = {}) => {
    appels.push({ url, init })
    if (url === '/api/admin/banc' && init.method === 'POST') return reponseBanc()
    if (url === '/api/admin/banc') return json(DONNEES)
    return json({}, 500) // la vue d'ensemble : sa panne ne doit rien empêcher
  }
  return { fetcher, appels }
}

test('signes approximatifs : les lignes non vides, sans les marques de Markdown', () => {
  assert.equal(signesApproximatifs('# Titre\n\n- a\n**gras** et *ital*\n'), 5 + 1 + 'gras et ital'.length)
})

test('colonnes par défaut : le modèle de Margo, puis un autre modèle disponible, puis aucune', () => {
  assert.deepEqual(modelesParDefaut(DONNEES), ['claude-sonnet-5-5', 'claude-haiku-5-5', ''])
})

test('403 : la page le dit', async () => {
  const racine = installer()
  await mountAdminBanc(racine, { fetcher: async () => json({ error: 'non' }, 403) })
  assert.match(racine.textContent, /Réservé aux administrateurs/)
})

test('la page : trois colonnes, un modèle sans clé non choisissable, l’avertissement de non-comptage', async () => {
  const racine = installer()
  const { fetcher } = serveur(() => ndjson())
  await mountAdminBanc(racine, { fetcher })
  const form = racine.querySelector('.bo-banc-form')
  assert.equal(racine.querySelectorAll('.bo-banc-carte').length, 3)
  assert.equal(form.elements.modele0.value, 'claude-sonnet-5-5')
  assert.equal(form.elements.modele1.value, 'claude-haiku-5-5')
  assert.equal(form.elements.modele2.value, '')
  assert.equal(form.querySelector('option[value="mistral-large-4-0"]').disabled, true)
  assert.equal(form.elements.maniere0.value, 'Sois brève.')
  // Réflexion : les niveaux du modèle, celui de la production choisi d'avance ;
  // le choix suit le modèle, et disparaît pour un modèle à un seul niveau ou une colonne vide.
  assert.deepEqual(
    [...form.elements.reflexion0.options].map((o) => o.textContent),
    ['aucune (production)', 'basse', 'moyenne', 'haute']
  )
  assert.equal(form.elements.reflexion0.value, 'aucune')
  assert.equal(racine.querySelector('[data-col="2"] [data-reflexion]').hidden, true)
  form.elements.modele0.value = 'qwen3.5-397b-a17b'
  form.elements.modele0.dispatchEvent(new window.Event('change'))
  assert.equal(racine.querySelector('[data-col="0"] [data-reflexion]').hidden, true)
  form.elements.modele0.value = 'claude-sonnet-5-5'
  form.elements.modele0.dispatchEvent(new window.Event('change'))
  assert.equal(racine.querySelector('[data-col="0"] [data-reflexion]').hidden, false)
  assert.match(racine.textContent, /comptés nulle part/)

  form.elements.texte.value = 'Un texte bien plus long que cinquante signes, pour voir la limite.'
  form.elements.texte.dispatchEvent(new window.Event('input', { bubbles: true }))
  const estimation = form.querySelector('[data-estimation]').textContent
  assert.match(estimation, /2 colonne\(s\)/)
  assert.match(estimation, /Margo refuserait cette demande/)

  // Une manière modifiée est signalée, et se rétablit.
  const etat = racine.querySelector('[data-col="1"] [data-maniere-etat]')
  form.elements.maniere1.value = 'Autre.'
  form.elements.maniere1.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(etat.hidden, false)
  racine.querySelector('[data-maniere-defaut="1"]').click()
  assert.equal(form.elements.maniere1.value, 'Sois brève.')
  assert.equal(etat.hidden, true)
})

test('lancer : ce qui part, puis les résultats côte à côte', async () => {
  const racine = installer()
  const { fetcher, appels } = serveur(() =>
    ndjson(
      {
        type: 'debut',
        signes: 120,
        consigne: 8,
        signesParDemande: 50,
        refuseeEnProduction: true,
        colonnes: [
          { modele: 'claude-sonnet-5-5', nom: 'Sonnet 5.5', maniereModifiee: false, reflexion: 'high' },
          { modele: 'claude-haiku-5-5', nom: 'Haiku 5.5', maniereModifiee: true },
        ],
      },
      { col: 0, type: 'outil', nom: 'lire', libelle: 'lit les blocs 1 à 40' },
      { col: 1, type: 'texte', texte: 'Un **commentaire** au bloc [2].' },
      { col: 0, type: 'outil_fin', nom: 'lire', ok: true },
      { col: 0, type: 'texte', texte: 'Corrigé [3].' },
      { col: 0, type: 'fin', modifications: 1, commentaires: 0, refus: 0, usage: { tours: 2 }, lus: 1234 },
      {
        col: 0,
        type: 'resultat',
        ms: 2500,
        modifications: [
          {
            bloc: 3,
            ajoute: false,
            morceaux: [
              { t: 'Ils ', type: 'egal' },
              { t: 'mange', type: 'del' },
              { t: 'mangent', type: 'ins' },
            ],
          },
        ],
        commentaires: [],
      },
      { col: 1, type: 'erreur', message: 'Coupé.' },
      {
        col: 1,
        type: 'fin',
        modifications: 0,
        commentaires: 1,
        refus: 0,
        usage: { tours: 1 },
        lus: 0,
        incomplet: true,
      },
      {
        col: 1,
        type: 'resultat',
        ms: 900,
        modifications: [],
        commentaires: [{ bloc: 2, passage: 'ciel de plomb', texte: 'Cliché ?', reponses: [] }],
      },
      { type: 'termine' }
    )
  )
  await mountAdminBanc(racine, { fetcher })
  const form = racine.querySelector('.bo-banc-form')
  form.elements.titre.value = 'Zan'
  form.elements.texte.value = 'Zan naquit.\nIls mange.'
  form.elements.consigne.value = 'Corrige.'
  form.elements.maniere1.value = 'Autre.'
  form.elements.reflexion0.value = 'high'
  form.dispatchEvent(new window.Event('submit', { cancelable: true }))
  await attendre(80)

  const post = appels.find((a) => a.init.method === 'POST')
  assert.deepEqual(JSON.parse(post.init.body), {
    titre: 'Zan',
    texte: 'Zan naquit.\nIls mange.',
    consigne: 'Corrige.',
    colonnes: [
      { modele: 'claude-sonnet-5-5', reflexion: 'high', maniere: 'Sois brève.' },
      { modele: 'claude-haiku-5-5', reflexion: 'aucune', maniere: 'Autre.' },
    ],
  })

  const cols = racine.querySelectorAll('.bo-banc-col')
  assert.equal(cols.length, 2)
  assert.match(racine.querySelector('.bo-banc-resultats').textContent, /serait refusée/)
  // Colonne 1 : étape, réponse, modification barrée / soulignée, chiffres.
  assert.equal(cols[0].querySelector('[data-nb-etapes]').textContent, '1')
  assert.match(cols[0].querySelector('.bo-banc-reponse').textContent, /Corrigé \[3\]/)
  assert.equal(cols[0].querySelector('del').textContent, 'mange')
  assert.equal(cols[0].querySelector('ins').textContent, 'mangent')
  assert.equal(cols[0].querySelector('[data-nb-modifs]').textContent, '1')
  assert.match(
    cols[0].querySelector('.bo-banc-etat').textContent,
    /Terminé — 2,5 s · 2 appel\(s\) au modèle · 1\s?234\s?signes lus/u
  )
  // Colonne 2 : manière modifiée, gras rendu sans innerHTML, erreur, commentaire avec son passage.
  assert.match(cols[0].querySelector('h3').textContent, /réflexion haute/)
  assert.match(cols[1].querySelector('h3').textContent, /manière modifiée/)
  assert.equal(cols[1].querySelector('.bo-banc-reponse strong').textContent, 'commentaire')
  assert.equal(cols[1].querySelector('.bo-banc-erreurs').textContent, 'Coupé.')
  assert.equal(cols[1].querySelector('.bo-banc-passage').textContent, '«\u00a0ciel de plomb\u00a0»')
  // Le [2] de la réponse mène au commentaire du bloc 2.
  cols[1].querySelector('.bo-banc-reponse button').click()
  assert.ok(cols[1].querySelector('li[data-bloc="2"]').classList.contains('bo-banc-vise'))
  assert.equal(cols[1].querySelector('.bo-banc-commentaire').textContent, 'Cliché ?')
  assert.match(cols[1].querySelector('.bo-banc-etat').textContent, /demande incomplète/)
  assert.match(racine.querySelector('.bo-ia-message').textContent, /Essai terminé/)
  assert.equal(form.querySelector('[type="submit"]').disabled, false)
})

test('refus du serveur : le message est affiché, rien n’est dessiné', async () => {
  const racine = installer()
  const { fetcher } = serveur(() => json({ error: 'Un essai est déjà en cours sur cette instance.' }, 429))
  await mountAdminBanc(racine, { fetcher })
  const form = racine.querySelector('.bo-banc-form')
  form.elements.texte.value = 'Un.'
  form.elements.consigne.value = 'x'
  form.dispatchEvent(new window.Event('submit', { cancelable: true }))
  await attendre()
  assert.match(racine.querySelector('.bo-ia-message').textContent, /déjà en cours/)
  assert.equal(racine.querySelectorAll('.bo-banc-col').length, 0)
})
