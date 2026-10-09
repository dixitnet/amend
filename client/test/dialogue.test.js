// La palette de dialogue avec Claude, montée dans un vrai éditeur (jsdom)
// avec un faux serveur (07/10/2026, src/dialogue.js). Ce qui s'y teste : que
// la palette n'existe que si le serveur y autorise, que les numéros de bloc
// cités mènent au bon bloc (celui que le serveur numérote), que le texte de
// Claude ne devient jamais du balisage, que la conversation survit au
// rechargement de l'onglet, et que « Tout rejeter — Claude » demande deux
// clics et ne touche qu'aux modifications de Claude.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction, listChanges } from '../src/trackChanges.js'
import { mountChangesPanel } from '../src/changesPanel.js'
import { monterDialogue, porteeDe, libellePortee, blocsDuDom, pourEnvoi, lireFlux, rendreTexte } from '../src/dialogue.js'

const CLAUDE = { name: 'Claude (pour Sylvain)', color: '#5f7a4a' }
const ALICE = { name: 'Alice', color: '#3d5a80' }

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div class="editor-container"><div id="editeur"></div></div><div id="panneau"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'getComputedStyle', 'DocumentFragment', 'Range', 'MutationObserver', 'Event', 'KeyboardEvent', 'sessionStorage']) {
    globalThis[k] = w[k]
  }
  globalThis.sessionStorage = w.sessionStorage
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  w.Element.prototype.scrollIntoView = () => {}
  return dom
}

const p = (t) => schema.node('paragraph', null, t ? [schema.text(t)] : [])
const h = (n, t) => schema.node('heading', { level: n }, [schema.text(t)])

/** Un document à six blocs et trois titres, dont une table des matières qui
 * n'est pas un bloc numéroté. */
function monterEditeur() {
  installer()
  const doc = schema.node('doc', null, [
    h(1, 'Un'), // 1
    p('Premier paragraphe.'), // 2
    schema.node('table_of_contents', { profondeur: 2 }),
    h(2, 'Deux'), // 3
    p('Deuxième paragraphe.'), // 4
    h(1, 'Trois'), // 5
    p('Dernier paragraphe, avec une faute: ils mange.'), // 6
  ])
  const state = EditorState.create({ doc, plugins: [trackChangesPlugin({ enabled: true }), mountChangesPanel(document.getElementById('panneau'), { canReview: true })] })
  const view = new EditorView(document.getElementById('editeur'), { state })
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => ALICE) })
  return view
}

