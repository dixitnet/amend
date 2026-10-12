// Le comportement commun des modales (client/src/modale.js, 11/10/2026) :
// rôle de dialogue, Échap, piège de focus, focus rendu, clic sur le fond.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

function monter() {
  const dom = new JSDOM('<!DOCTYPE html><body><button id="ouvreur">Ouvrir</button></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  globalThis.document = dom.window.document
  globalThis.window = dom.window
  return dom
}

async function charger() {
  return (await import('../src/modale.js?' + Math.random())).equiperModale
}

function overlay(document, html = '<h2>Partager</h2><input id="a" /><button id="b">OK</button><button id="c">Fermer</button>') {
  const o = document.createElement('div')
  o.className = 'name-modal-overlay'
  o.innerHTML = `<div class="name-modal">${html}</div>`
  document.body.appendChild(o)
  return o
}

const touche = (dom, key, opts = {}) => {
  const e = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
  dom.window.document.activeElement.dispatchEvent(e)
  return e
}

test('la modale est annoncée comme un dialogue, nommée par son titre, et prend le focus', async () => {
  const dom = monter()
  const equiper = await charger()
  const o = overlay(dom.window.document)
  equiper(o)
  const boite = o.querySelector('.name-modal')
  assert.equal(boite.getAttribute('role'), 'dialog')
  assert.equal(boite.getAttribute('aria-modal'), 'true')
  const titre = dom.window.document.getElementById(boite.getAttribute('aria-labelledby'))
  assert.equal(titre.textContent, 'Partager')
  assert.equal(dom.window.document.activeElement.id, 'a', 'le premier élément focalisable prend le focus')
})

test('Échap ferme la modale et rend le focus à ce qui l’a ouverte', async () => {
  const dom = monter()
  const equiper = await charger()
  const ouvreur = dom.window.document.getElementById('ouvreur')
  ouvreur.focus()
  let ferme = 0
  const o = overlay(dom.window.document)
  equiper(o, { surFermeture: () => ferme++ })
  touche(dom, 'Escape')
  assert.equal(o.isConnected, false)
  assert.equal(dom.window.document.activeElement, ouvreur)
  assert.equal(ferme, 1)
})

test('une saisie obligatoire (echap: false) ne se ferme pas à Échap', async () => {
  const dom = monter()
  const equiper = await charger()
  const o = overlay(dom.window.document)
  equiper(o, { echap: false })
  touche(dom, 'Escape')
  assert.equal(o.isConnected, true)
})

test('Tab boucle dans la modale, dans les deux sens', async () => {
  const dom = monter()
  const equiper = await charger()
  const o = overlay(dom.window.document)
  equiper(o)
  const d = dom.window.document
  d.getElementById('c').focus()
  assert.equal(touche(dom, 'Tab').defaultPrevented, true)
  assert.equal(d.activeElement.id, 'a', 'après le dernier, retour au premier')
  assert.equal(touche(dom, 'Tab', { shiftKey: true }).defaultPrevented, true)
  assert.equal(d.activeElement.id, 'c', 'avant le premier, retour au dernier')
  d.getElementById('b').focus()
  assert.equal(touche(dom, 'Tab').defaultPrevented, false, 'au milieu, le navigateur fait son travail')
})

test('un clic sur le fond ferme, un clic dans la boîte non ; fermer deux fois est sans effet', async () => {
  const dom = monter()
  const equiper = await charger()
  let ferme = 0
  const o = overlay(dom.window.document)
  const fermer = equiper(o, { surFermeture: () => ferme++ })
  o.querySelector('.name-modal').dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
  assert.equal(o.isConnected, true)
  o.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
  assert.equal(o.isConnected, false)
  fermer()
  assert.equal(ferme, 1)
})

test('deux modales empilées : Échap ne ferme que celle du dessus', async () => {
  const dom = monter()
  const equiper = await charger()
  const dessous = overlay(dom.window.document)
  equiper(dessous)
  const dessus = overlay(dom.window.document, '<h2>Dessus</h2><button id="z">z</button>')
  equiper(dessus)
  touche(dom, 'Escape')
  assert.equal(dessus.isConnected, false)
  assert.equal(dessous.isConnected, true)
})
