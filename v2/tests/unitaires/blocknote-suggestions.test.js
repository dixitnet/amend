// Le suivi des auteurs des suggestions (adaptateurs/blocknote/suggestions.js) :
// quand y/hub ne répond pas, un nouvel essai, un seul, sans attendre le
// prochain changement (audit du 10/11/2026).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BlockNoteEditor } from '@blocknote/core'
import { YAttributionMarksExtension } from '@blocknote/core/y'
import { suivreAuteurs, listeDesSuggestions } from '../../adaptateurs/blocknote/suggestions.js'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

test('y/hub muet : un seul nouvel essai, puis on attend le prochain changement', async () => {
  let demandes = 0
  const ecouteurs = new Set()
  const contexte = {
    suggestions: {
      fragment: null,
      auteurs: async () => (demandes++, null),
      doc: { on: (_, f) => ecouteurs.add(f), off: (_, f) => ecouteurs.delete(f) },
    },
  }
  const arreter = suivreAuteurs(contexte, () => assert.fail('rien à transmettre sans auteurs'), 5)
  await attendre(80)
  assert.equal(demandes, 2, 'la demande du départ, puis un seul nouvel essai')
  for (const f of ecouteurs) f(null, 'quelqu’un')
  await attendre(80)
  assert.equal(demandes, 4, 'un changement relance une demande, et son nouvel essai')
  arreter()
  assert.equal(ecouteurs.size, 0)
})

// --- La liste des suggestions, sur un vrai éditeur BlockNote sans réseau ------

const AJOUT = 'y-attributed-insert'
const SUPPRESSION = 'y-attributed-delete'

/** Un éditeur d'un paragraphe, dont des morceaux portent les marques que pose
 * l'afficheur de Yjs : `[marque, début, fin, auteur]`, positions dans le texte. */
function monter(texte, marques) {
  const editeur = BlockNoteEditor.create({ schema: schemaLivre, extensions: [YAttributionMarksExtension()] })
  editeur.replaceBlocks(editeur.document, [{ type: 'paragraph', content: texte }])
  editeur.transact((tr) => {
    // Le texte du paragraphe commence à la position 3 (groupe, conteneur, paragraphe).
    for (const [marque, de, a, auteur] of marques)
      tr.addMark(3 + de, 3 + a, editeur.pmSchema.marks[marque].create({ userIds: auteur ? [auteur] : null }))
  })
  return editeur
}

test('liste des suggestions : un ajout', () => {
  const [s, ...autres] = listeDesSuggestions(monter('Un chat noir', [[AJOUT, 3, 7, 'a']]))
  assert.equal(autres.length, 0)
  assert.deepEqual(s, {
    type: 'ajout',
    auteur: 'a',
    avant: '',
    apres: 'chat',
    debut: 6,
    fin: 10,
    plage: { debut: 6, fin: 10 },
  })
})

test('liste des suggestions : une suppression', () => {
  const [s, ...autres] = listeDesSuggestions(monter('Un chat noir', [[SUPPRESSION, 3, 7, 'a']]))
  assert.equal(autres.length, 0)
  assert.deepEqual([s.type, s.auteur, s.avant, s.apres], ['suppression', 'a', 'chat', ''])
})

test('liste des suggestions : une suppression et un ajout du même auteur qui se touchent font un remplacement', () => {
  const [s, ...autres] = listeDesSuggestions(
    monter('Un chatchien noir', [
      [SUPPRESSION, 3, 7, 'a'],
      [AJOUT, 7, 12, 'a'],
    ]),
  )
  assert.equal(autres.length, 0)
  assert.deepEqual([s.type, s.auteur, s.avant, s.apres], ['remplacement', 'a', 'chat', 'chien'])
  assert.deepEqual(s.plage, { debut: s.debut, fin: s.fin })
})

test('liste des suggestions : deux auteurs qui se touchent font deux lignes, dans l’ordre du texte', () => {
  const liste = listeDesSuggestions(
    monter('Un chatchien noir', [
      [SUPPRESSION, 3, 7, 'a'],
      [AJOUT, 7, 12, 'b'],
    ]),
  )
  assert.deepEqual(
    liste.map((s) => [s.type, s.auteur, s.avant, s.apres]),
    [
      ['suppression', 'a', 'chat', ''],
      ['ajout', 'b', '', 'chien'],
    ],
  )
  assert.ok(liste[0].fin <= liste[1].debut)
})

test('liste des suggestions : deux ajouts d’un même auteur qui se touchent font une ligne ; sans auteur connu, auteur null', () => {
  const liste = listeDesSuggestions(
    monter('Un chatchien noir', [
      [AJOUT, 3, 7, null],
      [AJOUT, 7, 12, null],
    ]),
  )
  assert.equal(liste.length, 1)
  assert.deepEqual([liste[0].auteur, liste[0].apres], [null, 'chatchien'])
  assert.deepEqual(listeDesSuggestions(monter('Aucune suggestion', [])), [])
})

test('y/hub qui échoue (rejet) : même unique nouvel essai que pour une réponse nulle', async () => {
  let demandes = 0
  const contexte = {
    suggestions: {
      fragment: null,
      auteurs: async () => {
        demandes++
        throw new Error('y/hub : 500')
      },
      doc: { on: () => {}, off: () => {} },
    },
  }
  const arreter = suivreAuteurs(contexte, () => assert.fail('rien à transmettre sans auteurs'), 5)
  await attendre(80)
  assert.equal(demandes, 2, 'la demande du départ, puis un seul nouvel essai')
  arreter()
})
