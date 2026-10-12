// Comparer et restaurer (11/10/2026, server/comparaison.js).
// Ce qui est vérifié : l'alignement des paragraphes, la comparaison rendue à
// l'écran, et surtout que restaurer **ne réécrit pas l'histoire** : le
// résultat est un suivi de modifications qui, accepté en entier, redonne la
// version visée — et refusé en entier, laisse le document comme il était.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import {
  aligner,
  blocsDeInstantane,
  blocsPlats,
  comparer,
  planDeRestauration,
  restaurerEnAvant,
} from '../comparaison.js'
import { blocsDuDocument } from '../agentTexte.js'

const AUTEUR = { name: 'Sylvain', color: '#c0392b' }

function docDe(paragraphes) {
  const y = new Y.Doc()
  const f = y.getXmlFragment('prosemirror-content')
  for (const t of paragraphes) {
    const el = new Y.XmlElement('paragraph')
    f.push([el])
    const xt = new Y.XmlText()
    el.push([xt])
    xt.insert(0, t)
  }
  return y
}
const blocs = (paragraphes) =>
  paragraphes.map((texte, k) => ({ n: k + 1, nom: 'paragraph', niveau: null, contexte: [], texte }))

/** Ce qu'on lit une fois tout accepté / tout refusé, bloc par bloc. */
function lectures(ydoc) {
  return blocsDuDocument(ydoc).map((b) => {
    let accepte = ''
    let refuse = ''
    for (const s of b.segments) {
      if (!s.attrs.deletion) accepte += s.texte
      if (!s.attrs.insertion) refuse += s.texte
    }
    return { accepte, refuse, bloc: b }
  })
}

test('l’alignement reconnaît ce qui est identique, modifié, ajouté, supprimé', () => {
  const a = blocs([
    'Introduction.',
    'Le chômage augmente en 2020.',
    'Un paragraphe qui disparaît entièrement.',
    'Conclusion.',
  ])
  const b = blocs(['Introduction.', 'Le chômage augmente nettement en 2020.', 'Conclusion.', 'Annexe nouvelle.'])
  const { ops, approximatif } = aligner(a, b)
  assert.equal(approximatif, false)
  assert.deepEqual(
    ops.map((o) => o.type),
    ['egal', 'modifie', 'supprime', 'egal', 'ajoute']
  )
  assert.deepEqual(ops[1], { type: 'modifie', i: 1, j: 1 })
})

test('deux documents identiques : rien à montrer', () => {
  const a = blocs(['un', 'deux', 'trois'])
  const c = comparer(a, blocs(['un', 'deux', 'trois']))
  assert.deepEqual(c.changements, [])
  assert.equal(c.identiques, 3)
})

test('la comparaison ne rend que les blocs qui diffèrent', () => {
  const c = comparer(blocs(['a', 'b', 'c', 'd']), blocs(['a', 'b', 'tout autre chose', 'd']))
  assert.equal(c.identiques, 3)
  assert.deepEqual(
    c.changements.map((x) => x.type),
    ['supprime', 'ajoute'],
    'deux blocs sans rapport : l’un disparaît, l’autre apparaît'
  )
  const grand = comparer(
    blocs(['x', 'Le texte change de manière assez limitée.']),
    blocs(['x', 'Le texte change de manière très limitée.'])
  )
  assert.equal(grand.changements.length, 1)
  assert.equal(grand.changements[0].type, 'modifie')
  assert.equal(grand.changements[0].avant.n, 2)
})

test('un cœur trop gros pour l’alignement exact est signalé approximatif', () => {
  const grand = (prefixe) => Array.from({ length: 2200 }, (_, k) => `${prefixe} ${k}`)
  const { approximatif } = aligner(blocs(grand('a')), blocs(grand('b')))
  assert.equal(approximatif, true)
})

test('un document lu depuis un instantané donne ses blocs', () => {
  const y = docDe(['Premier.', 'Second.'])
  const lus = blocsDeInstantane(Y.encodeStateAsUpdate(y))
  assert.deepEqual(
    lus.map((b) => b.texte),
    ['Premier.', 'Second.']
  )
})

