// Le volet « Fichiers » de l'éditeur (07/11/2026, panneauFichiers.js) monté
// dans jsdom, contre un faux serveur : rien n'est chargé avant d'être montré,
// le document ouvert est surligné et ses dossiers dépliés, les dossiers se
// replient et le restent, le filtre donne une liste plate (Entrée ouvre le
// premier, Échap vide), un « + » crée un document dans son dossier.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://amend.test/#/doc/d3' })
const w = dom.window
globalThis.window = w
globalThis.document = w.document
globalThis.localStorage = w.localStorage
globalThis.sessionStorage = w.sessionStorage
globalThis.Element = w.Element
Object.defineProperty(globalThis, 'location', { configurable: true, get: () => w.location })

const { monterPanneauFichiers, suiteFichiers, titreASaisir } = await import('../src/panneauFichiers.js')

const attendre = (ms = 15) => new Promise((r) => setTimeout(r, ms))
const rep = (corps, status = 200) => ({ ok: status < 400, status, json: async () => corps })
const doc = (id, title, extra = {}) => ({
  id,
  title,
  updatedAt: 1000,
  createdAt: 1000,
  starred: false,
  dossier: null,
  ...extra,
})

function fauxServeur() {
  const s = {
    appels: [],
    dossiers: [
      { id: 'a', nom: 'Thèse', parent: null },
      { id: 'b', nom: 'Chapitres', parent: 'a' },
      { id: 'z', nom: 'Archives', parent: null },
    ],
    docs: [
      doc('d1', 'Introduction', { dossier: 'a' }),
      doc('d3', 'Chapitre un', { dossier: 'b' }),
      doc('d4', 'Été à Nantes', { starred: true }),
      doc('d5', 'Ancien', { dossier: 'z' }),
    ],
  }
  s.fetch = async (chemin, opts = {}) => {
    const methode = opts.method || 'GET'
    const corps = opts.body ? JSON.parse(opts.body) : null
    s.appels.push({ chemin, methode, corps })
    if (chemin === '/api/docs' && methode === 'GET') return rep({ docs: JSON.parse(JSON.stringify(s.docs)) })
    if (chemin === '/api/rangement') return rep({ dossiers: s.dossiers, placement: {}, favoris: [] })
    if (chemin === '/api/docs' && methode === 'POST') {
      if (corps.dossier && !s.dossiers.some((d) => d.id === corps.dossier))
        return rep({ error: 'dossier introuvable' }, 404)
      return rep({ id: 'neuf', title: '', dossier: corps.dossier || null }, 201)
    }
    return rep({ error: 'inconnu' }, 404)
  }
  globalThis.fetch = s.fetch
  return s
}

function monter(opts = {}) {
  const panneau = document.createElement('div')
  document.body.replaceChildren(panneau)
  const p = monterPanneauFichiers(panneau, { docId: 'd3', ...opts })
  const textes = (sel) => [...panneau.querySelectorAll(sel)].map((e) => e.textContent)
  return { panneau, p, textes }
}

const arbre = '.fichiers-arbre'

test('rien n’est demandé au serveur avant que l’onglet soit montré', async () => {
  localStorage.clear()
  const s = fauxServeur()
  monter()
  await attendre()
  assert.equal(s.appels.length, 0)
})

test('montré : favoris, puis l’arbre déplié jusqu’au document ouvert, surligné et non cliquable', async () => {
  localStorage.clear()
  fauxServeur()
  const { panneau, p, textes } = monter()
  await p.afficher()
  assert.deepEqual(textes('.fichiers-favoris .fichiers-doc'), ['Été à Nantes'])
  assert.deepEqual(textes(`${arbre} > li > .fichiers-ligne .fichiers-dossier-nom`), ['Archives', 'Thèse'])
  assert.deepEqual(textes(`${arbre} > li > .fichiers-doc`), ['Été à Nantes'], 'à la racine, après les dossiers')
  const courant = panneau.querySelector('.fichiers-doc.courant')
  assert.equal(courant.textContent, 'Chapitre un')
  assert.equal(courant.tagName, 'SPAN')
  assert.equal(courant.getAttribute('aria-current'), 'page')
  assert.equal(textes('.fichiers-doc').includes('Ancien'), false, '« Archives » reste replié')
  assert.deepEqual(JSON.parse(localStorage.getItem('amend.fichiers.deplies')).sort(), ['a', 'b'])
  const lien = [...panneau.querySelectorAll('a.fichiers-doc')].find((a) => a.textContent === 'Introduction')
  assert.equal(lien.getAttribute('href'), '#/doc/d1', 'un vrai lien : Cmd-clic ouvre un onglet')
})

test('déplier et replier un dossier ; l’état est retenu par appareil', async () => {
  localStorage.clear()
  fauxServeur()
  const a = monter()
  await a.p.afficher()
  const archives = () =>
    [...a.panneau.querySelectorAll('.fichiers-dossier')].find((b) => b.textContent.includes('Archives'))
  assert.equal(archives().getAttribute('aria-expanded'), 'false')
  archives().click()
  assert.equal(archives().getAttribute('aria-expanded'), 'true')
  assert.ok(a.textes('.fichiers-doc').includes('Ancien'))
  const b = monter()
  await b.p.afficher()
  assert.ok(b.textes('.fichiers-doc').includes('Ancien'), 'retrouvé déplié')
})

