// Claude invité sur le document, dans la barre « qui est là »
// (30/09/2026, src/presence.js) : la même awareness que pour les
// personnes, avec une marque « agent » posée par le serveur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { mountPresenceBar } from '../src/presence.js'

function monter() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="barre"></div></body>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const awareness = new Awareness(new Y.Doc())
  // L'awareness renouvelle son état dans un intervalle : il ne doit pas
  // retenir le processus de test.
  if (awareness._checkInterval && awareness._checkInterval.unref) awareness._checkInterval.unref()
  awareness.setLocalStateField('user', { name: 'Sylvain Grisot', color: '#3d5a80' })
  const barre = document.getElementById('barre')
  mountPresenceBar(barre, { awareness }, {})
  return { awareness, barre }
}

/** Un état distant, comme celui que le serveur relaie. */
function poser(awareness, clientId, etat) {
  awareness.states.set(clientId, etat)
  awareness.emit('change', [{ added: [clientId], updated: [], removed: [] }, 'test'])
}

test('Claude apparaît comme une pastille à part, « CL », avec son nom en titre', () => {
  const { awareness, barre } = monter()
  poser(awareness, 4242, { user: { name: 'Claude (pour Sylvain)', color: '#5f7a4a' }, agent: true })
  const pastilles = [...barre.querySelectorAll('.presence-avatar')]
  assert.equal(pastilles.length, 2)
  const claude = pastilles.find((p) => p.classList.contains('presence-agent'))
  assert.ok(claude)
  assert.equal(claude.textContent, 'CL', 'les initiales ignorent la parenthèse')
  assert.equal(claude.title, 'Aller au curseur de Claude (pour Sylvain)')
  assert.equal(claude.style.getPropertyValue('--user-color'), '#5f7a4a')
  // Les personnes n'ont pas la marque.
  assert.ok(!pastilles.find((p) => p.textContent === 'SG').classList.contains('presence-agent'))
})

test('sans son état, la pastille de Claude disparaît', () => {
  const { awareness, barre } = monter()
  poser(awareness, 4242, { user: { name: 'Claude (pour Sylvain)', color: '#5f7a4a' }, agent: true })
  awareness.states.delete(4242)
  awareness.emit('change', [{ added: [], updated: [], removed: [4242] }, 'test'])
  assert.equal(barre.querySelectorAll('.presence-agent').length, 0)
})

test('une personne qui s’appelle Claude n’est pas prise pour l’agent', () => {
  const { awareness, barre } = monter()
  poser(awareness, 77, { user: { name: 'Claude Martin', color: '#a05a2c' } })
  assert.equal(barre.querySelectorAll('.presence-agent').length, 0)
  assert.equal([...barre.querySelectorAll('.presence-avatar')].some((p) => p.textContent === 'CM'), true)
})
