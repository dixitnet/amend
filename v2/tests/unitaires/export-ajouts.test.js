// Les ajouts du 11/11/2026 aux exports (comparaison v1 / v2, points 6, 8, 18
// et 19) : table des matières, saut de page et exposant, en Typst et en
// Markdown ; le compteur du texte de base.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BlockNoteEditor } from '@blocknote/core'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'
import {
  versTypst,
  blocsPourMarkdown,
  poserExposants,
  textesDesBlocs,
  compterBlocs,
  chargerFichier,
} from '../../adaptateurs/blocknote/export.js'
import { MODELES_LIVRE, REPRISE_MODELES } from '../../design/livre.js'

const texte = (t, styles = {}) => ({ type: 'text', text: t, styles })
const modele = { ...MODELES_LIVRE[0], ...REPRISE_MODELES[0].valeurs }

function document() {
  const editeur = BlockNoteEditor.create({ schema: schemaLivre })
  editeur.replaceBlocks(editeur.document, [
    { type: 'heading', props: { level: 1 }, content: [texte('Ouverture')] },
    { type: 'tableDesMatieres', props: { profondeur: 3 } },
    { type: 'paragraph', content: [texte('Au XIX'), texte('e', { exposant: true }), texte(' siècle.')] },
    { type: 'pageBreak' },
    { type: 'heading', props: { level: 2 }, content: [texte('Section')] },
    { type: 'heading', props: { level: 4 }, content: [texte('Trop profond')] },
    { type: 'table', content: { type: 'tableContent', rows: [{ cells: ['a b', 'c'] }] } },
  ])
  return { editeur, blocs: editeur.document }
}

test('Typst : la table à sa place et à sa profondeur, le saut de page, l’exposant', async () => {
  const { editeur, blocs } = document()
  const { source } = await versTypst(editeur, blocs, modele, { titre: 'Essai', langue: 'fr' })
  const corps = source.slice(source.indexOf('#heading(level: 1)'))
  assert.ok(corps.indexOf('#outline(depth: 3)') > corps.indexOf('Ouverture'))
  assert.ok(corps.indexOf('#outline(depth: 3)') < corps.indexOf('siècle'))
  assert.match(corps, /#"Au XIX"#super\("e"\)#" siècle\."/)
  assert.match(corps, /#pagebreak\(\)\n\n#heading\(level: 2\)/)
})

test('Markdown : la table devient la liste de ses titres ; plus de saut de page ; exposant marqué', () => {
  const { blocs } = document()
  const prets = blocsPourMarkdown(blocs, { titreTable: 'Table des matières' })
  const types = prets.map((b) => b.type)
  assert.ok(!types.includes('pageBreak') && !types.includes('tableDesMatieres'))
  const liste = prets.filter((b) => b.type === 'bulletListItem').map((b) => b.content[0].text)
  assert.deepEqual(liste, ['Ouverture', 'Section'])
  assert.equal(prets[1].content[0].text, 'Table des matières')
  const para = prets.find((b) => b.type === 'paragraph' && b.content.length === 3)
  assert.equal(poserExposants(para.content.map((c) => c.text).join('')), 'Au XIX<sup>e</sup> siècle.')
  assert.ok(!('exposant' in para.content[1].styles))
  // Sans titre donné, la liste seule.
  assert.equal(blocsPourMarkdown(blocs)[1].type, 'bulletListItem')
})

test('compteur : texte des blocs, cellules comprises, sans la table ni le saut de page', () => {
  const { blocs } = document()
  assert.deepEqual(textesDesBlocs(blocs), ['Ouverture', 'Au XIXe siècle.', 'Section', 'Trop profond', 'a b', 'c'])
  assert.deepEqual(compterBlocs(blocs), { signes: 9 + 15 + 7 + 12 + 3 + 1, mots: 1 + 3 + 1 + 2 + 2 + 1 })
})

test('exposant au Markdown : dans une cellule de tableau aussi ; une marque tapée dans le texte disparaît (audit du 11/11/2026)', () => {
  const blocs = [
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [
          {
            cells: [
              {
                type: 'tableCell',
                content: [
                  { type: 'text', text: 'XIX', styles: {} },
                  { type: 'text', text: 'e', styles: { exposant: true } },
                ],
              },
            ],
          },
        ],
      },
      children: [],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'abc', styles: {} }], children: [] },
  ]
  const prets = blocsPourMarkdown(blocs)
  const cellule = prets[0].content.rows[0].cells[0].content
  assert.equal(poserExposants(cellule.map((c) => c.text).join('')), 'XIX<sup>e</sup>')
  assert.equal(prets[1].content[0].text, 'abc')
})

