// Le garde-fou du mode Éditer (extensions/garde-suggestions), réduit le
// 24/11/2026 aux gestes qui abîment une correction : son contenu effacé ou
// remplacé, son déplacement (coupure, fusion, type de bloc), un ajout qui
// n'est pas de la frappe à son contact (essai : docs/v2-tests/essai-garde-fou-2026-11-24.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import {
  zonesDuBloc,
  recouvreUneCorrection,
  auContactDUneCorrection,
  changeUneSuggestion,
} from '../../extensions/garde-suggestions/index.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: { group: 'block', content: 'text*' },
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
const schemaLien = new Schema({
  nodes: { doc: { content: 'block+' }, paragraph: { group: 'block', content: 'text*' }, text: {} },
  marks: { 'y-attributed-insert': {}, link: { attrs: { href: {} } } },
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

const fmt = schema.marks['y-attributed-format'].create()
const etat = (doc) => EditorState.create({ doc })
// Positions du document = positions du bloc + 1 : « donc » occupe 12 à 16.
const libre = p('Libre ici.')
const doc = schema.node('doc', null, [p('Avant.'), bloc, libre])
const D = p('Avant.').nodeSize // décalage du bloc corrigé dans ce document
const s = etat(doc)

test('zone : la correction seule, sans marge ; deux corrections voisines font une plage', () => {
  assert.deepEqual(zonesDuBloc(bloc), [[11, 15]])
  assert.deepEqual(zonesDuBloc(p('Rien ici.')), [])
  assert.deepEqual(zonesDuBloc(p('Un ', ['deux', ins], ['trois', del], ' quatre cinq')), [[3, 12]])
  assert.deepEqual(zonesDuBloc(p('Il faisait nuit ', ['noire', del], ' sur la ville.')), [[16, 21]])
})

test('zone : une « modification de mise en forme » n’est pas une correction (commentaire supprimé ou résolu)', () => {
  const marque = p('Il faisait ', ['nuit', fmt], ' noire.')
  assert.deepEqual(zonesDuBloc(marque), [])
  const e = etat(schema.node('doc', null, [marque]))
  assert.equal(changeUneSuggestion(e.tr.delete(13, 15)), false, 'effacer dans le mot')
  assert.equal(changeUneSuggestion(e.tr.delete(10, 12)), false, 'effacer juste avant')
  assert.equal(changeUneSuggestion(e.tr.split(8)), false, 'couper le paragraphe avant')
})

test('recouvrement et contact : le contenu de la correction ; de son début au signe qui suit sa fin', () => {
  assert.equal(recouvreUneCorrection(doc, D + 13, D + 14), true, 'dans la correction')
  assert.equal(recouvreUneCorrection(doc, D + 5, D + 13), true, 'entre par la gauche')
  assert.equal(recouvreUneCorrection(doc, D + 11, D + 12), false, 'le signe juste avant')
  assert.equal(recouvreUneCorrection(doc, D + 16, D + 17), false, 'le signe juste après')
  for (const pos of [12, 14, 16, 17]) assert.equal(auContactDUneCorrection(doc, D + pos), true, `pos ${pos}`)
  for (const pos of [1, 11, 18, 25]) assert.equal(auContactDUneCorrection(doc, D + pos), false, `pos ${pos}`)
})

test('1. effacer ou remplacer le contenu d’une correction : refusé ; à côté : libre', () => {
  assert.equal(changeUneSuggestion(s.tr.delete(D + 15, D + 16)), true, 'Retour arrière sur sa dernière lettre')
  assert.equal(changeUneSuggestion(s.tr.delete(D + 5, D + 13)), true, 'suppression qui y entre')
  assert.equal(changeUneSuggestion(s.tr.insertText('Z', D + 1, D + 20)), true, 'sélection qui la recouvre, remplacée')
  assert.equal(changeUneSuggestion(s.tr.delete(D + 11, D + 12)), false, 'le signe juste avant')
  assert.equal(changeUneSuggestion(s.tr.delete(D + 16, D + 17)), false, 'le signe juste après')
  assert.equal(changeUneSuggestion(s.tr.delete(D + 18, D + 20)), false, 'dans le mot voisin')
  assert.equal(changeUneSuggestion(s.tr.delete(D + 4, D + 9)), false, 'dans le mot d’avant')
})

test('2. déplacer une correction : coupure avant elle, fusion de son bloc, type de bloc ; refusés', () => {
  assert.equal(changeUneSuggestion(s.tr.split(D + 5)), true, 'Entrée avant la correction')
  assert.equal(changeUneSuggestion(s.tr.split(D + 14)), true, 'Entrée dans la correction')
  assert.equal(changeUneSuggestion(s.tr.split(D + 16)), false, 'Entrée juste après elle')
  assert.equal(changeUneSuggestion(s.tr.split(D + 22)), false, 'Entrée plus loin')
  assert.equal(changeUneSuggestion(s.tr.join(D)), true, 'son bloc rejoint le précédent')
  assert.equal(changeUneSuggestion(s.tr.join(D + bloc.nodeSize)), false, 'le bloc suivant la rejoint')
  assert.equal(
    changeUneSuggestion(s.tr.setBlockType(D + 1, D + 2, schema.nodes.heading)),
    true,
    'son paragraphe devient un titre',
  )
  const fin = D + bloc.nodeSize
  assert.equal(
    changeUneSuggestion(s.tr.setBlockType(fin + 1, fin + 2, schema.nodes.heading)),
    false,
    'un autre paragraphe devient un titre',
  )
  assert.equal(changeUneSuggestion(s.tr.split(3)), false, 'Entrée dans un autre paragraphe')
  // Un paragraphe vide devant la correction se retire (Entrée par erreur en début de paragraphe) : BlockNote
  // supprime le paragraphe corrigé et le recopie à la place du vide ; au bout du compte, seul le vide part.
  const avecVide = etat(schema.node('doc', null, [schema.node('paragraph'), bloc, libre]))
  const finCorrige = 2 + bloc.nodeSize
  const retrait = avecVide.tr.delete(2, finCorrige).replaceWith(0, 2, bloc)
  assert.equal(changeUneSuggestion(retrait), false, 'le paragraphe vide d’avant est retiré')
  assert.equal(changeUneSuggestion(avecVide.tr.delete(2, finCorrige)), true, 'le paragraphe corrigé seul est supprimé')
})

test('3. au contact : la frappe simple passe si elle est réparée ; un remplacement ou un autre ajout, non', () => {
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 16), true), false, 'une lettre juste après, réparée')
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 16)), true, 'la même sans le correctif')
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 17), true), false, 'un signe après la fin')
  assert.equal(
    changeUneSuggestion(s.tr.insertText('Q', D + 16, D + 18), true),
    true,
    'une sélection au contact, remplacée',
  )
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 18), true), false, 'dans le mot voisin')
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 18)), false, 'dans le mot voisin, sans le correctif')
  assert.equal(changeUneSuggestion(s.tr.insertText('Q', D + 1)), false, 'début du paragraphe')
  // Un texte collé avec sa propre mise en forme n'est pas de la frappe : le correctif ne le replace pas.
  const gras = schema.text('gras', [schema.marks.bold.create()])
  assert.equal(changeUneSuggestion(s.tr.insert(D + 16, gras), true), true, 'texte en gras collé au contact')
  assert.equal(changeUneSuggestion(s.tr.insert(D + 19, gras), true), false, 'le même, dans le mot voisin')
  // La même marque avec d'autres attributs n'est pas « la même forme ».
  const lien = (href) => schemaLien.marks.link.create({ href })
  const blocLie = schemaLien.node('paragraph', null, [
    schemaLien.text('Voir ', [lien('a')]),
    schemaLien.text('ici', [lien('a'), schemaLien.marks['y-attributed-insert'].create()]),
  ])
  const e = EditorState.create({ doc: schemaLien.node('doc', null, [blocLie]) })
  assert.equal(changeUneSuggestion(e.tr.insert(9, schemaLien.text('Q', [lien('a')])), true), false, 'même lien')
  assert.equal(changeUneSuggestion(e.tr.insert(9, schemaLien.text('Q', [lien('b')])), true), true, 'autre lien')
})

test('mise en forme et commentaires : libres, même par-dessus une correction', () => {
  assert.equal(changeUneSuggestion(s.tr.addMark(D + 4, D + 9, schema.marks.bold.create())), false, 'gras à côté')
  assert.equal(changeUneSuggestion(s.tr.addMark(D + 1, D + 20, schema.marks.bold.create())), false, 'gras par-dessus')
  assert.equal(changeUneSuggestion(s.tr.addMark(D + 12, D + 16, schema.marks.comment.create())), false)
})

test('transaction : la collaboration et les transactions ajoutées passent', () => {
  assert.equal(changeUneSuggestion(s.tr.delete(D + 13, D + 14).setMeta('y-sync-transaction', {})), false)
  assert.equal(changeUneSuggestion(s.tr.delete(D + 13, D + 14).setMeta('y-sync$', {})), false)
  assert.equal(changeUneSuggestion(s.tr.delete(D + 13, D + 14).setMeta('appendedTransaction', s.tr)), false)
  assert.equal(changeUneSuggestion(s.tr.setSelection(s.selection)), false, 'sans changement du texte')
})
