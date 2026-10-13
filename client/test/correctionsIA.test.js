// Le panneau « Corrections IA » de la barre latérale, monté dans un vrai
// éditeur (jsdom) avec un faux serveur (13/10/2026, src/aiPanel.js). Ce qui s'y
// teste : l'accès lu sur le serveur, le nom du panneau, la taille de la
// sélection et les limites **en signes** (seulement quand elles comptent), une sélection de
// plusieurs paragraphes envoyée en **une seule demande**, et une demande
// trop grosse qui ne part pas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection, AllSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction, listChanges } from '../src/trackChanges.js'
import { mountAIPanel } from '../src/aiPanel.js'

const ALICE = { name: 'Alice', color: '#3d5a80' }

function monter() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="editeur"></div><div id="ia"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of [
    'HTMLElement',
    'Node',
    'Element',
    'getComputedStyle',
    'DocumentFragment',
    'Range',
    'MutationObserver',
    'Event',
    'KeyboardEvent',
  ])
    globalThis[k] = w[k]
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  w.Element.prototype.scrollIntoView = () => {}
  const p = (t) => schema.node('paragraph', null, t ? [schema.text(t)] : [])
  const doc = schema.node('doc', null, [p('Ils mange des pomme.'), p('Elles mange aussi.'), p(''), p('Fin du texte.')])
  const state = EditorState.create({ doc, plugins: [trackChangesPlugin({ enabled: true })] })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  return view
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function fauxServeur({ corrections = {}, suggestions = null, erreur = null } = {}) {
  const etat = {
    autorise: true,
    modele: 'claude-haiku-5-5',
    signesParDemande: 30000,
    mois: { utilises: 4200, max: 500000 },
    heure: { utilisees: 0, max: 100 },
    ...corrections,
  }
  const posts = []
  const fetcher = async (url, options = {}) => {
    if (String(url).endsWith('/ia')) return json({ corrections: etat, margo: { autorise: false } })
    posts.push(JSON.parse(options.body))
    if (erreur) return json({ error: erreur.message }, erreur.status)
    return json({
      suggestions:
        suggestions ||
        posts[posts.length - 1].textes.map((t) => t.replace('mange', 'mangent').replace('pomme', 'pommes')),
    })
  }
  return { fetcher, posts, etat }
}

const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const debut = (view, n) => {
  let pos = 0
  view.state.doc.forEach((node, offset, i) => {
    if (i === n - 1) pos = offset + 1
  })
  return pos
}
const choisir = (view, from, to = from) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
const clic = (e) => e.dispatchEvent(new window.Event('click', { bubbles: true }))

test('sans accès (niveau réglé dans le back-office), le panneau le dit et ne propose rien', async () => {
  monter()
  const serveur = fauxServeur({ corrections: { autorise: false } })
  const panneau = mountAIPanel(document.getElementById('ia'), () => null, { docId: 'd1', fetcher: serveur.fetcher })
  await panneau.prete
  const zone = document.getElementById('ia')
  assert.equal(zone.querySelector('h3').textContent, 'Corrections IA')
  assert.match(zone.textContent, /n’est pas ouverte à votre rôle/)
  assert.equal(zone.querySelector('textarea'), null)
})

test('le panneau se réduit à un titre, une phrase et des boutons — ni champ, ni compteur tant que rien ne presse', async () => {
  const view = monter()
  const serveur = fauxServeur()
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd1', fetcher: serveur.fetcher })
  await panneau.prete
  const zone = document.getElementById('ia')
  assert.equal(zone.querySelector('h3').textContent, 'Corrections IA')
  assert.equal(zone.querySelector('.ai-hint').textContent, 'Sélectionnez un passage, puis donnez une consigne.')
  assert.deepEqual(
    [...zone.querySelectorAll('button')].map((b) => b.textContent),
    ['Raccourcir', 'Corriger', 'Clarifier', 'Développer', 'Plus soutenu', 'Plus direct']
  )
  assert.equal(zone.querySelector('textarea'), null, 'plus de champ libre')
  assert.equal(zone.querySelector('.btn-primary'), null, 'plus de « Demander une correction »')
  assert.equal(zone.querySelector('.ai-quota').textContent, '', 'rien à dire : 4 200 sur 500 000, sélection vide')
  assert.ok(!/page/i.test(zone.textContent), 'jamais de pages')

  // Une sélection raisonnable ne change rien…
  choisir(view, debut(view, 1), debut(view, 1) + 'Ils mange'.length)
  document.dispatchEvent(new window.Event('selectionchange'))
  assert.equal(zone.querySelector('.ai-quota').textContent, '')
  panneau.destroy()
})

test('les limites n’apparaissent que quand elles comptent : sélection trop grosse, mois bientôt épuisé', async () => {
  const view = monter()
  const serveur = fauxServeur({ corrections: { signesParDemande: 30, mois: { utilises: 410000, max: 500000 } } })
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd1', fetcher: serveur.fetcher })
  await panneau.prete
  const zone = document.getElementById('ia')
  const espaces = (t) => t.replace(/\s/g, ' ') // `rapport` met des espaces insécables fines
  assert.equal(espaces(zone.querySelector('.ai-quota').textContent), 'Ce mois-ci : 410 000 / 500 000 signes.')
  choisir(view, debut(view, 1), debut(view, 4) + 5)
  document.dispatchEvent(new window.Event('selectionchange'))
  assert.match(
    espaces(zone.querySelector('.ai-quota').textContent),
    /^Sélection : .* \/ 30 signes par demande\. Ce mois-ci : 410 000/
  )
  assert.ok(zone.querySelector('.ai-quota').classList.contains('ai-alerte'))
  panneau.destroy()
})

