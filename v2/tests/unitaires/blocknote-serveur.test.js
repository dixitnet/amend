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

test('texte brut : liens et cellules de tableau compris', () => {
  const t = (text) => ({ type: 'text', text, styles: {} })
  const blocs = [
    { type: 'paragraph', content: [t('Appel '), { type: 'link', href: 'https://exemple.fr', content: [t('fin')] }] },
    { type: 'table', content: { type: 'tableContent', rows: [{ cells: [[t('A1')], [t('B1')]] }] } },
  ]
  assert.equal(texteDesBlocs(lireBlocs(ecrireBlocs(blocs))), 'Appel fin\nA1\tB1')
})

test('contrat : le schéma du livre a la marque « link » dont la typographie protège les adresses', async () => {
  // Constat A6 de l'audit complet (08/11/2026) : le nom vient du schéma par défaut de BlockNote.
  const { BlockNoteEditor } = await import('@blocknote/core')
  const { schemaLivre } = await import('../../adaptateurs/blocknote/schema.js')
  assert.ok(BlockNoteEditor.create({ schema: schemaLivre }).pmSchema.marks.link)
})
