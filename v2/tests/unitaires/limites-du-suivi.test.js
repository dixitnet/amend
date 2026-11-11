// Les limites du mode Suggérer (extensions/limites-du-suivi) : quand une
// suppression franchirait la fin d'un paragraphe (audit partiel du 11/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { aCheval, fusionnerait } from '../../extensions/limites-du-suivi/index.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    image: { group: 'block' },
    text: {},
  },
})
const p = (t) => schema.node('paragraph', null, t ? [schema.text(t)] : [])
// doc : « Un » (pos 1-3), « Deux » (pos 5-9)
const doc = schema.node('doc', null, [p('Un'), p('Deux')])
const sel = (a, b = a) => EditorState.create({ doc, selection: TextSelection.create(doc, a, b) }).selection

test('à cheval : une sélection sur deux paragraphes, pas dans un seul', () => {
  assert.equal(aCheval(sel(2, 6)), true)
  assert.equal(aCheval(sel(1, 3)), false)
  assert.equal(aCheval(sel(2)), false)
})

test('fusion : Retour arrière en début, Suppr en fin ; pas au milieu', () => {
  assert.equal(fusionnerait(sel(5), 'arriere'), true, 'début du 2e')
  assert.equal(fusionnerait(sel(3), 'avant'), true, 'fin du 1er')
  assert.equal(fusionnerait(sel(2), 'arriere'), false)
  assert.equal(fusionnerait(sel(2), 'avant'), false)
  assert.equal(fusionnerait(sel(2, 6), 'avant'), true, 'sélection à cheval')
  assert.equal(fusionnerait(sel(1, 3), 'arriere'), false, 'sélection dans un paragraphe')
})
