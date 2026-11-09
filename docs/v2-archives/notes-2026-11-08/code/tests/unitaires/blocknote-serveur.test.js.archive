// T2 : l'adaptateur BlockNote côté serveur, sans navigateur ni service.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from '@y/y'
import { lireBlocs, ecrireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

test('aller-retour : un paragraphe écrit est relu à l’identique', () => {
  const etat = ecrireBlocs([{ type: 'paragraph', content: 'Bonjour, élégance.' }])
  assert.equal(texteDesBlocs(lireBlocs(etat)), 'Bonjour, élégance.')
})

test('aller-retour des textes piégés, un par paragraphe', () => {
  for (const { texte, raison } of piegees.textes) {
    const lu = texteDesBlocs(lireBlocs(ecrireBlocs([{ type: 'paragraph', content: texte }])))
    // Le texte d'un paragraphe ne garde pas les sauts de ligne bruts : on
    // compare sans eux ; tout le reste doit être conservé tel quel.
    assert.equal(lu.replace(/\n/g, ''), texte.replace(/\n/g, ''), raison)
  }
})

test('document vide, et document jamais écrit : aucun bloc, aucune erreur', () => {
  assert.deepEqual(texteDesBlocs(lireBlocs(ecrireBlocs([]))), '')
  assert.equal(texteDesBlocs(lireBlocs(Y.encodeStateAsUpdate(new Y.Doc()))), '')
})

test('état illisible : erreur de code document-illisible', () => {
  assert.throws(() => lireBlocs(new Uint8Array([1, 2, 3, 250, 251])), { code: 'document-illisible' })
})

test('schéma du livre : chaque bloc et style retenu fait l’aller-retour', () => {
  const texte = (t, styles = {}) => [{ type: 'text', text: t, styles }]
  const blocs = [
    { type: 'heading', props: { level: 1 }, content: texte('Chapitre') },
    { type: 'heading', props: { level: 3 }, content: texte('Section') },
    {
      type: 'paragraph',
      content: [
        ...texte('gras ', { bold: true }),
        ...texte('italique ', { italic: true }),
        ...texte('souligné ', { underline: true }),
        ...texte('barré', { strike: true }),
      ],
    },
    { type: 'quote', content: texte('Citation') },
    { type: 'bulletListItem', content: texte('puce') },
    { type: 'numberedListItem', content: texte('numéro') },
    { type: 'divider' },
  ]
  const relus = lireBlocs(ecrireBlocs(blocs))
  assert.deepEqual(
    relus.map((b) => b.type),
    ['heading', 'heading', 'paragraph', 'quote', 'bulletListItem', 'numberedListItem', 'divider'],
  )
  assert.deepEqual(
    relus[2].content.map((c) => c.styles),
    [{ bold: true }, { italic: true }, { underline: true }, { strike: true }],
  )
})

test('schéma du livre : blocs et styles retirés refusés avec un code, jamais une erreur interne', () => {
  for (const blocs of [
    [{ type: 'video', props: { url: 'v.mp4' } }],
    [{ type: 'codeBlock', content: 'x' }],
    [{ type: 'checkListItem', content: 'x' }],
    [{ type: 'paragraph', content: [{ type: 'text', text: 'c', styles: { code: true } }] }],
    [{ type: 'paragraph', content: [{ type: 'text', text: 'c', styles: { textColor: 'red' } }] }],
  ])
    assert.throws(() => ecrireBlocs(blocs), { code: 'blocs-invalides' }, JSON.stringify(blocs))
})

test('note de bas de page : texte riche, aller-retour à l’identique, notes dans l’ordre du texte', async () => {
  const { notesDuDocument } = await import('../../extensions/note/index.js')
  const t = (text, styles = {}) => ({ type: 'text', text, styles })
  const blocs = [
    {
      type: 'paragraph',
      content: [
        t('Appel'),
        { type: 'note', content: [t('Voir '), t('Histoire des gares', { italic: true }), t(', p. 12.')] },
        t(' suite'),
        { type: 'note', content: [t('Seconde.')] },
      ],
    },
    { type: 'bulletListItem', content: [t('Liste'), { type: 'note', content: [t('Troisième.')] }] },
  ]
  const relus = lireBlocs(ecrireBlocs(blocs))
  const note = relus[0].content[1]
  assert.equal(note.type, 'note')
  assert.deepEqual(note.content, [t('Voir '), t('Histoire des gares', { italic: true }), t(', p. 12.')])
  assert.deepEqual(
    notesDuDocument(relus).map((n) => n.map((m) => m.texte).join('')),
    ['Voir Histoire des gares, p. 12.', 'Seconde.', 'Troisième.'],
  )
  assert.equal(notesDuDocument(relus)[0][1].styles.italic, true)
})

test('note de bas de page dans une cellule de tableau : relue et listée', async () => {
  // Constat A2 de l'audit partiel (Qwen 3.5, 08/11/2026) : cas non couvert.
  const { notesDuDocument } = await import('../../extensions/note/index.js')
  const t = (text) => ({ type: 'text', text, styles: {} })
  const blocs = [
    { type: 'paragraph', content: [t('Avant'), { type: 'note', content: [t('Première.')] }] },
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: [[t('A'), { type: 'note', content: [t('Dans la cellule.')] }], [t('B')]] }],
      },
    },
  ]
  const relus = lireBlocs(ecrireBlocs(blocs))
  assert.deepEqual(
    notesDuDocument(relus).map((n) => n.map((m) => m.texte).join('')),
    ['Première.', 'Dans la cellule.'],
  )
})

test('texte brut : cellules de tableau et texte des notes compris', () => {
  const t = (text) => ({ type: 'text', text, styles: {} })
  const blocs = [
    { type: 'paragraph', content: [t('Appel'), { type: 'note', content: [t(' (note)')] }, t(' fin')] },
    { type: 'table', content: { type: 'tableContent', rows: [{ cells: [[t('A1')], [t('B1')]] }] } },
  ]
  assert.equal(texteDesBlocs(lireBlocs(ecrireBlocs(blocs))), 'Appel (note) fin\nA1\tB1')
})

test('contrat : le schéma du livre a la marque « link » dont la typographie protège les adresses', async () => {
  // Constat A6 de l'audit complet (08/11/2026) : le nom vient du schéma par défaut de BlockNote.
  const { BlockNoteEditor } = await import('@blocknote/core')
  const { schemaLivre } = await import('../../adaptateurs/blocknote/schema.js')
  assert.ok(BlockNoteEditor.create({ schema: schemaLivre }).pmSchema.marks.link)
})

test('collage : après une note, un guillemet ferme la citation (la note compte comme un objet)', async () => {
  const { BlockNoteEditor } = await import('@blocknote/core')
  const { Fragment } = await import('prosemirror-model')
  const { schemaLivre } = await import('../../adaptateurs/blocknote/schema.js')
  const { typographierFragment } = await import('../../extensions/typographie/index.js')
  const s = BlockNoteEditor.create({ schema: schemaLivre }).pmSchema
  const fragment = Fragment.from([s.text('"cité'), s.nodes.note.create(null, s.text('Source.')), s.text('"')])
  const resultat = typographierFragment(fragment, 'fr')
  assert.equal(resultat.child(0).text, '«\u00A0cité')
  assert.equal(resultat.child(2).text, '\u00A0»')
})
