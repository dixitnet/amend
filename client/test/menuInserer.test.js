// Le menu « Insérer ▾ » en format M vertical (24/10/2026) : la barre d'édition
// défile en travers et forme un conteneur, elle rogne une liste posée dedans.
// La liste passe dans la couche supérieure du navigateur (popover) quand elle
// existe ; sinon elle reste comme avant. jsdom n'a pas d'API popover : on la
// remplace par une doublure qui note ce qu'on lui demande.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

function preparer({ avecPopover }) {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  globalThis.HTMLElement = window.HTMLElement
  globalThis.MutationObserver = window.MutationObserver
  const ouverte = new WeakSet()
  if (avecPopover) {
    window.HTMLElement.prototype.showPopover = function () {
      ouverte.add(this)
    }
    window.HTMLElement.prototype.hidePopover = function () {
      ouverte.delete(this)
    }
    const matchesOrigine = window.Element.prototype.matches
    window.Element.prototype.matches = function (s) {
      return s === ':popover-open' ? ouverte.has(this) : matchesOrigine.call(this, s)
    }
  }
  return { window, ouverte }
}

async function barre() {
  const { creerBarreOutils } = await import(`../src/barreOutils.js?${Math.random()}`)
  const menus = []
  const menuDeroulant = (libelle, { classe = '' } = {}) => {
    const el = document.createElement('div')
    el.className = `menu-flottant ${classe}`
    const bouton = document.createElement('button')
    bouton.className = 'menu-flottant-bouton'
    const liste = document.createElement('div')
    liste.className = 'menu-flottant-liste menu-flottant-droite'
    liste.hidden = true
    el.append(bouton, liste)
    const ref = { el, liste, fermer: () => (liste.hidden = true), surOuverture: null }
    menus.push(ref)
    return ref
  }
  const b = creerBarreOutils({ cap: { canEditFreely: true }, menuDeroulant })
  return { b, menu: menus.find((m) => m.el.classList.contains('menu-insertion')) }
}

test('avec l’API popover : la liste passe dans la couche supérieure, sous son bouton', async () => {
  const { ouverte } = preparer({ avecPopover: true })
  const { menu } = await barre()
  assert.equal(menu.liste.getAttribute('popover'), 'manual')
  menu.el.querySelector('.menu-flottant-bouton').getBoundingClientRect = () => ({ left: 300.4, bottom: 90.2 })
  menu.liste.hidden = false
  menu.surOuverture()
  assert.ok(ouverte.has(menu.liste))
  assert.equal(menu.liste.style.top, '94px')
  assert.equal(menu.liste.style.left, '300px')
  // Refermée : la couche supérieure se libère.
  menu.fermer()
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(!ouverte.has(menu.liste))
})

test('sans l’API popover : la liste reste ce qu’elle était', async () => {
  preparer({ avecPopover: false })
  const { menu } = await barre()
  assert.equal(menu.liste.getAttribute('popover'), null)
  assert.equal(menu.surOuverture, null)
})