test('le filtre : liste plate avec l’emplacement, sans accents ; Entrée ouvre le premier ; Échap vide', async () => {
  localStorage.clear()
  sessionStorage.clear()
  fauxServeur()
  const { panneau, p, textes } = monter()
  await p.afficher()
  const filtre = panneau.querySelector('.fichiers-filtre')
  filtre.value = 'ete'
  filtre.dispatchEvent(new w.Event('input'))
  assert.deepEqual(textes('.fichiers-resultats .fichiers-doc'), ['Été à Nantes'])
  assert.equal(panneau.querySelector(arbre), null, 'l’arbre laisse la place')
  filtre.value = 'intro'
  filtre.dispatchEvent(new w.Event('input'))
  assert.deepEqual(textes('.fichiers-emplacement'), ['Thèse'])
  filtre.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await attendre()
  assert.equal(location.hash, '#/doc/d1')
  assert.equal(suiteFichiers(), true, 'le document suivant rouvrira « Fichiers »')
  assert.equal(suiteFichiers(), false, 'une seule fois')
  filtre.value = 'xyz'
  filtre.dispatchEvent(new w.Event('input'))
  assert.equal(panneau.querySelector('.fichiers-vide').textContent, 'Aucun document ne correspond.')
  const echap = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  filtre.dispatchEvent(echap)
  assert.equal(echap.defaultPrevented, true, 'Échap ne ferme pas le tiroir en même temps')
  assert.equal(filtre.value, '')
  assert.ok(panneau.querySelector(arbre))
})

test('un clic annulé (garde-fou) ou avec Cmd ne laisse pas de mot pour le document suivant', async () => {
  localStorage.clear()
  sessionStorage.clear()
  fauxServeur()
  const { panneau, p } = monter()
  await p.afficher()
  const lien = panneau.querySelector('a.fichiers-doc')
  lien.addEventListener('click', (e) => e.preventDefault())
  lien.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))
  assert.equal(suiteFichiers(), false)
  const annule = new w.MouseEvent('click', { bubbles: true, cancelable: true })
  panneau.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true })
  lien.dispatchEvent(annule)
  assert.equal(suiteFichiers(), false)
})

test('le titre du document ouvert suit la saisie du bandeau', async () => {
  localStorage.clear()
  fauxServeur()
  const { panneau, p } = monter()
  await p.afficher()
  p.majTitre('Chapitre premier')
  assert.equal(panneau.querySelector('.fichiers-doc.courant').textContent, 'Chapitre premier')
  p.majTitre('')
  assert.equal(panneau.querySelector('.fichiers-doc.courant').textContent, 'Sans titre')
})

test('« + » d’un dossier : crée le document dedans, l’ouvre, et le titre sera à saisir', async () => {
  localStorage.clear()
  sessionStorage.clear()
  const s = fauxServeur()
  const { panneau, p } = monter()
  await p.afficher()
  const plus = panneau.querySelector('.fichiers-ligne-dossier .fichiers-nouveau[aria-label*="Chapitres"]')
  plus.click()
  await attendre()
  assert.deepEqual(s.appels.at(-1), { chemin: '/api/docs', methode: 'POST', corps: { title: '', dossier: 'b' } })
  assert.equal(location.hash, '#/doc/neuf')
  assert.equal(titreASaisir('autre'), false)
  assert.equal(titreASaisir('neuf'), true)
  assert.equal(suiteFichiers(), true)

  panneau.querySelector('.fichiers-tete .fichiers-nouveau').click()
  await attendre()
  assert.deepEqual(s.appels.at(-1).corps, { title: '' }, 'celui de la tête crée hors dossier')
})

test('« + » refusé par le garde-fou ou par le serveur : rien ne part, ou on le dit', async () => {
  localStorage.clear()
  const s = fauxServeur()
  const a = monter({ peutQuitter: () => false })
  await a.p.afficher()
  const n = s.appels.length
  a.panneau.querySelector('.fichiers-tete .fichiers-nouveau').click()
  await attendre()
  assert.equal(s.appels.length, n)

  const b = monter()
  await b.p.afficher()
  s.dossiers = s.dossiers.filter((d) => d.id !== 'z') // supprimé ailleurs entre-temps
  b.panneau.querySelector('.fichiers-nouveau[aria-label*="Archives"]').click()
  await attendre(30)
  assert.equal(b.panneau.querySelector('.fichiers-message').textContent, 'dossier introuvable')
  assert.equal(b.textes('.fichiers-dossier-nom').includes('Archives'), false, 'la liste est rechargée')
})

test('un titre saisi avant l’arrivée de la liste n’est pas écrasé par elle', async () => {
  localStorage.clear()
  fauxServeur()
  const { panneau, p } = monter()
  const chargement = p.afficher()
  p.majTitre('Tapé tout de suite')
  await chargement
  assert.equal(panneau.querySelector('.fichiers-doc.courant').textContent, 'Tapé tout de suite')
})
