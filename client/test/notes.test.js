// Les notes (28/09/2026, claude/conception-notes-bas-de-page.md) : le
// modèle, le suivi des modifications autour et **dans** une note, la
// résolution à l'export. La fenêtre d'édition (footnotes.js) demande un
// DOM ; ce qu'elle rejoue dans le document — des pas décalés — est ce
// qu'on vérifie ici sans elle.

import test from 'node:test'
import assert from 'node:assert/strict'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import { setBlockType } from 'prosemirror-commands'
import { editeur, doc, schema, UTILISATEUR } from './harness.js'
import { acceptAllChanges, rejectAllChanges, listChanges, acceptChange, rejectChange } from '../src/trackChanges.js'
import { documentPourExport, FINAL, EN_COURS } from '../src/exportVariante.js'
import { notesDuDocument, numerosDesNotes } from '../src/notes.js'
import { insererNote, selectionContientUneNote } from '../src/footnotes.js'

const BOB = { name: 'Bob', color: '#8a5a2b' }
const note = (texte, suivi = null) => schema.node('footnote', { suivi }, texte ? [schema.text(texte)] : [])
const p = (...k) => schema.node('paragraph', null, k)
const docAvecNote = (suivi = null) =>
  schema.node('doc', null, [p(schema.text('Un texte'), note('La note.', suivi), schema.text(' suivi.'))])
const notes = (d) => notesDuDocument(d).map(({ node }) => node.textContent)

test('le modèle : une note vit dans son appel, jamais dans un titre', () => {
  const d = docAvecNote()
  d.check()
  assert.deepEqual(notes(d), ['La note.'])
  assert.throws(() => schema.node('heading', { level: 1 }, [note('x')]).check(), /Invalid content/)
  assert.throws(() => schema.node('footnote', null, [note('x')]).check(), /Invalid content/)
  // Copier-coller dans amend.ink : le presse-papiers passe par toDOM/parseDOM.
  assert.equal(schema.nodes.footnote.spec.parseDOM[0].tag, 'span[data-note]')
})

test('le numéro n’est pas stocké : la n-ième note porte le numéro n', () => {
  const d = schema.node('doc', null, [p(schema.text('a'), note('un'), schema.text('b'), note('deux')), p(note('trois'))])
  const nums = numerosDesNotes(d)
  assert.deepEqual([...nums.values()], [1, 2, 3])
  const d2 = schema.node('doc', null, [p(note('zéro')), ...d.content.content])
  assert.deepEqual([...numerosDesNotes(d2).values()], [1, 2, 3, 4])
})

test('insérer une note hors suivi : rien à relire', () => {
  const e = editeur(doc('Un texte.'), { suivi: false })
  e.selection(3)
  assert.ok(insererNote(e.view, UTILISATEUR))
  e.doc.check()
  assert.equal(notesDuDocument(e.doc).length, 1)
  assert.equal(listChanges(e.doc).length, 0)
  assert.equal(e.doc.nodeAt(3).attrs.suivi, null)
})

test('insérer une note en suivi : la note entière est la proposition', () => {
  const e = editeur(doc('Un texte.'))
  e.selection(3)
  insererNote(e.view, UTILISATEUR)
  const l = listChanges(e.doc)
  assert.equal(l.length, 1)
  assert.equal(l[0].type, 'insertion')
  assert.equal(l[0].noeud, 'note')
  // Rejeter : la note disparaît. Accepter : elle reste, sans attente.
  const e2 = editeur(e.doc)
  rejectAllChanges(e2.view)
  assert.equal(notesDuDocument(e2.doc).length, 0)
  assert.equal(e2.texte(), 'Un texte.')
  acceptAllChanges(e.view)
  assert.equal(notesDuDocument(e.doc).length, 1)
  assert.equal(listChanges(e.doc).length, 0)
})

test('pas de note dans un titre : l’insertion est refusée, la conversion aussi', () => {
  const e = editeur(doc({ h: 1, texte: 'Titre' }), { suivi: false })
  e.selection(2)
  assert.equal(insererNote(e.view, UTILISATEUR), false)
  const e2 = editeur(docAvecNote(), { suivi: false })
  e2.selection(2)
  assert.ok(selectionContientUneNote(e2.state))
  // setBlockType, lui, convertirait le bloc en **jetant la note** sans un
  // mot : c'est pour ça que l'éditeur (headingSelect, raccourci « # »)
  // demande d'abord selectionContientUneNote.
  setBlockType(schema.nodes.heading, { level: 2 })(e2.state, e2.view.dispatch)
  assert.equal(e2.doc.child(0).type.name, 'heading')
  assert.equal(notesDuDocument(e2.doc).length, 0, 'la note serait perdue — d’où le garde-fou')
})

