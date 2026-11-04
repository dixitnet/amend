// Écarts de la campagne de tests du 02/11/2026 (docs/ecarts-editeur.md),
// corrigés le 03/11/2026 : 2, 3, 7a, 8, 15, 13. Un test par écart, rejoué
// sur le chemin réel de la réécriture en suivi.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AllSelection, TextSelection } from 'prosemirror-state'
import { Fragment, Slice } from 'prosemirror-model'
import { ReplaceStep } from 'prosemirror-transform'
import { editeur, doc, schema } from './harness.js'
import { listChanges } from '../src/suivi/inventaire.js'

const BOB = { name: 'Bob', color: '#e07a5f' }

/** Lecture compacte : texte, [-barré-], {+ajouté+}, un bloc par ligne. */
function lire(d) {
  const lignes = []
  d.forEach((bloc) => {
    let s = ''
    bloc.descendants((n) => {
      if (!n.isText) return
      const ins = n.marks.some((m) => m.type.name === 'insertion')
      const del = n.marks.some((m) => m.type.name === 'deletion')
      s += ins ? `{+${n.text}+}` : del ? `[-${n.text}-]` : n.text
    })
    lignes.push(s)
  })
  return lignes
    .join('\n')
    .replace(/\+\}\{\+/g, '')
    .replace(/-\]\[-/g, '')
}
const pos = (e, texte, decalage = 0) => {
  let trouve = -1
  e.doc.descendants((n, p) => {
    if (trouve < 0 && n.isText) {
      const i = n.text.indexOf(texte)
      if (i >= 0) trouve = p + i + decalage
    }
  })
  return trouve
}

test('écart 2 — Ctrl+A puis frappe : le texte tapé est bien proposé', () => {
  const e = editeur(doc('Un chat.', 'Deux chats.'))
  e.view.dispatch(e.state.tr.setSelection(new AllSelection(e.doc)))
  // Ce que le navigateur envoie : tout le document remplacé par un paragraphe « N ».
  const tr = e.state.tr.replace(
    0,
    e.doc.content.size,
    new Slice(Fragment.from(schema.node('paragraph', null, [schema.text('N')])), 0, 0)
  )
  e.view.dispatch(tr)
  e.taper('ouveau')
  assert.equal(lire(e.doc), '[-Un chat.-]\n[-Deux chats.-]{+Nouveau+}')
  assert.equal(e.texteAccepte(), '\nNouveau')
})

test('écart 3 — dictée sur une sélection paragraphe → citation : pas de doublon', () => {
  const e = editeur(doc('Le chat noir dort.', { citation: 'Il fait beau.' }))
  const debut = pos(e, 'dort.')
  const fin = pos(e, 'Il fait', 7)
  e.selection(debut, fin)
  // Le pas réel (journal du 02/11) : la plage jusqu'à la fin de la citation,
  // remplacée par un paragraphe qui contient la frappe ET la fin du bloc.
  const finCitation = e.doc.content.size
  const tranche = new Slice(Fragment.from(schema.node('paragraph', null, [schema.text('gris beau.')])), 1, 0)
  const tr = e.state.tr.step(new ReplaceStep(debut, finCitation, tranche))
  e.view.dispatch(tr)
  assert.equal(lire(e.doc), 'Le chat noir [-dort.-]\n[-Il fait-]{+gris+} beau.')
  assert.equal(e.texteAccepte(), 'Le chat noir \ngris beau.')
})

test('écart 7a — sélection sur deux paragraphes : le barré d’abord, l’ajout ensuite', () => {
  const e = editeur(doc('Le chat dort.', 'Il fait beau.'))
  e.selection(pos(e, 'dort.'), pos(e, 'Il fait', 7))
  e.taper('blanc')
  assert.equal(lire(e.doc), 'Le chat [-dort.-]\n[-Il fait-]{+blanc+} beau.')
})

test('écart 7a — pendant une composition sur deux paragraphes, la frappe reste au début', () => {
  // Le navigateur compose au début de la sélection : y déplacer le texte dans
  // le modèle cassait la composition (régression vue au banc le 03/11/2026).
  const e = editeur(doc('Le chat dort.', 'Il fait beau.'))
  const debut = pos(e, 'dort.')
  const fin = pos(e, 'Il fait', 7)
  e.selection(debut, fin)
  e.view.dispatch(e.state.tr.insertText('^', debut, fin).setMeta('composition', 1))
  assert.equal(lire(e.doc), 'Le chat {+^+}[-dort.-]\n[-Il fait-] beau.')
})

