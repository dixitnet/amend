// La feuille basse et le plan qu'elle porte.
//
// Les règles vérifiées ici ne sont pas cosmétiques : ce sont celles dont
// l'absence rend une feuille impraticable au doigt (NN/g) — une croix
// explicite, Échap et le bouton retour qui ferment, et surtout jamais deux
// feuilles empilées, faute de quoi on ne sait plus laquelle on ferme.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

let dom
function installerDom() {
  dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  globalThis.history = w.history
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Node', 'Element', 'MutationObserver', 'Event', 'KeyboardEvent']) globalThis[k] = w[k]
  // jsdom ne connaît pas matchMedia.
  w.matchMedia = (requete) => ({ matches: /max-width: (700|1100)px/.test(requete), media: requete, addEventListener() {}, removeEventListener() {} })
  globalThis.matchMedia = w.matchMedia
  w.Element.prototype.scrollIntoView = function () {}
  return w
}

const { ouvrirFeuille, fermerFeuille, petitEcran } = await import('../src/feuille.js')
const { ouvrirPlan } = await import('../src/planFeuille.js')

const feuilles = () => document.querySelectorAll('.feuille')
const toucheEchap = () =>
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

test('une feuille s’ouvre avec une croix, un titre et un corps à remplir', () => {
  installerDom()
  const f = ouvrirFeuille('Plan du document')
  assert.equal(feuilles().length, 1)
  assert.ok(document.querySelector('.feuille-fermer'), 'une croix explicite, pas seulement une poignée')
  assert.match(document.querySelector('.feuille-entete h2').textContent, /Plan/)
  assert.equal(document.querySelector('.feuille').getAttribute('role'), 'dialog')
  f.corps.textContent = 'du contenu'
  assert.match(document.querySelector('.feuille-corps').textContent, /du contenu/)
  f.fermer()
})

test('la croix ferme', () => {
  installerDom()
  ouvrirFeuille('Titre')
  document.querySelector('.feuille-fermer').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(feuilles().length, 0)
})

test('Échap ferme', () => {
  installerDom()
  const f = ouvrirFeuille('Titre')
  toucheEchap()
  assert.equal(feuilles().length, 0)
  assert.equal(f.estOuverte(), false)
})

test('le bouton retour du téléphone ferme, et ne quitte pas le document', () => {
  const w = installerDom()
  const avant = w.history.length
  ouvrirFeuille('Titre')
  assert.ok(w.history.length >= avant, 'une entrée est poussée pour que « retour » nous revienne')
  w.dispatchEvent(new w.Event('popstate'))
  assert.equal(feuilles().length, 0)
})

test('jamais deux feuilles empilées', () => {
  // La règle la plus importante : avec deux feuilles à l'écran, on ne sait
  // plus laquelle un geste de fermeture va emporter.
  installerDom()
  const premiere = ouvrirFeuille('Plan')
  ouvrirFeuille('Commentaire')
  assert.equal(feuilles().length, 1, 'la seconde chasse la première')
  assert.equal(premiere.estOuverte(), false)
  assert.match(document.querySelector('.feuille-entete h2').textContent, /Commentaire/)
  fermerFeuille()
  assert.equal(feuilles().length, 0)
})

test('la fermeture est annoncée, quelle qu’en soit la cause', () => {
  installerDom()
  let fermetures = 0
  ouvrirFeuille('Une', { surFermeture: () => fermetures++ })
  // Chassée par une autre feuille : la première doit être prévenue, sans
  // quoi ce qu'elle avait emprunté (le plan) ne serait jamais rendu.
  ouvrirFeuille('Deux')
  assert.equal(fermetures, 1)
  fermerFeuille()
})

test('une feuille modale pose un voile, une feuille ordinaire non', () => {
  installerDom()
  ouvrirFeuille('Ordinaire')
  assert.equal(document.querySelectorAll('.feuille-voile').length, 0)
  ouvrirFeuille('Décision', { modale: true })
  assert.equal(document.querySelectorAll('.feuille-voile').length, 1)
  fermerFeuille()
  assert.equal(document.querySelectorAll('.feuille-voile').length, 0, 'le voile s’en va avec elle')
})