test('chaque bouton envoie sa consigne, et ils sont bloqués pendant la demande', async () => {
  const view = monter()
  const serveur = fauxServeur()
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd1', fetcher: serveur.fetcher })
  await panneau.prete
  const [raccourcir, corriger] = document.querySelectorAll('#ia .btn-preset')
  choisir(view, debut(view, 1), debut(view, 1) + 'Ils mange des pomme.'.length)
  clic(corriger)
  assert.ok(raccourcir.disabled && corriger.disabled, 'bloqués le temps de la demande')
  await attendre(50)
  assert.ok(!raccourcir.disabled && !corriger.disabled)
  assert.match(serveur.posts[0].instruction, /^Corrige l'orthographe/)
  assert.equal(serveur.posts[0].action, 'corriger', 'le serveur compte les clics par bouton')
  panneau.destroy()
})

test('sans sélection, un bouton le dit et rien ne part', async () => {
  const view = monter()
  const serveur = fauxServeur()
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd1', fetcher: serveur.fetcher })
  await panneau.prete
  clic(document.querySelector('#ia .btn-preset'))
  await attendre(20)
  assert.equal(serveur.posts.length, 0)
  assert.match(document.querySelector('#ia .ai-status').textContent, /Sélectionnez d'abord un passage/)
  panneau.destroy()
})

test('un paragraphe : une demande, la correction arrive en suivi de modifications', async () => {
  const view = monter()
  const serveur = fauxServeur()
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd1', fetcher: serveur.fetcher })
  await panneau.prete
  choisir(view, debut(view, 1), debut(view, 1) + 'Ils mange des pomme.'.length)
  clic(document.querySelector('#ia .btn-preset'))
  await attendre(50)
  assert.equal(serveur.posts.length, 1)
  assert.deepEqual(serveur.posts[0].textes, ['Ils mange des pomme.'])
  assert.equal(serveur.posts[0].docId, 'd1')
  assert.ok(listChanges(view.state.doc).length > 0, 'des modifications proposées')
  assert.match(document.querySelector('#ia .ai-status').textContent, /Suggestion ajoutée/)
  panneau.destroy()
})

test('plusieurs paragraphes : une seule demande, les paragraphes vides ne partent pas', async () => {
  const view = monter()
  const serveur = fauxServeur()
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd2', fetcher: serveur.fetcher })
  await panneau.prete
  choisir(view, debut(view, 1) + 2, debut(view, 4) + 3)
  clic(document.querySelector('#ia .btn-preset'))
  await attendre(50)
  assert.equal(serveur.posts.length, 1, 'une sélection est une demande')
  assert.deepEqual(serveur.posts[0].textes.length, 3, 'le paragraphe vide reste chez soi')
  assert.ok(serveur.posts[0].textes.every((t) => t.trim()))
  assert.ok(listChanges(view.state.doc).length >= 2)
  panneau.destroy()
})

test('une sélection plus grosse que la limite par demande ne part pas : on le dit en signes', async () => {
  const view = monter()
  const serveur = fauxServeur({ corrections: { signesParDemande: 30 } })
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd3', fetcher: serveur.fetcher })
  await panneau.prete
  choisir(view, debut(view, 1), debut(view, 4) + 5)
  clic(document.querySelector('#ia .btn-preset'))
  await attendre(30)
  assert.equal(serveur.posts.length, 0)
  const message = document.querySelector('#ia .ai-status').textContent
  assert.match(message, /limite est de 30 signes par demande/)
  assert.ok(document.querySelector('#ia .ai-quota').classList.contains('ai-alerte'))
  assert.ok(!/page/i.test(message))
  panneau.destroy()
})

test('un refus du serveur (plafond mensuel, par exemple) s’affiche tel quel, sans rien modifier', async () => {
  const view = monter()
  const serveur = fauxServeur({
    erreur: {
      status: 429,
      message:
        'Corrections IA : votre limite mensuelle est atteinte (500 000 signes sur 500 000). Elle se renouvelle le 1er novembre.',
    },
  })
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd4', fetcher: serveur.fetcher })
  await panneau.prete
  choisir(view, debut(view, 1), debut(view, 1) + 5)
  clic(document.querySelector('#ia .btn-preset'))
  await attendre(30)
  assert.match(document.querySelector('#ia .ai-status').textContent, /limite mensuelle est atteinte/)
  assert.equal(listChanges(view.state.doc).length, 0)
  panneau.destroy()
})

test('« Tout sélectionner » envoie tous les paragraphes, en une seule demande (et pas seulement le premier)', async () => {
  const view = monter()
  const serveur = fauxServeur()
  const panneau = mountAIPanel(document.getElementById('ia'), () => view, { docId: 'd5', fetcher: serveur.fetcher })
  await panneau.prete
  view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
  clic(document.querySelector('#ia .btn-preset'))
  await attendre(50)
  assert.equal(serveur.posts.length, 1, 'un clic, une demande')
  assert.deepEqual(serveur.posts[0].textes, ['Ils mange des pomme.', 'Elles mange aussi.', 'Fin du texte.'])
  panneau.destroy()
})
