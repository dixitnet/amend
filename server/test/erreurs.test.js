// ErreurHttp (server/erreurs.js) et les erreurs de module qui en descendent.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ErreurHttp } from '../erreurs.js'
import { AIRequestError } from '../ai.js'
import { TypstError } from '../typst.js'
import { DialogueErreur } from '../dialogue.js'

test('ErreurHttp porte son code et son message', () => {
  const e = new ErreurHttp(413, 'trop gros')
  assert.equal(e.status, 413)
  assert.equal(e.message, 'trop gros')
  assert.equal(e.name, 'ErreurHttp')
  assert.ok(e instanceof Error)
})

test('les erreurs de module gardent leur signature et se reconnaissent comme ErreurHttp', () => {
  const ia = new AIRequestError('refus', 502)
  assert.deepEqual([ia.status, ia.message, ia.name], [502, 'refus', 'AIRequestError'])
  const typst = new TypstError('composition impossible')
  assert.deepEqual([typst.status, typst.message], [500, 'composition impossible'])
  assert.equal(new TypstError('occupé', 503).status, 503)
  const dialogue = new DialogueErreur(429, 'trop de messages')
  assert.deepEqual([dialogue.status, dialogue.message], [429, 'trop de messages'])
  for (const e of [ia, typst, dialogue]) assert.ok(e instanceof ErreurHttp)
})
