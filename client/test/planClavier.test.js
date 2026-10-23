// Le plan au clavier (21/10/2026) : un seul arrêt de tabulation dans la
// liste, les flèches la parcourent (outline.js, `tabulationItinerante`).
// Avant : un arrêt par titre, jusqu'à une cinquantaine avant le texte.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
const { tabulationItinerante } = await import('../src/outline.js')

function liste(n = 5) {
  document.body.innerHTML = ''
  const ul = document.createElement('ul')
  ul.className = 'outline-list'
  for (let i = 0; i < n; i++) {
    const li = document.createElement('li')
    const b = document.createElement('button')
    b.className = 'outline-link'
    b.textContent = `Titre ${i}`
    li.appendChild(b)
    ul.appendChild(li)
  }
  document.body.appendChild(ul)
  return ul
}
const arret = (ul) => [...ul.querySelectorAll('.outline-link')].map((b) => b.tabIndex)
const touche = (cible, key) => {
  const e = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  cible.dispatchEvent(e)
  return e
}

test('un seul bouton est dans l’ordre de tabulation, le courant', () => {
  const ul = liste()
  tabulationItinerante(ul, 2)
  assert.deepEqual(arret(ul), [-1, -1, 0, -1, -1])
})

test('les flèches, Début et Fin parcourent la liste et déplacent l’arrêt', () => {
  const ul = liste()
  tabulationItinerante(ul, 0)
  const b = [...ul.querySelectorAll('.outline-link')]
  b[0].focus()
  const e = touche(b[0], 'ArrowDown')
  assert.ok(e.defaultPrevented)
  assert.equal(document.activeElement, b[1])
  assert.deepEqual(arret(ul), [-1, 0, -1, -1, -1])
  touche(b[1], 'End')
  assert.equal(document.activeElement, b[4])
  touche(b[4], 'ArrowDown')
  assert.equal(document.activeElement, b[4], 'ne dépasse pas la fin')
  touche(b[4], 'Home')
  assert.equal(document.activeElement, b[0])
  touche(b[0], 'ArrowUp')
  assert.equal(document.activeElement, b[0], 'ne dépasse pas le début')
})

test('les autres touches (Tab, lettres) ne sont pas interceptées', () => {
  const ul = liste()
  tabulationItinerante(ul, 0)
  const b = ul.querySelector('.outline-link')
  b.focus()
  assert.ok(!touche(b, 'Tab').defaultPrevented)
  assert.ok(!touche(b, 'a').defaultPrevented)
})

test('suivre déplace l’arrêt sauf quand le focus est dans la liste', () => {
  const ul = liste()
  const t = tabulationItinerante(ul, 0)
  t.suivre(3)
  assert.deepEqual(arret(ul), [-1, -1, -1, 0, -1])
  ul.querySelectorAll('.outline-link')[1].focus()
  t.suivre(4)
  assert.deepEqual(arret(ul), [-1, -1, -1, 0, -1], 'on ne retire pas l’arrêt sous les doigts')
})

test('les titres filtrés (cachés) sont sautés', () => {
  const ul = liste()
  tabulationItinerante(ul, 0)
  ul.children[1].hidden = true
  const b = [...ul.querySelectorAll('.outline-link')]
  b[0].focus()
  touche(b[0], 'ArrowDown')
  assert.equal(document.activeElement, b[2])
})

test('une liste vide ne plante pas', () => {
  const ul = liste(0)
  const t = tabulationItinerante(ul, 0)
  t.suivre(0)
})