test('restaurer propose les changements qui ramènent la version, sans toucher au reste', () => {
  const version = ['Introduction.', 'Le chômage augmente en 2020.', 'Un paragraphe supprimé depuis.', 'Conclusion.']
  const aujourdhui = ['Introduction.', 'Le chômage augmente nettement en 2020.', 'Conclusion.', 'Un ajout récent.']
  const y = docDe(aujourdhui)
  const r = restaurerEnAvant(y, blocs(version), AUTEUR)
  assert.deepEqual(r.stats, { modifies: 1, ajoutes: 1, supprimes: 1, identiques: 2 })
  assert.deepEqual(r.refuses, [])

  const lu = lectures(y)
  // Accepté en entier : exactement la version visée.
  assert.deepEqual(
    lu.map((l) => l.accepte),
    ['Introduction.', 'Le chômage augmente en 2020.', 'Un paragraphe supprimé depuis.', 'Conclusion.', '']
  )
  // Refusé en entier : le document d'avant, intact (le bloc ajouté en suivi disparaît).
  assert.deepEqual(
    lu.map((l) => l.refuse).filter((t) => t !== ''),
    aujourdhui
  )
})

test('les propositions portent l’auteur de la restauration', () => {
  const y = docDe(['Bonjour le monde.'])
  restaurerEnAvant(y, blocs(['Bonsoir le monde.']), AUTEUR)
  const segs = blocsDuDocument(y)[0].segments
  assert.ok(segs.some((s) => s.attrs.insertion && s.attrs.insertion.user === 'Sylvain'))
  assert.ok(segs.some((s) => s.attrs.deletion && s.attrs.deletion.user === 'Sylvain'))
})

test('restaurer un document déjà identique ne propose rien', () => {
  const y = docDe(['Un.', 'Deux.'])
  const avant = Y.encodeStateAsUpdate(y)
  const r = restaurerEnAvant(y, blocs(['Un.', 'Deux.']), AUTEUR)
  assert.deepEqual(r.stats, { modifies: 0, ajoutes: 0, supprimes: 0, identiques: 2 })
  assert.deepEqual(Y.encodeStateAsUpdate(y), avant, 'aucune écriture')
})

test('un bloc trop long pour une proposition est signalé, pas silencieusement oublié', () => {
  const long = 'mot '.repeat(600) // 2400 signes
  const plan = planDeRestauration(blocs([long]), blocs([long + 'fin']))
  assert.equal(plan.remplacements.length, 0)
  assert.equal(plan.ignores.length, 1)
  assert.match(plan.ignores[0].raison, /trop long/)
})

test('un passage déjà en attente est refusé et rapporté, le reste passe', () => {
  const y = docDe(['Premier paragraphe stable.', 'Second à modifier.'])
  // Une proposition en attente sur le second bloc.
  const b2 = blocsDuDocument(y)[1]
  b2.segments[0].xt.format(0, 6, { deletion: { user: 'Autre', userColor: '#000', ts: 1, groupe: null } })
  const r = restaurerEnAvant(y, blocs(['Premier paragraphe modifié.', 'Second à modifier autrement.']), AUTEUR)
  assert.equal(r.stats.modifies + r.refuses.length, 2, 'chaque bloc est soit modifié, soit refusé avec sa raison')
  assert.ok(r.refuses.every((x) => x.raison))
  // Rien n'a été écrit dans la proposition de l'autre.
  const seg = blocsDuDocument(y)[1].segments.find((s) => s.attrs.deletion)
  assert.equal(seg.attrs.deletion.user, 'Autre')
})

test('blocsPlats rend numéros, types et texte', () => {
  const lus = blocsPlats(docDe(['a', 'b']))
  assert.deepEqual(
    lus.map((b) => [b.n, b.nom, b.texte]),
    [
      [1, 'paragraph', 'a'],
      [2, 'paragraph', 'b'],
    ]
  )
})
