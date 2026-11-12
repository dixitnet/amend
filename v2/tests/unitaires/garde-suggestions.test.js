// Le garde-fou du mode Éditer (extensions/garde-suggestions) : les zones
// protégées autour d'une suggestion, et les transactions refusées ou permises
// (y-prosemirror#245 ; essai du 12/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { zonesDuBloc, toucheUneSuggestion, changeUneSuggestion } from '../../extensions/garde-suggestions/index.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: {},
  },
  marks: {
    'y-attributed-insert': {},
    'y-attributed-delete': {},
    'y-attributed-format': {},
    comment: {},
    bold: {},
  },
})
const ins = schema.marks['y-attributed-insert'].create()
const del = schema.marks['y-attributed-delete'].create()
/** Un paragraphe fait de morceaux : texte simple, ou [texte, marque]. */
const p = (...morceaux) =>
  schema.node(
    'paragraph',
    null,
    morceaux.map((m) => (typeof m === 'string' ? schema.text(m) : schema.text(m[0], [m[1]]))),
  )

// « Il faisait donc nuit noire. » : « donc » suggéré (positions 11 à 15 du bloc).
const bloc = p('Il faisait ', ['donc', ins], ' nuit noire.')

test('zone : la suggestion, plus le mot qui la touche de chaque côté, espace comprise', () => {
  // « faisait » commence à 3, « nuit » finit à 20.
  assert.deepEqual(zonesDuBloc(bloc), [[3, 20]])
})

test('zone : sans suggestion, aucune ; deux suggestions voisines font une seule plage', () => {
  assert.deepEqual(zonesDuBloc(p('Rien ici.')), [])
  assert.deepEqual(zonesDuBloc(p('Un ', ['deux', ins], ['trois', del], ' quatre cinq')), [[0, 19]])
})

test('zone : une suppression suggérée est protégée aussi', () => {
  assert.deepEqual(zonesDuBloc(p('Il faisait nuit ', ['noire', del], ' sur la ville.')), [[11, 25]])
})

test('contact : frappe dans la zone, à ses bords ; pas au-delà', () => {
  const doc = schema.node('doc', null, [bloc])
  // Positions du document = positions du bloc + 1.
  for (const pos of [4, 12, 16, 17, 21]) assert.equal(toucheUneSuggestion(doc, pos), true, `pos ${pos}`)
  for (const pos of [1, 2, 23, 27]) assert.equal(toucheUneSuggestion(doc, pos), false, `pos ${pos}`)
  // Une sélection qui chevauche la zone par la gauche.
  assert.equal(toucheUneSuggestion(doc, 1, 6), true)
})

test('contact : un autre paragraphe que celui de la suggestion est libre', () => {
  const doc = schema.node('doc', null, [bloc, p('Second paragraphe sans rien.')])
  const debutSecond = bloc.nodeSize + 1
  assert.equal(toucheUneSuggestion(doc, debutSecond + 5), false)
  // Une sélection à cheval sur les deux paragraphes, qui part de la zone.
  assert.equal(toucheUneSuggestion(doc, 14, debutSecond + 5), true)
})

const etat = (doc) => EditorState.create({ doc })

test('transaction locale : refusée au contact, permise loin', () => {
  const s = etat(schema.node('doc', null, [bloc, p('Libre.')]))
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', 17)), true, 'juste après « donc »')
  assert.equal(changeUneSuggestion(s.tr.delete(10, 14)), true, 'suppression qui mord la zone')
  // Positions d'avant l'étape (StepMap.forEach : ancien début, ancienne fin) : une
  // suppression qui part d'avant la zone (1) et y entre (5) est refusée (audit du 12/11/2026).
  assert.equal(changeUneSuggestion(s.tr.delete(1, 5)), true, 'suppression qui entre dans la zone par la gauche')
  assert.equal(changeUneSuggestion(s.tr.delete(1, 3)), false, 'suppression qui s’arrête avant la zone')
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', 1)), false, 'début du paragraphe')
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', bloc.nodeSize + 2)), false, 'autre paragraphe')
  assert.equal(changeUneSuggestion(s.tr.addMark(4, 9, schema.marks.bold.create())), true, 'gras sur « faisait »')
})

test('transaction : la collaboration, les transactions ajoutées et les commentaires passent', () => {
  const s = etat(schema.node('doc', null, [bloc]))
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', 17).setMeta('y-sync-transaction', {})), false)
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', 17).setMeta('y-sync$', {})), false)
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', 17).setMeta('appendedTransaction', s.tr)), false)
  assert.equal(changeUneSuggestion(s.tr.addMark(12, 16, schema.marks.comment.create())), false)
  assert.equal(changeUneSuggestion(s.tr.setSelection(s.selection)), false, 'sans changement du texte')
})