test('effacer une note en suivi la propose à la suppression ; hors suivi, elle part', () => {
  const e = editeur(docAvecNote())
  // La note occupe les positions 9..19 (un nœud à contenu : 8 + 2). Retour
  // arrière juste après elle.
  e.selection(19).effacerAvant()
  assert.equal(notesDuDocument(e.doc).length, 1, 'la note est encore là')
  const l = listChanges(e.doc)
  assert.equal(l.length, 1)
  assert.equal(l[0].type, 'deletion')
  assert.equal(l[0].text, 'Note : La note.')
  // Un second retour arrière saute la note barrée et barre le texte avant.
  e.effacerAvant()
  assert.deepEqual(e.marques(), ['-e'])
  // Accepter la suppression : plus de note. La rejeter : elle reste.
  const e2 = editeur(e.doc)
  rejectAllChanges(e2.view)
  assert.equal(notesDuDocument(e2.doc).length, 1)
  assert.equal(e2.doc.nodeAt(9).attrs.suivi, null)
  acceptAllChanges(e.view)
  assert.equal(notesDuDocument(e.doc).length, 0)
  assert.equal(e.texte(), 'Un text suivi.')

  const h = editeur(docAvecNote(), { suivi: false })
  h.selection(19).effacerAvant()
  assert.equal(notesDuDocument(h.doc).length, 0)
})

test('effacer sa propre note proposée la retire vraiment', () => {
  const e = editeur(doc('Un texte.'))
  e.selection(3)
  insererNote(e.view, UTILISATEUR)
  assert.equal(e.state.selection.from, 5, 'le curseur est après la note (vide : deux positions)')
  e.effacerAvant()
  assert.equal(notesDuDocument(e.doc).length, 0)
  assert.equal(listChanges(e.doc).length, 0)
})

test('une sélection qui englobe une note, remplacée à la frappe', () => {
  const e = editeur(docAvecNote())
  e.selection(4, 21).taper('X')
  e.doc.check()
  assert.equal(notesDuDocument(e.doc).length, 1, 'la note reste, barrée')
  const types = listChanges(e.doc).map((c) => c.type + (c.noeud ? '/note' : ''))
  assert.ok(types.includes('deletion/note'), types.join(' '))
  rejectAllChanges(e.view)
  assert.equal(e.texte(), 'Un texteLa note. suivi.')
  assert.equal(notesDuDocument(e.doc).length, 1)
})

test('taper dans une note acceptée est suivi comme dans un paragraphe', () => {
  const e = editeur(docAvecNote())
  // Position 18 = juste après « La note. » dans la note (9 + 1 + 8).
  e.selection(18).taper(' Ajout')
  e.doc.check()
  const l = listChanges(e.doc)
  assert.equal(l.length, 1)
  assert.equal(l[0].type, 'insertion')
  assert.equal(l[0].text, ' Ajout')
  assert.equal(e.doc.nodeAt(9).textContent, 'La note. Ajout')
  rejectAllChanges(e.view)
  assert.equal(e.doc.nodeAt(9).textContent, 'La note.')
  // Et effacer dedans barre, sans rien retirer.
  const e2 = editeur(docAvecNote())
  e2.selection(18).effacerAvant()
  assert.equal(e2.doc.nodeAt(9).textContent, 'La note.')
  assert.deepEqual(e2.marques(), ['-.'])
  acceptAllChanges(e2.view)
  assert.equal(e2.doc.nodeAt(9).textContent, 'La note')
})

test('deux auteurs : Bob barre la note d’Alice, Alice ne peut pas la retirer sans trace', () => {
  const e = editeur(docAvecNote(), { user: BOB })
  e.selection(19).effacerAvant()
  const l = listChanges(e.doc)
  assert.equal(l[0].user, 'Bob')
  const a = editeur(e.doc)
  a.selection(19).effacerAvant()
  assert.equal(notesDuDocument(a.doc).length, 1, 'toujours là')
})

test('à l’export : une note supprimée disparaît, une note proposée reste, le texte dedans se résout', () => {
  const suivi = (type) => ({ type, user: 'Alice', userColor: '#000', ts: 1 })
  const ins = schema.marks.insertion.create({ user: 'Alice', userColor: '#000', ts: 1 })
  const del = schema.marks.deletion.create({ user: 'Alice', userColor: '#000', ts: 1 })
  const d = schema.node('doc', null, [
    p(
      schema.text('a'),
      note('supprimée', suivi('deletion')),
      note('proposée', suivi('insertion')),
      schema.node('footnote', null, [schema.text('gardé ', []), schema.text('ajouté', [ins]), schema.text(' retiré', [del])])
    ),
  ])
  const final = documentPourExport(d, FINAL)
  assert.deepEqual(notes(final), ['proposée', 'gardé ajouté'])
  for (const { node } of notesDuDocument(final)) assert.equal(node.attrs.suivi, null)
  const cours = documentPourExport(d, EN_COURS)
  assert.deepEqual(notes(cours), ['supprimée', 'proposée', 'gardé ajouté retiré'])
})
