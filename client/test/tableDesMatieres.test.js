// La table des matières : le bloc, sa profondeur, et ce qu'en font les
// exports. Le banc d'essai ne monte pas de DOM — ce qui se vérifie ici est
// le **contenu** de la table (quels titres elle reprend) et la source
// produite, pas son apparence.

import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from 'prosemirror-state'
import { schema } from '../src/schema.js'
import { entrees, insererTable, PROFONDEUR_DEFAUT } from '../src/tableOfContents.js'
import { docToTypst } from '../src/typstExport.js'
import { docToMarkdown } from '../src/mdExport.js'
import { documentPourExport, FINAL } from '../src/exportVariante.js'
import { fusionner } from '../../shared/style.js'

const p = (t) => schema.node('paragraph', null, [schema.text(t)])
const h = (l, t) => schema.node('heading', { level: l }, [schema.text(t)])
const toc = (profondeur = PROFONDEUR_DEFAUT) =>
  schema.nodes.table_of_contents.create({ profondeur })

function document(profondeur = PROFONDEUR_DEFAUT) {
  return schema.node('doc', null, [
    h(1, 'Le constat'),
    toc(profondeur),
    p('Un paragraphe.'),
    h(2, 'Les chiffres'),
    p('Encore du texte.'),
    h(3, 'Une précision'),
    h(1, 'Les propositions'),
  ])
}

test('la profondeur décide des titres repris', () => {
  const doc = document()
  assert.deepEqual(
    entrees(doc, 1).map((t) => t.text),
    ['Le constat', 'Les propositions']
  )
  assert.deepEqual(
    entrees(doc, 2).map((t) => t.text),
    ['Le constat', 'Les chiffres', 'Les propositions']
  )
  assert.equal(entrees(doc, 3).length, 4)
})

test('un titre vide n’entre pas dans la table', () => {
  // Un titre qu'on vient de créer et qu'on n'a pas encore nommé ne doit pas
  // y apparaître comme une ligne blanche.
  const doc = schema.node('doc', null, [h(1, 'Nommé'), schema.node('heading', { level: 1 })])
  assert.deepEqual(entrees(doc, 3).map((t) => t.text), ['Nommé'])
})

test('une profondeur absurde retombe sur une valeur utilisable', () => {
  const doc = document()
  assert.equal(entrees(doc, 0).length, entrees(doc, 1).length)
  assert.equal(entrees(doc, 99).length, entrees(doc, 3).length)
})

test('la table s’insère après le bloc du curseur, jamais au milieu d’une phrase', () => {
  const doc = schema.node('doc', null, [p('Premier paragraphe.'), p('Second.')])
  let state = EditorState.create({ doc })
  // Curseur au milieu du premier paragraphe.
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
  let applique = null
  insererTable(state, (tr) => (applique = tr))
  assert.ok(applique, 'la commande doit s’appliquer')
  const apres = state.apply(applique).doc
  assert.equal(apres.child(0).type.name, 'paragraph')
  assert.equal(apres.child(0).textContent, 'Premier paragraphe.', 'le paragraphe n’est pas coupé')
  assert.equal(apres.child(1).type.name, 'table_of_contents')
  assert.equal(apres.child(1).attrs.profondeur, PROFONDEUR_DEFAUT)
})

test('export PDF : une table Typst, à la profondeur du bloc, au style du texte courant', () => {
  const src = docToTypst(document(2), fusionner({}), 'Essai')
  assert.match(src, /#amend-corps\[#outline\(title: none, depth: 2, indent: auto\)\]/)
  // `title: none` : le bloc ne s'intitule pas lui-même, l'auteur écrit son
  // « Sommaire » s'il en veut un.
  assert.doesNotMatch(src, /outline\(title: "/)

  const profond = docToTypst(document(3), fusionner({}), 'Essai')
  assert.match(profond, /depth: 3/)
})

test('export Markdown : la liste des titres, indentée par niveau', () => {
  const md = docToMarkdown(document(2))
  assert.match(md, /- Le constat/)
  assert.match(md, /\n {2}- Les chiffres/)
  // Le titre lui-même reste dans le corps du document : ce qu'on vérifie,
  // c'est qu'il n'a pas de ligne dans la table.
  assert.doesNotMatch(md, /^ {4}- Une précision$/m, 'le niveau 3 est hors profondeur')
  assert.match(md, /^### Une précision$/m)
})

test('la table traverse la résolution du suivi sans disparaître', () => {
  // Un nœud atomique n'a pas d'enfants : la règle « un conteneur vidé s’en
  // va » ne doit pas l'emporter avec elle.
  const doc = schema.node('doc', null, [toc(2), p('Texte.')])
  const final = documentPourExport(doc, FINAL)
  assert.equal(final.child(0).type.name, 'table_of_contents')
  assert.equal(final.child(0).attrs.profondeur, 2)
})