// ===================================================== le plan

/** Un plan comme le greffon le construit (voir outline.js). */
function colonnePlan(titres) {
  const colonne = document.createElement('div')
  colonne.className = 'outline-sidebar'
  const liste = document.createElement('ul')
  liste.className = 'outline-list'
  titres.forEach((texte, i) => {
    const li = document.createElement('li')
    li.className = 'outline-item outline-level-1'
    if (i === 1) li.classList.add('outline-courante')
    const a = document.createElement('button')
    a.className = 'outline-link'
    a.textContent = texte
    li.appendChild(a)
    liste.appendChild(li)
  })
  colonne.appendChild(liste)
  return colonne
}

test('le plan est déménagé dans la feuille, puis rendu à sa place exacte', () => {
  // On ne redessine pas le plan, on le transplante : c'est ce qui évite
  // d'avoir deux plans à faire évoluer ensemble. Encore faut-il qu'il
  // revienne au bon endroit — l'ordre des colonnes compte en grand écran.
  installerDom()
  const layout = document.createElement('div')
  const colonne = colonnePlan(['Le constat', 'Les chiffres', 'Les propositions'])
  const apres = document.createElement('div')
  apres.className = 'editor-main'
  layout.append(colonne, apres)
  document.body.appendChild(layout)

  const f = ouvrirPlan(colonne)
  assert.equal(colonne.parentNode.className, 'feuille-corps', 'le plan est dans la feuille')
  assert.ok(colonne.classList.contains('outline-dans-feuille'))

  f.fermer()
  assert.equal(colonne.parentNode, layout)
  assert.equal(layout.firstChild, colonne, 'remis avant .editor-main, pas à la fin')
  assert.ok(!colonne.classList.contains('outline-dans-feuille'))
})

test('toucher un titre ferme la feuille', () => {
  installerDom()
  const layout = document.createElement('div')
  const colonne = colonnePlan(['Un', 'Deux'])
  layout.appendChild(colonne)
  document.body.appendChild(layout)

  ouvrirPlan(colonne)
  colonne.querySelector('.outline-link').dispatchEvent(new window.Event('click', { bubbles: true }))
  assert.equal(feuilles().length, 0, 'on ouvre le plan pour aller quelque part')
  assert.equal(colonne.parentNode, layout, 'et le plan est rendu')
})

test('le filtre n’apparaît que dans un document long, et filtre vraiment', () => {
  installerDom()
  const court = colonnePlan(['Un', 'Deux', 'Trois'])
  document.body.appendChild(court)
  ouvrirPlan(court)
  assert.equal(document.querySelectorAll('.feuille-filtre').length, 0, 'inutile sur trois titres')
  fermerFeuille()

  const titres = Array.from({ length: 25 }, (_, i) => (i === 7 ? 'Les propositions' : `Section ${i}`))
  const long = colonnePlan(titres)
  document.body.appendChild(long)
  ouvrirPlan(long)
  const filtre = document.querySelector('.feuille-filtre')
  assert.ok(filtre, 'au-delà de vingt titres, chercher bat le défilement')

  filtre.value = 'proposi'
  filtre.dispatchEvent(new window.Event('input', { bubbles: true }))
  const visibles = [...long.querySelectorAll('.outline-list > li')].filter((li) => !li.hidden)
  assert.equal(visibles.length, 1)
  assert.match(visibles[0].textContent, /Les propositions/)

  filtre.value = 'zzz'
  filtre.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal([...long.querySelectorAll('.outline-list > li')].filter((li) => !li.hidden).length, 0)
  assert.equal(document.querySelector('.feuille-vide').hidden, false, 'et on le dit')

  filtre.value = ''
  filtre.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal([...long.querySelectorAll('.outline-list > li')].filter((li) => !li.hidden).length, 25)
  fermerFeuille()
})

test('petitEcran suit la requête média, il n’est pas deviné', () => {
  installerDom()
  assert.equal(petitEcran(), true)
  window.matchMedia = () => ({ matches: false })
  globalThis.matchMedia = window.matchMedia
  assert.equal(petitEcran(), false)
})
