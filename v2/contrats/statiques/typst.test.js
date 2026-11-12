// Contrat de Typst (§ 5 des règles) : un livre de référence, écrit avec le
// schéma du livre, passe par l'export de BlockNote et notre gabarit, et le
// compilateur Typst de BlockNote (WebAssembly) en fait un PDF du format du
// modèle, avec la police du modèle incorporée. Les positions des lignes sur
// la grille sont vérifiées à part (docs/v2-etape-7-plan.md, « Mesures »).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { BlockNoteEditor } from '@blocknote/core'
import { schemaLivre } from '../../adaptateurs/blocknote/schema.js'
import { versTypst, compilerPdf } from '../../adaptateurs/blocknote/export.js'
import { MODELES_LIVRE } from '../../design/livre.js'

const modele = MODELES_LIVRE.find((m) => m.id === 'tat-poche')
// Un éditeur neuf à chaque test : le livre n'y est inséré qu'une fois.
const nouvelEditeur = () => BlockNoteEditor.create({ schema: schemaLivre })
const texte = (t, styles = {}) => ({ type: 'text', text: t, styles })
const paragraphe = 'Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima.'
const BLOCS = [
  { type: 'heading', props: { level: 1 }, content: [texte('Petit conte immoral')] },
  { type: 'paragraph', content: [] },
  {
    type: 'paragraph',
    content: [texte('« Le second [conte] est '), texte('parfaitement', { italic: true }), texte(' immoral. »')],
  },
  ...Array.from({ length: 30 }, () => ({ type: 'paragraph', content: [texte(paragraphe)] })),
  { type: 'heading', props: { level: 2 }, content: [texte('Les crises de l’idéal du progrès')] },
  { type: 'quote', content: [texte('Une citation détachée.')] },
  { type: 'divider' },
  { type: 'bulletListItem', content: [texte('un')] },
  { type: 'bulletListItem', content: [texte('deux', { bold: true })] },
  { type: 'numberedListItem', content: [texte('premier')] },
  { type: 'paragraph', content: [] },
  { type: 'paragraph', content: [texte('Fin # $ * _ \\ " ` < > @ [ ] — é')] },
]
function livre() {
  const editeur = nouvelEditeur()
  editeur.replaceBlocks(editeur.document, BLOCS)
  return { editeur, blocs: editeur.document }
}

const polices = () => modele.polices.map((url) => new Uint8Array(readFileSync(fileURLToPath(url))))
const wasm = () => readFileSync(createRequire(import.meta.url).resolve('@blocknote/xl-typst-compiler/wasm'))

