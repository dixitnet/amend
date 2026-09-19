// Ce que l'export met réellement dans le fichier.
//
// Le défaut corrigé le 19/09/2026 ne se voyait pas à l'écran : c'est le
// fichier produit qui était faux — un mot remplacé et son remplaçant s'y
// suivaient. D'où des tests qui portent sur le **document résolu**, et non
// sur l'apparence de l'éditeur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from 'prosemirror-state'
import { schema } from '../src/schema.js'
import { trackChangesPlugin, makeDispatchTransaction } from '../src/trackChanges.js'
import { documentPourExport, FINAL, EN_COURS } from '../src/exportVariante.js'

const UTILISATEUR = { name: 'Alice', color: '#3d5a80' }

/** Un document où « doit » a été remplacé par « peut » en suivi. */
function remplacement() {
  const d = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Le maire doit agir.')]),
  ])
  let state = EditorState.create({ doc: d, plugins: [trackChangesPlugin({ enabled: true })] })
  const view = { get state() { return state }, updateState(s) { state = s }, dispatch(tr) { disp(tr) } }
  const disp = makeDispatchTransaction(view, () => UTILISATEUR)
  // « doit » occupe les positions 10 à 14.
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 10, 14)))
  disp(state.tr.insertText('peut', 10, 14))
  return state.doc
}

function texte(doc) {
  const lignes = []
  doc.forEach((n) => lignes.push(n.textContent))
  return lignes.join('\n')
}

function marques(doc, nom) {
  const out = []
  doc.descendants((n) => {
    if (n.isText && n.marks.some((m) => m.type.name === nom)) out.push(n.text)
  })
  return out
}

test('document final : le mot remplacé s’en va, le remplaçant reste', () => {
  // C'est exactement le fichier faux d'avant : « peutdoit » ou « doitpeut »
  // selon l'ordre, les deux mots à la suite.
  const brut = remplacement()
  assert.ok(brut.textContent.includes('doit'), 'le document de travail garde les deux')
  assert.ok(brut.textContent.includes('peut'))

  const final = documentPourExport(brut, FINAL)
  assert.equal(texte(final), 'Le maire peut agir.')
})

test('document final : plus aucune marque de suivi ne survit', () => {
  const final = documentPourExport(remplacement(), FINAL)
  assert.deepEqual(marques(final, 'insertion'), [])
  assert.deepEqual(marques(final, 'deletion'), [])
  assert.deepEqual(marques(final, 'authorColor'), [])
})

test('version en cours : ajout souligné, suppression barrée', () => {
  // Les trois sérialiseurs savent déjà rendre `underline` et `strike` : on
  // leur donne un document, pas une consigne.
  const cours = documentPourExport(remplacement(), EN_COURS)
  assert.equal(texte(cours), 'Le maire peutdoit agir.')
  assert.deepEqual(marques(cours, 'underline'), ['peut'])
  assert.deepEqual(marques(cours, 'strike'), ['doit'])
  assert.deepEqual(marques(cours, 'insertion'), [], 'les marques de travail ne sortent pas telles quelles')
})

test('les marqueurs « !! » ne sortent que de la version en cours', () => {
  const d = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Chiffre à vérifier !! avant envoi.')]),
  ])
  assert.equal(texte(documentPourExport(d, FINAL)), 'Chiffre à vérifier  avant envoi.')
  assert.ok(texte(documentPourExport(d, EN_COURS)).includes('!!'))
})

test('un bloc entièrement supprimé disparaît du document final, un blanc voulu reste', () => {
  const d = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Gardé.')]),
    schema.node('paragraph', null, [
      schema.text('Supprimé.', [schema.marks.deletion.create({ user: 'A', userColor: '#000', ts: 1 })]),
    ]),
    schema.node('paragraph'),
    schema.node('paragraph', null, [schema.text('Fin.')]),
  ])
  const final = documentPourExport(d, FINAL)
  assert.equal(final.childCount, 3, 'le paragraphe vidé s’en va, le paragraphe vide reste')
  assert.equal(texte(final), 'Gardé.\n\nFin.')
})

test('une citation vidée s’en va avec son contenu', () => {
  const del = schema.marks.deletion.create({ user: 'A', userColor: '#000', ts: 1 })
  const d = schema.node('doc', null, [
    schema.node('blockquote', null, [schema.node('paragraph', null, [schema.text('Citation.', [del])])]),
    schema.node('paragraph', null, [schema.text('Suite.')]),
  ])
  assert.equal(documentPourExport(d, FINAL).childCount, 1)
})

test('un document entièrement supprimé reste un document', () => {
  const del = schema.marks.deletion.create({ user: 'A', userColor: '#000', ts: 1 })
  const d = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Tout.', [del])])])
  const final = documentPourExport(d, FINAL)
  assert.equal(final.childCount, 1)
  assert.equal(texte(final), '')
})

test('le document d’origine n’est jamais modifié', () => {
  const brut = remplacement()
  const avant = brut.toJSON()
  documentPourExport(brut, FINAL)
  documentPourExport(brut, EN_COURS)
  assert.deepEqual(brut.toJSON(), avant)
})