function ndjson(...evts) {
  return new Response(evts.map((e) => JSON.stringify(e)).join('\n') + '\n', { status: 200, headers: { 'content-type': 'application/x-ndjson' } })
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

function fauxServeur({ autorise = true, reponses = [] } = {}) {
  const appels = []
  const fetcher = async (url, options = {}) => {
    appels.push({ url, methode: options.method || 'GET', corps: options.body ? JSON.parse(options.body) : null })
    if (!options.method) return json({ autorise, portee: 'admins', modele: 'claude-sonnet-5-5' })
    const suivante = reponses.shift()
    return typeof suivante === 'function' ? suivante() : suivante
  }
  return { fetcher, appels }
}

const attendre = (ms = 20) => new Promise((r) => setTimeout(r, ms))
const clic = (e) => e.dispatchEvent(new window.Event('click', { bubbles: true }))

async function envoyer(texte) {
  const saisie = document.querySelector('.dialogue-saisie')
  saisie.value = texte
  clic(document.querySelector('.dialogue-envoyer'))
  for (let i = 0; i < 50 && document.querySelector('.dialogue-arreter:not([hidden])'); i++) await attendre(10)
  await attendre(10)
}

test('les blocs sont ceux du serveur : titres et paragraphes, table des matières exclue', () => {
  const view = monterEditeur()
  const els = blocsDuDom(view)
  assert.deepEqual(els.map((e) => e.textContent), ['Un', 'Premier paragraphe.', 'Deux', 'Deuxième paragraphe.', 'Trois', 'Dernier paragraphe, avec une faute: ils mange.'])
})

test('la portée : document, section en cours (jusqu’au titre de même niveau ou plus haut), sélection', () => {
  const view = monterEditeur()
  const poser = (from, to = from) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  const debutBloc = (n) => view.posAtDOM(blocsDuDom(view)[n - 1], 0)

  assert.deepEqual(porteeDe(view, 'document'), { type: 'document' })
  assert.equal(porteeDe(view, 'selection'), null, 'rien de sélectionné')

  poser(debutBloc(4) + 3) // dans « Deuxième paragraphe » → sous « Deux » (h2)
  assert.deepEqual(porteeDe(view, 'section'), { type: 'section', de: 3, a: 4 })

  poser(debutBloc(2) + 2) // sous « Un » (h1) : jusqu'à « Trois » (h1) exclu
  assert.deepEqual(porteeDe(view, 'section'), { type: 'section', de: 1, a: 4 })

  poser(debutBloc(2) + 1, debutBloc(4) + 4)
  assert.deepEqual(porteeDe(view, 'selection'), { type: 'selection', de: 2, a: 4 })
  assert.equal(libellePortee({ type: 'selection', de: 2, a: 4 }), 'blocs 2 à 4')
  assert.equal(libellePortee({ type: 'selection', de: 5, a: 5 }), 'bloc 5')
  assert.equal(libellePortee({ type: 'document' }), 'tout le document')
})

test('le sélecteur n’a que deux portées, et suit la sélection : du texte sélectionné → « La sélection », sinon « Tout le texte »', async () => {
  const view = monterEditeur()
  const poser = (from, to = from) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  const debutBloc = (n) => view.posAtDOM(blocsDuDom(view)[n - 1], 0)
  const serveur = fauxServeur()
  const d = await monterDialogue({ docId: 'doc-portee', getView: () => view, fetcher: serveur.fetcher })
  const choix = document.querySelector('.dialogue-portee')
  assert.deepEqual([...choix.options].map((o) => [o.value, o.textContent]), [['document', 'Tout le texte'], ['selection', 'La sélection']])

  // Ouverte sur un simple curseur : tout le texte.
  poser(debutBloc(2) + 2)
  d.ouvrir()
  assert.equal(choix.value, 'document')
  d.replier()

  // Ouverte avec du texte sélectionné : la sélection.
  poser(debutBloc(2) + 1, debutBloc(4) + 4)
  d.ouvrir()
  assert.equal(choix.value, 'selection')
  assert.equal(document.querySelector('.dialogue-indication').textContent, 'blocs 2 à 4')

  // Palette ouverte : la portée suit la sélection, dans les deux sens.
  poser(debutBloc(6) + 2)
  document.dispatchEvent(new window.Event('selectionchange'))
  await attendre(5)
  assert.equal(choix.value, 'document')
  poser(debutBloc(6) + 1, debutBloc(6) + 5)
  document.dispatchEvent(new window.Event('selectionchange'))
  await attendre(5)
  assert.equal(choix.value, 'selection')

  // Un choix fait à la main tient tant que la sélection ne bouge pas.
  choix.value = 'document'
  document.dispatchEvent(new window.Event('selectionchange'))
  await attendre(5)
  assert.equal(choix.value, 'document')
  d.destroy()
})

test('sans droit, rien n’est ajouté à la page ; sans réponse du serveur non plus', async () => {
  const view = monterEditeur()
  const non = fauxServeur({ autorise: false })
  assert.equal(await monterDialogue({ docId: 'doc1', getView: () => view, fetcher: non.fetcher }), null)
  assert.equal(document.querySelector('.dialogue-hote'), null)
  const panne = async () => { throw new Error('réseau') }
  assert.equal(await monterDialogue({ docId: 'doc1', getView: () => view, fetcher: panne }), null)
  const erreur = async () => json({ error: 'non' }, 403)
  assert.equal(await monterDialogue({ docId: 'doc1', getView: () => view, fetcher: erreur }), null)
  assert.equal(document.querySelector('.dialogue-hote'), null)
})

test('une question : le flux s’affiche, les [n] mènent au bloc, la conversation est envoyée en entier', async () => {
  const view = monterEditeur()
  const serveur = fauxServeur({
    reponses: [
      ndjson(
        { type: 'outil', nom: 'plan', libelle: 'consulte le plan' },
        { type: 'outil_fin', nom: 'plan', ok: true },
        { type: 'texte', texte: 'La faute est au bloc [6], et le titre [3-4] est correct.\n- premier point\n- **second** point' },
        { type: 'fin', modifications: 0, commentaires: 0, refus: 0, usage: { tours: 2 } }
      ),
      ndjson({ type: 'texte', texte: 'Volontiers.' }, { type: 'fin', modifications: 0, commentaires: 0, refus: 0, usage: {} }),
    ],
  })
  const d = await monterDialogue({ docId: 'doc1', getView: () => view, fetcher: serveur.fetcher })
  assert.ok(d)
  assert.equal(document.querySelector('.dialogue-palette').hidden, true)
  clic(document.querySelector('.dialogue-bouton'))
  assert.equal(document.querySelector('.dialogue-palette').hidden, false)

  await envoyer('Où sont les fautes ?')
  const post = serveur.appels.find((a) => a.methode === 'POST')
  assert.deepEqual(post.corps.messages, [{ role: 'user', content: 'Où sont les fautes ?' }])
  assert.deepEqual(post.corps.portee, { type: 'document' })

  const texte = document.querySelector('.dialogue-claude .dialogue-texte')
  assert.match(texte.textContent, /La faute est au bloc \[6\]/)
  // L'ordre des événements est celui de l'écran : l'outil d'abord, puis le texte.
  const ordre = [...document.querySelectorAll('.dialogue-claude .dialogue-activite > *')].map((e) => e.className.split(' ')[0])
  assert.deepEqual(ordre, ['dialogue-outil', 'dialogue-texte'])
  assert.equal(texte.querySelectorAll('ul li').length, 2)
  assert.equal(texte.querySelector('strong').textContent, 'second')
  const refs = [...texte.querySelectorAll('button.dialogue-bloc')]
  assert.deepEqual(refs.map((b) => b.textContent), ['[6]', '[3-4]'])
  assert.ok(document.querySelector('.dialogue-outil.fait'))

  // Cliquer [6] éclaire le bloc 6 (décoration du survol des modifications).
  clic(refs[0])
  const eclaires = [...view.dom.querySelectorAll('.change-survol')]
  assert.equal(eclaires.length, 1)
  assert.match(eclaires[0].textContent, /Dernier paragraphe/)

  // Le tour suivant renvoie toute la conversation.
  await envoyer('Merci, et la suite ?')
  const seconds = serveur.appels.filter((a) => a.methode === 'POST')[1]
  assert.deepEqual(seconds.corps.messages.map((m) => m.role), ['user', 'assistant', 'user'])
  assert.match(seconds.corps.messages[1].content, /La faute est au bloc \[6\]/)
  d.destroy()
  assert.equal(document.querySelector('.dialogue-hote'), null)
})

test('la conversation survit au rechargement de l’onglet, et « Nouvelle conversation » l’efface', async () => {
  const view = monterEditeur()
  const serveur = fauxServeur({ reponses: [ndjson({ type: 'texte', texte: 'Réponse un.' }, { type: 'fin', modifications: 0, commentaires: 0, refus: 0, usage: {} })] })
  let d = await monterDialogue({ docId: 'doc9', getView: () => view, fetcher: serveur.fetcher })
  await envoyer('Bonjour')
  d.destroy()

  d = await monterDialogue({ docId: 'doc9', getView: () => view, fetcher: serveur.fetcher })
  assert.deepEqual(d.messages().map((m) => m.role), ['user', 'assistant'])
  assert.match(document.querySelector('.dialogue-claude').textContent, /Réponse un/)
  // Un autre document n'hérite de rien.
  const autre = await monterDialogue({ docId: 'autre', getView: () => view, fetcher: serveur.fetcher })
  assert.equal(autre.messages().length, 0)
  autre.destroy()

  clic(document.querySelector('.dialogue-entete .dialogue-lien'))
  assert.equal(d.messages().length, 0)
  assert.ok(document.querySelector('.dialogue-vide'))
  d.destroy()
  const apres = await monterDialogue({ docId: 'doc9', getView: () => view, fetcher: serveur.fetcher })
  assert.equal(apres.messages().length, 0)
  apres.destroy()
})

test('le texte de Claude n’est jamais du balisage', () => {
  installer()
  const c = document.createElement('div')
  rendreTexte(c, 'Voir <img src=x onerror="window.pwned=1"> et <b>gras</b> [2]\n<script>window.pwned=2</script>', () => {})
  assert.equal(c.querySelector('img'), null)
  assert.equal(c.querySelector('script'), null)
  assert.equal(c.querySelector('b'), null)
  assert.match(c.textContent, /<img src=x/)
  assert.equal(c.querySelectorAll('button.dialogue-bloc').length, 1)
})

test('une erreur du serveur s’affiche, ne casse pas l’alternance, et la saisie reste utilisable', async () => {
  const view = monterEditeur()
  const serveur = fauxServeur({
    reponses: [
      json({ error: 'Limite atteinte : 30 messages par heure.' }, 429),
      ndjson({ type: 'texte', texte: 'Ça marche.' }, { type: 'fin', modifications: 0, commentaires: 0, refus: 0, usage: {} }),
    ],
  })
  const d = await monterDialogue({ docId: 'doc2', getView: () => view, fetcher: serveur.fetcher })
  await envoyer('Premier essai')
  assert.match(document.querySelector('.dialogue-erreur').textContent, /Limite atteinte/)
  assert.equal(document.querySelector('.dialogue-envoyer').disabled, false)
  // Le message resté sans réponse est fusionné avec le suivant : alternance préservée.
  await envoyer('Deuxième essai')
  const post = serveur.appels.filter((a) => a.methode === 'POST')[1]
  assert.deepEqual(post.corps.messages, [{ role: 'user', content: 'Premier essai\n\nDeuxième essai' }])
  d.destroy()
})

test('« Tout rejeter — Claude » demande deux clics et ne touche pas aux modifications des personnes', async () => {
  const view = monterEditeur()
  // Une correction de Claude (au bloc 6) et une d'Alice (au bloc 2).
  const sur = (n) => view.posAtDOM(blocsDuDom(view)[n - 1], 0)
  const editerComme = (user, pos, texte) => {
    view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => user) })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
    view.dispatch(view.state.tr.insertText(texte, pos))
  }
  editerComme(CLAUDE, sur(6) + 41, 'nt') // « ils mange » → « ils mangent »
  editerComme(ALICE, sur(2) + 5, 'X')
  assert.equal(listChanges(view.state.doc).length, 2)

  const serveur = fauxServeur({ reponses: [ndjson({ type: 'texte', texte: 'Fait [6].' }, { type: 'fin', modifications: 1, commentaires: 0, refus: 0, usage: {} })] })
  const d = await monterDialogue({ docId: 'doc3', getView: () => view, fetcher: serveur.fetcher })
  await envoyer('Corrige le bloc 6')
  assert.match(document.querySelector('.dialogue-resume').textContent, /1 modification proposée/)
  const bouton = document.querySelector('.dialogue-rejeter')
  clic(bouton)
  assert.match(bouton.textContent, /Confirmer/)
  assert.equal(listChanges(view.state.doc).length, 2, 'un seul clic ne rejette rien')
  clic(bouton)
  const restantes = listChanges(view.state.doc)
  assert.equal(restantes.length, 1)
  assert.equal(restantes[0].user, 'Alice')
  d.destroy()
})

test('pourEnvoi : alternance stricte, messages vides écartés, longueur bornée', () => {
  assert.deepEqual(pourEnvoi([{ role: 'user', content: 'a' }, { role: 'assistant', content: '' }, { role: 'user', content: 'b' }]), [{ role: 'user', content: 'a\n\nb' }])
  assert.equal(pourEnvoi([{ role: 'assistant', content: 'x'.repeat(9000) }])[0].content.length, 8000)
})

test('lireFlux : lignes coupées en deux morceaux, lignes illisibles ignorées', async () => {
  const morceaux = ['{"type":"tex', 'te","texte":"a"}\nnon-json\n{"type":"fin"}', '\n']
  const flux = new ReadableStream({
    start(c) {
      for (const m of morceaux) c.enqueue(new TextEncoder().encode(m))
      c.close()
    },
  })
  const recus = []
  await lireFlux({ body: flux }, (e) => recus.push(e))
  assert.deepEqual(recus, [{ type: 'texte', texte: 'a' }, { type: 'fin' }])
})
