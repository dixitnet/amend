// T2 : l'adaptateur BlockNote côté serveur, sans navigateur ni service.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from '@y/y'
import { lireBlocs, ecrireBlocs, texteDesBlocs, blocsATexteDe } from '../../adaptateurs/blocknote/serveur.js'
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

test('tableau réel : le texte des cellules est gardé par texteDesBlocs, mais Margo (blocsATexteDe) ne le voit pas', () => {
  const t = (text, styles = {}) => ({ type: 'text', text, styles })
  const etat = ecrireBlocs([
    { id: 'avant', type: 'paragraph', content: [t('Avant')] },
    {
      id: 'tab',
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: [[t('A1')], [t('B1')]] }, { cells: [[t('A2 '), t('gras', { bold: true })], [t('B2')]] }],
      },
    },
    { id: 'apres', type: 'paragraph', content: [t('Après')] },
  ])
  const blocs = lireBlocs(etat)
  // Relu, chaque cellule est un objet `tableCell` dont le texte est dans `content`.
  assert.equal(blocs[1].content.rows[1].cells[0].type, 'tableCell')
  assert.equal(texteDesBlocs(blocs), 'Avant\nA1\tB1\nA2 gras\tB2\nAprès')
  // Comportement actuel (à signaler) : le texte donné à Margo saute les tableaux, dont aucune
  // cellule n'est donc relue ni corrigée (serveur.js, blocsATexte : seul un bloc dont le
  // premier enfant est un bloc de texte compte).
  assert.deepEqual(blocsATexteDe(etat), [
    { id: 'avant', type: 'paragraph', niveau: null, texte: 'Avant' },
    { id: 'apres', type: 'paragraph', niveau: null, texte: 'Après' },
  ])
})

test('contrat : le schéma du livre a la marque « link » dont la typographie protège les adresses', async () => {
  // Constat A6 de l'audit complet (08/11/2026) : le nom vient du schéma par défaut de BlockNote.
  const { BlockNoteEditor } = await import('@blocknote/core')
  const { schemaLivre } = await import('../../adaptateurs/blocknote/schema.js')
  assert.ok(BlockNoteEditor.create({ schema: schemaLivre }).pmSchema.marks.link)
})

/** Les passages marqués d'un fil, dans l'ordre du texte. */
async function passagesMarques(etat) {
  const Y = await import('@y/y')
  const { ynodeToPmnode } = await import('@y/prosemirror')
  const { blockNoteTransformer } = await import('@blocknote/core/y')
  const { BlockNoteEditor } = await import('@blocknote/core')
  const { CommentsExtension, DefaultThreadStoreAuth } = await import('@blocknote/core/comments')
  const { YjsThreadStore } = await import('@blocknote/core/y')
  const { schemaLivre } = await import('../../adaptateurs/blocknote/schema.js')
  const schema = BlockNoteEditor.create({
    schema: schemaLivre,
    extensions: [
      CommentsExtension({
        threadStore: new YjsThreadStore('t', new Y.Doc().get('f'), new DefaultThreadStoreAuth('t', 'comment')),
        resolveUsers: async () => [],
      }),
    ],
  }).pmSchema
  const doc = new Y.Doc()
  Y.applyUpdate(doc, etat)
  const passages = []
  ynodeToPmnode(doc.get('doc'), schema, { transformer: blockNoteTransformer }).descendants((n) => {
    const m = n.isText && n.marks.find((x) => x.type.name === 'comment')
    if (m) passages.push([m.attrs.threadId, n.text])
  })
  return passages
}

test('ancre d’un commentaire : posée sur le passage, sans toucher au texte ni aux styles', async () => {
  const { ancreCommentaire } = await import('../../adaptateurs/blocknote/serveur.js')
  const Y = await import('@y/y')
  const t = (text, styles = {}) => ({ type: 'text', text, styles })
  const etat = ecrireBlocs([
    { id: 'b1', type: 'paragraph', content: [t('Il faisait nuit sur la ville.')] },
    { id: 'b2', type: 'paragraph', content: [t('Second '), t('paragraphe', { italic: true })] },
  ])
  const r = ancreCommentaire(etat, {
    debut: { blocId: 'b1', decalage: 3 },
    fin: { blocId: 'b1', decalage: 15 },
    citation: 'faisait nuit',
    fil: 'f1',
  })
  assert.equal(r.code, 'ok')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, etat)
  Y.applyUpdate(doc, r.mise)
  let apres = Y.encodeStateAsUpdate(doc)
  const r2 = ancreCommentaire(apres, {
    debut: { blocId: 'b1', decalage: 23 },
    fin: { blocId: 'b2', decalage: 12 },
    citation: 'ville.\nSecond parag',
    fil: 'f2',
  })
  assert.equal(r2.code, 'ok')
  Y.applyUpdate(doc, r2.mise)
  apres = Y.encodeStateAsUpdate(doc)
  assert.deepEqual(await passagesMarques(apres), [
    ['f1', 'faisait nuit'],
    ['f2', 'ville.'],
    ['f2', 'Second '],
    ['f2', 'parag'],
  ])
  assert.equal(texteDesBlocs(lireBlocs(apres)), 'Il faisait nuit sur la ville.\nSecond paragraphe')
  assert.equal(lireBlocs(apres)[1].content[1].styles.italic, true)
})

test('ancre d’un commentaire : refusée avec un code (vide, périmée, bloc absent, données piégées)', async () => {
  const { ancreCommentaire } = await import('../../adaptateurs/blocknote/serveur.js')
  const etat = ecrireBlocs([{ id: 'b1', type: 'paragraph', content: 'Il faisait nuit.' }])
  const p = (blocId, decalage) => ({ blocId, decalage })
  const cas = [
    [{ debut: p('b1', 3), fin: p('b1', 3), citation: '', fil: 'f' }, 'ancre-vide'],
    [{ debut: p('b1', 3), fin: p('b1', 10), citation: 'autre', fil: 'f' }, 'ancre-perimee'],
    [{ debut: p('b1', 3), fin: p('b1', 999), citation: 'x', fil: 'f' }, 'ancre-perimee'],
    [{ debut: p('zz', 0), fin: p('zz', 1), citation: 'I', fil: 'f' }, 'bloc-introuvable'],
    [{ debut: p('b1', -1), fin: p('b1', 2), citation: 'Il', fil: 'f' }, 'ancre-invalide'],
    [{ debut: p('b1', 0), fin: p('b1', 2), citation: 'Il' }, 'ancre-invalide'],
    [null, 'ancre-invalide'],
    [{ debut: p('__proto__', 0), fin: p('b1', 2), citation: 'Il', fil: 'f' }, 'bloc-introuvable'],
  ]
  for (const [ancre, code] of cas) assert.equal(ancreCommentaire(etat, ancre).code, code, JSON.stringify(ancre))
  assert.throws(() => ancreCommentaire(new Uint8Array([1, 2, 3]), cas[1][0]), { code: 'document-illisible' })
})
