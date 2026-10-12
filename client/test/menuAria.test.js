// aria-expanded suit l'attribut `hidden` de la liste (client/src/menuAria.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

test('aria-expanded suit la liste, ouverte ou fermée par n’importe quel code', async () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>')
  globalThis.MutationObserver = dom.window.MutationObserver
  const { lierMenuAria } = await import('../src/menuAria.js')
  const bouton = dom.window.document.createElement('button')
  const liste = dom.window.document.createElement('div')
  liste.hidden = true
  lierMenuAria(bouton, liste)
  assert.equal(bouton.getAttribute('aria-expanded'), 'false')
  assert.equal(bouton.getAttribute('aria-haspopup'), 'true')
  liste.hidden = false
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(bouton.getAttribute('aria-expanded'), 'true')
  liste.hidden = true
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(bouton.getAttribute('aria-expanded'), 'false')
})