test('écart 8 — barrer un passage déjà barré par un autre garde sa suppression', () => {
  const alice = editeur(doc('Le chat noir dort.'))
  alice.selection(pos(alice, 'noir'), pos(alice, 'noir', 4)).effacerAvant()
  const bob = editeur(alice.doc, { user: BOB })
  bob.selection(pos(bob, 'chat'), pos(bob, 'dort', 4)).taper('chien dort')
  const auteurs = []
  bob.doc.descendants((n) => {
    const del = n.isText && n.marks.find((m) => m.type.name === 'deletion')
    if (del) auteurs.push(`${n.text}:${del.attrs.user}`)
  })
  assert.ok(auteurs.includes('noir:Alice'), auteurs.join(' | '))
  assert.ok(
    auteurs.some((a) => a.endsWith(':Bob')),
    auteurs.join(' | ')
  )
})

test('écart 15 — taper sur un mot en italique garde l’italique', () => {
  const em = schema.marks.em.create()
  const d = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Le chat '), schema.text('noir', [em]), schema.text(' dort.')]),
  ])
  const e = editeur(d)
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4)).taper('roux')
  let italique = ''
  e.doc.descendants((n) => {
    if (n.isText && n.marks.some((m) => m.type.name === 'insertion') && n.marks.some((m) => m.type.name === 'em'))
      italique += n.text
  })
  assert.equal(italique, 'roux')
})

test('écart 15 — taper sur le texte d’un lien garde le lien', () => {
  const lien = schema.marks.link.create({ href: 'https://exemple.fr' })
  const d = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('Le chat '), schema.text('noir', [lien]), schema.text(' dort.')]),
  ])
  const e = editeur(d)
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4)).taper('roux')
  let lie = ''
  e.doc.descendants((n) => {
    if (n.isText && n.marks.some((m) => m.type.name === 'insertion') && n.marks.some((m) => m.type.name === 'link'))
      lie += n.text
  })
  assert.equal(lie, 'roux')
})

test('écart 13 — touche morte sur une sélection : un seul remplacement', () => {
  const e = editeur(doc('Le chat noir dort.'))
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4))
  // La composition : « ^ » provisoire, puis remplacé par « ê ».
  e.remplacer('^')
  const p = e.state.selection.from
  e.view.dispatch(e.state.tr.insertText('ê', p - 1, p))
  e.taper('tre')
  assert.equal(lire(e.doc), 'Le chat [-noir-]{+être+} dort.')
  const mods = listChanges(e.doc)
  assert.equal(mods.length, 1, mods.map((m) => m.type).join(', '))
  assert.equal(mods[0].type, 'remplacement')
})

test('écart 13 — sélection effacée puis frappe : un seul remplacement', () => {
  const e = editeur(doc('Le chat noir dort.'))
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4))
    .effacerAvant()
    .taper('roux')
  const mods = listChanges(e.doc)
  assert.equal(mods.length, 1, mods.map((m) => `${m.type}`).join(', '))
  assert.equal(mods[0].type, 'remplacement')
})

test('écart 13 — retours arrière lettre à lettre puis frappe : un seul remplacement', () => {
  const e = editeur(doc('Le chat noir dort.'))
  e.selection(pos(e, 'noir', 4))
  for (let i = 0; i < 4; i++) e.effacerAvant()
  e.taper('roux')
  const mods = listChanges(e.doc)
  assert.equal(mods.length, 1, mods.map((m) => `${m.type}`).join(', '))
  assert.equal(mods[0].type, 'remplacement')
})

test('écart 13 — taper plus tard ailleurs ne s’apparie pas avec une suppression lointaine', () => {
  const e = editeur(doc('Le chat noir dort sur le tapis.'))
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4)).effacerAvant()
  e.selection(pos(e, 'tapis', 5)).taper(' rouge')
  assert.equal(listChanges(e.doc).length, 2)
})

test('écart 8 — effacer une sélection déjà barrée ne change rien', () => {
  const e = editeur(doc('Le chat noir dort.'))
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4)).effacerAvant()
  const avant = lire(e.doc)
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4)).effacerAvant()
  assert.equal(lire(e.doc), avant)
  assert.equal(e.texte(), 'Le chat noir dort.')
})

test('non-régression — remplacement simple, une seule carte', () => {
  const e = editeur(doc('Le chat noir dort.'))
  e.selection(pos(e, 'noir'), pos(e, 'noir', 4)).taper('blanc')
  assert.equal(lire(e.doc), 'Le chat [-noir-]{+blanc+} dort.')
  assert.equal(listChanges(e.doc).length, 1)
  e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.doc, 1)))
})