test('image de l’export : une réponse en erreur, un réseau en échec ou un délai dépassé donnent un fichier vide', async () => {
  const fetchInitial = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('x', { status: 403 })
    assert.equal((await chargerFichier('http://x/a')).size, 0)
    globalThis.fetch = async () => {
      throw new TypeError('réseau')
    }
    assert.equal((await chargerFichier('http://x/a')).size, 0)
    let signal = null
    globalThis.fetch = async (_, o) => ((signal = o.signal), new Response('abc', { status: 200 }))
    assert.equal((await chargerFichier('http://x/a')).size, 3)
    assert.ok(signal instanceof AbortSignal, 'un délai est posé')
  } finally {
    globalThis.fetch = fetchInitial
  }
})

test('Markdown : le titre en paragraphe gras, le sous-titre en italique, hors de la table des matières (12/11/2026)', () => {
  const editeur = BlockNoteEditor.create({ schema: schemaLivre })
  editeur.replaceBlocks(editeur.document, [
    { type: 'titre', content: [texte('Mon livre')] },
    { type: 'sousTitre', content: [texte('Un essai')] },
    { type: 'tableDesMatieres', props: { profondeur: 2 } },
    { type: 'heading', props: { level: 1 }, content: [texte('Chapitre')] },
  ])
  const prets = blocsPourMarkdown(editeur.document)
  // Des paragraphes, pas des titres : ils ne deviennent pas « # » ailleurs.
  assert.deepEqual(
    prets.slice(0, 2).map((b) => [b.type, b.content[0].text, b.content[0].styles]),
    [
      ['paragraph', 'Mon livre', { bold: true }],
      ['paragraph', 'Un essai', { italic: true }],
    ],
  )
  // La table ne liste que le chapitre.
  assert.deepEqual(
    blocsPourMarkdown(editeur.document)
      .filter((b) => b.type === 'bulletListItem')
      .map((b) => b.content[0].text),
    ['Chapitre'],
  )
})

test('notes de bas de page (12/11/2026) : `footnote` de Typst, `[^n]` en Markdown avec le texte en fin de fichier', async () => {
  const editeur = BlockNoteEditor.create({ schema: schemaLivre })
  editeur.replaceBlocks(editeur.document, [
    {
      type: 'paragraph',
      content: [texte('La ville'), { type: 'note', props: { texte: 'Première note.' } }, texte(' existe.')],
    },
    { type: 'paragraph', content: [texte('Encore'), { type: 'note', props: { texte: 'Seconde « note ».' } }] },
  ])
  const { source } = await versTypst(editeur, editeur.document, modele)
  assert.match(source, /#"La ville"#footnote\[#"Première note\."\]#" existe\."/)
  assert.match(source, /#footnote\[#"Seconde « note »\."\]/)
  const prets = blocsPourMarkdown(editeur.document)
  assert.equal(prets.length, 4, 'les deux paragraphes, puis les deux notes')
  const md = poserExposants(prets.map((b) => b.content.map((c) => c.text).join('')).join('\n'))
  assert.equal(md, 'La ville[^1] existe.\nEncore[^2]\n[^1]: Première note.\n[^2]: Seconde « note ».')
})

test('une note dans une cellule de tableau garde son appel et son texte en Markdown', () => {
  const editeur = BlockNoteEditor.create({ schema: schemaLivre })
  editeur.replaceBlocks(editeur.document, [
    {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: [[texte('Case'), { type: 'note', props: { texte: 'Note de case.' } }], 'b'] }],
      },
    },
  ])
  const prets = blocsPourMarkdown(editeur.document)
  const cellule = prets[0].content.rows[0].cells[0]
  const contenu = Array.isArray(cellule) ? cellule : cellule.content
  assert.equal(poserExposants(contenu.map((c) => c.text).join('')), 'Case[^1]')
  assert.equal(poserExposants(prets.at(-1).content[0].text), '[^1]: Note de case.')
})
