// Les gestes de la barre de mise en forme (client/src/commandesBarre.js),
// sortis de `mountEditor` le 13/10/2026 : on les joue sur un vrai état
// ProseMirror, avec une fausse vue (état, transactions, focus).

import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState, TextSelection } from 'prosemirror-state'
import { deleteTable, deleteRow, addRowAfter } from 'prosemirror-tables'
import { schema } from '../src/schema.js'
import {
  hasAncestorOfType,
  basculerMarque,
  basculerListeAPuces,
  basculerListeNumerotee,
  basculerListeACocher,
  basculerCitation,
  styleDeBlocCommun,
  appliquerStyleDeBloc,
  insererTableau,
  commandeTableau,
  insererLigneHorizontale,
} from '../src/commandesBarre.js'

const para = (...contenu) =>
  schema.node('paragraph', null, contenu.filter((c) => c !== '').map((c) => (typeof c === 'string' ? schema.text(c) : c)))
const titre = (niveau, texte) => schema.node('heading', { level: niveau }, [schema.text(texte)])
const docDe = (...blocs) => schema.node('doc', null, blocs)

/** Une vue minimale : l'état, `dispatch`, `focus` — tout ce que les gestes touchent. */
function vue(doc, { debut, fin = debut } = {}) {
  let state = EditorState.create({ doc, schema })
  if (debut !== undefined) state = state.apply(state.tr.setSelection(TextSelection.create(doc, debut, fin)))
  const v = {
    get state() {
      return state
    },
    dispatch(tr) {
      v.transactions.push(tr)
      state = state.apply(tr)
    },
    focus() {
      v.focus.appels += 1
    },
    transactions: [],
  }
  v.focus.appels = 0
  return v
}

/** Les types des blocs de premier niveau, en une ligne lisible. */
const forme = (doc) => doc.children.map((n) => n.type.name).join(' ')

// ===================================================== le style de bloc

test('le style de bloc commun : paragraphe, niveau du titre, ou rien si la sélection mélange', () => {
  const doc = docDe(para('Un'), titre(2, 'Deux'), schema.node('blockquote', null, [para('Trois')]))
  // positions : « Un » 1-3, titre 4-8, citation 9-17
  assert.equal(styleDeBlocCommun(vue(doc, { debut: 2 }).state), '')
  assert.equal(styleDeBlocCommun(vue(doc, { debut: 6 }).state), '2')
  assert.equal(styleDeBlocCommun(vue(doc, { debut: 12 }).state), '', 'un paragraphe de citation compte comme Normal')
  assert.equal(styleDeBlocCommun(vue(doc, { debut: 2, fin: 6 }).state), null, 'paragraphe + titre')
})

test('appliquerStyleDeBloc : titre puis retour au paragraphe', () => {
  const v = vue(docDe(para('Texte')), { debut: 2 })
  assert.equal(appliquerStyleDeBloc(v, '3'), true)
  assert.equal(v.state.doc.child(0).type.name, 'heading')
  assert.equal(v.state.doc.child(0).attrs.level, 3)
  assert.equal(appliquerStyleDeBloc(v, ''), true)
  assert.equal(v.state.doc.child(0).type.name, 'paragraph')
})

test('appliquerStyleDeBloc refuse un titre sur un paragraphe qui porte une note, sans rien changer', () => {
  const note = schema.nodes.footnote.create({ suivi: null })
  const v = vue(docDe(para('avant', note, 'après')), { debut: 2 })
  const avant = v.state.doc
  assert.equal(appliquerStyleDeBloc(v, '1'), 'note')
  assert.ok(v.state.doc.eq(avant))
  assert.equal(v.transactions.length, 0)
  // Remettre « Normal » reste permis.
  assert.equal(appliquerStyleDeBloc(v, ''), true)
})

// ===================================================== marques, listes, citation

