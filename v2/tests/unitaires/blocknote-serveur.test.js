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

test('tableau : chaque cellule est une unité de texte pour Margo, adressée « tableau/ligne.colonne » (19/11/2026)', () => {
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
  assert.deepEqual(blocsATexteDe(etat), [
    { id: 'avant', type: 'paragraph', niveau: null, texte: 'Avant', notes: [] },
    { id: 'tab/1.1', type: 'tableCell', niveau: null, texte: 'A1', notes: [] },
    { id: 'tab/1.2', type: 'tableCell', niveau: null, texte: 'B1', notes: [] },
    { id: 'tab/2.1', type: 'tableCell', niveau: null, texte: 'A2 gras', notes: [] },
    { id: 'tab/2.2', type: 'tableCell', niveau: null, texte: 'B2', notes: [] },
    { id: 'apres', type: 'paragraph', niveau: null, texte: 'Après', notes: [] },
  ])
})

test('tableau : une correction et une ancre de commentaire se posent dans la bonne cellule (19/11/2026)', async () => {
  const { suggererRemplacements, ancreCommentaire, blocDeLUnite } =
    await import('../../adaptateurs/blocknote/serveur.js')
  const Y = await import('@y/y')
  const t = (text) => ({ type: 'text', text, styles: {} })
  const etat = ecrireBlocs([
    { id: 'avant', type: 'paragraph', content: [t('Avant')] },
    {
      id: 'tab',
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: [[t('Les enfant')], [t('jouent')]] }, { cells: [[t('dans')], [t('la cour')]] }],
      },
    },
  ])
  assert.equal(blocDeLUnite('tab/2.1'), 'tab')
  // Une correction dans la cellule 1.1 : « enfant » → « enfants ».
  const { resultats, mise } = suggererRemplacements(etat, null, [
    { blocId: 'tab/1.1', debut: 4, fin: 10, apres: 'enfants' },
  ])
  assert.deepEqual(resultats, ['posee'])
  assert.deepEqual(
    blocsATexteDe(etat, mise).map((b) => b.texte),
    ['Avant', 'Les enfants', 'jouent', 'dans', 'la cour'],
    'lu avec les suggestions : la cellule corrigée, les autres intactes',
  )
  assert.deepEqual(blocsATexteDe(etat).map((b) => b.texte)[1], 'Les enfant', 'le texte principal ne change pas')
  // Une ancre dans la cellule 2.2.
  const r = ancreCommentaire(etat, {
    debut: { blocId: 'tab/2.2', decalage: 3 },
    fin: { blocId: 'tab/2.2', decalage: 7 },
    citation: 'cour',
    fil: 'f1',
  })
  assert.equal(r.code, 'ok')
  const doc = new Y.Doc()
  Y.applyUpdate(doc, etat)
  Y.applyUpdate(doc, r.mise)
  assert.deepEqual(await passagesMarques(Y.encodeStateAsUpdate(doc)), [['f1', 'cour']])
  assert.equal(
    ancreCommentaire(etat, {
      debut: { blocId: 'tab/9.9', decalage: 0 },
      fin: { blocId: 'tab/9.9', decalage: 1 },
      citation: 'x',
      fil: 'f',
    }).code,
    'bloc-introuvable',
  )
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

test('notes de bas de page (27/11/2026) : lues avec leur place ; ajoutées, remplacées, supprimées en suggestions arbitrables', async () => {
  const { suggererNotes } = await import('../../adaptateurs/blocknote/serveur.js')
  const { ATOME } = await import('../../domaine/index.js')
  const t = (text) => ({ type: 'text', text, styles: {} })
  const note = (texte) => ({ type: 'note', props: { texte } })
  const etat = ecrireBlocs([
    { id: 'p1', type: 'paragraph', content: [t('Un fait'), note('Source A.'), t(' établi.')] },
    { id: 'p2', type: 'paragraph', content: [t('Un autre fait.')] },
  ])
  // Lecture : l'appel tient la place d'un signe ; la note est rendue avec cette place.
  assert.deepEqual(blocsATexteDe(etat), [
    {
      id: 'p1',
      type: 'paragraph',
      niveau: null,
      texte: `Un fait${ATOME} établi.`,
      notes: [{ i: 7, texte: 'Source A.' }],
    },
    { id: 'p2', type: 'paragraph', niveau: null, texte: 'Un autre fait.', notes: [] },
  ])
  // Trois gestes en un appel : remplacer la note de p1, en ajouter une à p2, et un bloc absent.
  const { resultats, mise } = suggererNotes(etat, null, [
    { op: 'remplacer', blocId: 'p1', decalage: 7, texte: 'Source B.' },
    { op: 'ajouter', blocId: 'p2', decalage: 13, texte: 'Voir plus loin.' },
    { op: 'ajouter', blocId: 'absent', decalage: 0, texte: 'x' },
    { op: 'supprimer', blocId: 'p2', decalage: 3 },
  ])
  assert.deepEqual(resultats, ['posee', 'posee', 'bloc', 'structure'])
  // Le texte principal ne change pas ; avec les suggestions, il se lit comme si elles étaient acceptées.
  assert.deepEqual(blocsATexteDe(etat)[0].notes, [{ i: 7, texte: 'Source A.' }])
  const lu = blocsATexteDe(etat, mise)
  assert.deepEqual(lu[0].notes, [{ i: 7, texte: 'Source B.' }])
  assert.equal(lu[0].texte, `Un fait${ATOME} établi.`)
  assert.equal(lu[1].texte, `Un autre fait${ATOME}.`)
  assert.deepEqual(lu[1].notes, [{ i: 13, texte: 'Voir plus loin.' }])
  // Un remplacement est une suppression et un ajout (arbitrables un par un), pas une proposition d'attribut.
  const texte = new Y.Doc()
  const cote = new Y.Doc({ isSuggestionDoc: true })
  Y.applyUpdate(texte, etat)
  Y.applyUpdate(cote, etat)
  const afficheur = Y.createDiffRenderer(texte, cote)
  afficheur.suggestionMode = true
  Y.applyUpdate(cote, mise, 'distant')
  const rendu = JSON.stringify(cote.get('doc').toDeltaDeep({ renderer: afficheur }).toJSON())
  assert.match(rendu, /"attribution":\{[^}]*"delete"/, 'l’ancienne note est une suppression suggérée')
  assert.match(rendu, /"attribution":\{[^}]*"insert"/, 'la nouvelle est un ajout suggéré')
  assert.doesNotMatch(rendu, /"attribution":\{[^}]*"attrs"/, 'pas de proposition d’attribut')
  // Un appel posé juste avant un appel existant, puis juste après : les deux notes se suivent.
  const voisines = suggererNotes(etat, null, [
    { op: 'ajouter', blocId: 'p1', decalage: 7, texte: 'Avant.' },
    { op: 'ajouter', blocId: 'p1', decalage: 8, texte: 'Après.' },
  ])
  assert.deepEqual(voisines.resultats, ['posee', 'posee'])
  assert.deepEqual(
    blocsATexteDe(etat, voisines.mise)[0].notes.map((n) => n.texte),
    ['Avant.', 'Source A.', 'Après.'],
  )
  // Supprimer : la note disparaît de la lecture avec les suggestions.
  const suppression = suggererNotes(etat, null, [{ op: 'supprimer', blocId: 'p1', decalage: 7 }])
  assert.deepEqual(suppression.resultats, ['posee'])
  assert.deepEqual(blocsATexteDe(etat, suppression.mise)[0], {
    id: 'p1',
    type: 'paragraph',
    niveau: null,
    texte: 'Un fait établi.',
    notes: [],
  })
})