test('la source Typst d’un livre : gabarit du modèle, puis les blocs sans blanc à eux', async () => {
  const { editeur, blocs } = livre()
  const { source } = await versTypst(editeur, blocs, modele, { titre: 'Essai', langue: 'fr' })
  assert.equal(source.match(/#heading\(level: 1\)/g).length, 1, 'le livre une seule fois')
  assert.match(source, /^#set document\(title: "Essai"\)/)
  assert.match(source, /#set text\(font: \("EB Garamond",\), size: 10\.5pt, lang: "fr"/)
  assert.match(source, /#heading\(level: 1\)\[#"Petit conte immoral"\]/)
  // Le premier paragraphe d'un chapitre n'a pas d'alinéa ; les autres en ont.
  assert.match(source, /#amend-sans-alinea\[#"« Le second \[conte\] est "#emph\("parfaitement"\)/)
  assert.match(source, /#heading\(level: 2\)/)
  assert.match(source, /#quote\(block: true\)/)
  assert.match(source, /#amend-blanc/)
  assert.match(source, /#list\(\[#"un"\], \[#strong\("deux"\)\]\)/)
  assert.match(source, /#enum\(\[#"premier"\]\)/)
  // Des paragraphes vides entre deux textes : une ligne blanche, une seule ;
  // après un titre (le paragraphe vide du chapitre), rien.
  const textes = (t) => ({ type: 'paragraph', content: [texte(t)] })
  const vide = { type: 'paragraph', content: [] }
  editeur.replaceBlocks(editeur.document, [
    { type: 'heading', props: { level: 1 }, content: [texte('Titre')] },
    vide,
    textes('Un'),
    vide,
    textes('Deux'),
    vide,
    vide,
    vide,
    textes('Trois'),
    textes('Quatre'),
    vide,
    { type: 'divider' },
    vide,
    textes('Cinq'),
    vide,
    { type: 'pageBreak' },
    vide,
    textes('Six'),
  ])
  const blancs = (await versTypst(editeur, editeur.document, modele)).source
  assert.match(
    blancs,
    /#amend-sans-alinea\[#"Un"\]\s+#amend-blanc\s+#"Deux"\s+#amend-blanc\s+#"Trois"\s+#"Quatre"\s+#amend-blanc\s+#"Cinq"\s+#pagebreak\(\)\s+#"Six"\s*$/,
  )
  // Aucun blanc de BlockNote autour des blocs (il casserait la grille).
  assert.doesNotMatch(source, /inset: \(top/)
  // Le texte est échappé et en forme composée (NFC).
  assert.ok(source.includes('#"Fin # $ * _ \\\\ \\" ` < > @ [ ] — é"'))
})

test('le compilateur Typst de BlockNote en fait un PDF au format du modèle, police incorporée', async () => {
  const { editeur, blocs } = livre()
  const { source, fichiers } = await versTypst(editeur, blocs, modele, { titre: 'Essai', langue: 'fr' })
  const pdf = await compilerPdf(source, { fichiers, polices: polices(), wasm: wasm() })
  const brut = Buffer.from(pdf).toString('latin1')
  assert.ok(brut.startsWith('%PDF-'))
  // 120 × 180 mm = 340,157 × 510,236 pt.
  const formats = [...brut.matchAll(/\/MediaBox ?\[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => m.slice(1).map(Number))
  assert.ok(formats.length >= 2, 'au moins deux pages')
  for (const [l, h] of formats) {
    assert.ok(Math.abs(l - 340.157) < 0.01 && Math.abs(h - 510.236) < 0.01, `format ${l} × ${h}`)
  }
  assert.match(brut, /EBGaramond/)
})

test('table des matières, saut de page et exposant : le PDF se compile (11/11/2026)', async () => {
  const editeur = nouvelEditeur()
  editeur.replaceBlocks(editeur.document, [
    { type: 'tableDesMatieres', props: { profondeur: 2 } },
    { type: 'heading', props: { level: 1 }, content: [texte('Premier chapitre')] },
    { type: 'paragraph', content: [texte('Au XIX'), texte('e', { exposant: true }), texte(' siècle.')] },
    { type: 'pageBreak' },
    { type: 'heading', props: { level: 2 }, content: [texte('Une section')] },
  ])
  const { source, fichiers } = await versTypst(editeur, editeur.document, modele, { titre: 'Essai', langue: 'fr' })
  const pdf = await compilerPdf(source, { fichiers, polices: polices(), wasm: wasm() })
  const brut = Buffer.from(pdf).toString('latin1')
  assert.ok(brut.startsWith('%PDF-'))
  // Trois pages au moins : la table, le chapitre (belle page), le saut de page.
  assert.ok([...brut.matchAll(/\/Type ?\/Page\b/g)].length >= 3)
})

test('titre et sous-titre : centrés dans le flux, hors de la table des matières ; le PDF se compile (12/11/2026)', async () => {
  const editeur = nouvelEditeur()
  editeur.replaceBlocks(editeur.document, [
    { type: 'titre', content: [texte('Mon livre')] },
    { type: 'sousTitre', content: [texte('Un essai')] },
    { type: 'tableDesMatieres', props: { profondeur: 2 } },
    { type: 'heading', props: { level: 1 }, content: [texte('Premier chapitre')] },
    { type: 'paragraph', content: [texte('Texte.')] },
  ])
  const { source, fichiers } = await versTypst(editeur, editeur.document, modele, { titre: 'Essai', langue: 'fr' })
  assert.match(source, /#let amend-titre\(corps\) = .*size: 13pt, weight: 600/)
  assert.match(source, /#let amend-sous-titre\(corps\) = .*size: 13pt, style: "italic"/)
  assert.match(source, /#amend-titre\[#"Mon livre"\]\s+#amend-sous-titre\[#"Un essai"\]/)
  // Hors de la table : ce ne sont pas des titres de Typst.
  assert.equal(source.match(/#heading\(/g).length, 1)
  const pdf = await compilerPdf(source, { fichiers, polices: polices(), wasm: wasm() })
  assert.ok(Buffer.from(pdf).toString('latin1').startsWith('%PDF-'))
})

test('une source Typst fautive donne une erreur de code export-pdf-echoue', async () => {
  await assert.rejects(compilerPdf('#fonction-inconnue()', { polices: polices(), wasm: wasm() }), {
    code: 'export-pdf-echoue',
  })
})

test('un tableau, une image et une image introuvable : le PDF se compile quand même (audit du 10/11/2026)', async () => {
  const { default: http } = await import('node:http')
  // Une image PNG d'un pixel, servie par un faux serveur ; une autre adresse est morte.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  const serveur = http.createServer((req, res) => {
    if (req.url === '/image.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
    res.writeHead(404).end()
  })
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  const adresse = `http://127.0.0.1:${serveur.address().port}`
  try {
    const editeur = nouvelEditeur()
    editeur.replaceBlocks(editeur.document, [
      { type: 'paragraph', content: [texte('Avant le tableau.')] },
      { type: 'table', content: { type: 'tableContent', rows: [{ cells: ['a', 'b'] }, { cells: ['c', 'd'] }] } },
      { type: 'image', props: { url: `${adresse}/image.png`, caption: 'Une image' } },
      { type: 'image', props: { url: `${adresse}/morte.png` } },
      { type: 'paragraph', content: [texte('Après les images.')] },
    ])
    const { source, fichiers } = await versTypst(editeur, editeur.document, modele, { titre: 'Essai', langue: 'fr' })
    assert.match(source, /#"a"\], \[#"b"\]/, 'le tableau est exporté')
    assert.match(source, /caption: \[#"Une image"\]/, 'l’image valide est exportée')
    assert.doesNotMatch(source, /morte\.png/, 'l’image introuvable est omise')
    assert.match(source, /#"Après les images\."/, 'la suite du texte est là')
    const pdf = await compilerPdf(source, { fichiers, polices: polices(), wasm: wasm() })
    assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-')
  } finally {
    serveur.close()
  }
})