test('basculerMarque pose puis retire la marque, et rend le focus au texte', () => {
  const v = vue(docDe(para('Bonjour')), { debut: 1, fin: 8 })
  basculerMarque(v, 'strong')
  assert.ok(v.state.doc.rangeHasMark(1, 8, schema.marks.strong))
  assert.equal(v.focus.appels, 1)
  basculerMarque(v, 'strong')
  assert.ok(!v.state.doc.rangeHasMark(1, 8, schema.marks.strong))
  for (const nom of ['em', 'underline', 'strike']) {
    basculerMarque(v, nom)
    assert.ok(v.state.doc.rangeHasMark(1, 8, schema.marks[nom]), nom)
  }
})

test('listes et citation sont des interrupteurs : envelopper, puis sortir', () => {
  const cas = [
    [basculerListeAPuces, 'bullet_list'],
    [basculerListeNumerotee, 'ordered_list'],
    [basculerListeACocher, 'task_list'],
    [basculerCitation, 'blockquote'],
  ]
  for (const [geste, type] of cas) {
    const v = vue(docDe(para('Un élément')), { debut: 3 })
    geste(v)
    assert.equal(forme(v.state.doc), type, `${type} posée`)
    assert.ok(hasAncestorOfType(v.state, schema.nodes[type]))
    geste(v)
    assert.equal(forme(v.state.doc), 'paragraph', `${type} retirée`)
    assert.equal(v.focus.appels, 2)
  }
})

// ===================================================== tableau

test('insererTableau pose un tableau 3 × 3, hors suivi, et rend le focus', () => {
  const v = vue(docDe(para('Avant'), para('')), { debut: 8 })
  insererTableau(v)
  const tableau = v.state.doc.content.content.find((n) => n.type.name === 'table')
  assert.ok(tableau, 'un tableau dans le document')
  assert.equal(tableau.childCount, 3, 'trois lignes')
  assert.equal(tableau.child(0).childCount, 3, 'trois colonnes')
  assert.equal(v.transactions.at(-1).getMeta('trackChangesInternal'), true, 'une structure : jamais réécrite par le suivi')
  assert.equal(v.focus.appels, 1)
})

test('commandeTableau : les opérations de structure passent hors suivi, la vue étant lue au moment du geste', () => {
  const v = vue(docDe(para('')), { debut: 1 })
  insererTableau(v)
  // Curseur dans la première cellule du tableau.
  let cellule
  v.state.doc.descendants((n, pos) => {
    if (cellule === undefined && n.type.name === 'table_cell') cellule = pos
  })
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, cellule + 2)))
  const table = () => {
    let t
    v.state.doc.descendants((n) => {
      if (!t && n.type.name === 'table') t = n
    })
    return t
  }
  assert.equal(table().childCount, 3)
  commandeTableau(() => v, addRowAfter)()
  assert.equal(table().childCount, 4)
  assert.equal(v.transactions.at(-1).getMeta('trackChangesInternal'), true)
  commandeTableau(() => v, deleteRow)()
  assert.equal(table().childCount, 3)
  commandeTableau(() => v, deleteTable)()
  assert.equal(table(), undefined, 'tableau supprimé')
})

// ===================================================== ligne horizontale

test('une ligne posée au milieu du texte ne crée pas de paragraphe en plus', () => {
  const v = vue(docDe(para('Bonjour'), para('monde')), { debut: 4 })
  insererLigneHorizontale(v)
  assert.ok(v.state.doc.content.content.some((n) => n.type.name === 'horizontal_rule'))
  assert.equal(v.focus.appels, 1)
  assert.notEqual(v.state.doc.lastChild.type.name, 'horizontal_rule')
})

test('une ligne posée en toute fin de document est suivie d’un paragraphe vide, curseur dedans', () => {
  const v = vue(docDe(para('Bonjour')), { debut: 8 })
  insererLigneHorizontale(v)
  assert.equal(forme(v.state.doc).endsWith('horizontal_rule paragraph'), true, forme(v.state.doc))
  const { $from } = v.state.selection
  assert.equal($from.parent.type.name, 'paragraph')
  assert.equal($from.parent.childCount, 0, 'le curseur est dans le paragraphe vide')
})
