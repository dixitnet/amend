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
const editeur = BlockNoteEditor.create({ schema: schemaLivre })
const texte = (t, styles = {}) => ({ type: 'text', text: t, styles })
const paragraphe = 'Au cours du XXIe siècle fut achevée la révolution qui avait commencé avec la bombe d’Hiroshima.'
const BLOCS = [
  { type: 'heading', props: { level: 1 }, content: [texte('Petit conte immoral')] },
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
const blocs = () => editeur.insertBlocks(BLOCS, editeur.document[0], 'before') && editeur.document

const polices = () => modele.polices.map((url) => new Uint8Array(readFileSync(fileURLToPath(url))))
const wasm = () => readFileSync(createRequire(import.meta.url).resolve('@blocknote/xl-typst-compiler/wasm'))

test('la source Typst d’un livre : gabarit du modèle, puis les blocs sans blanc à eux', async () => {
  const { source } = await versTypst(editeur, blocs(), modele, { titre: 'Essai', langue: 'fr' })
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
  // Aucun blanc de BlockNote autour des blocs (il casserait la grille).
  assert.doesNotMatch(source, /inset: \(top/)
  // Le texte est échappé et en forme composée (NFC).
  assert.ok(source.includes('#"Fin # $ * _ \\\\ \\" ` < > @ [ ] — é"'))
})

test('le compilateur Typst de BlockNote en fait un PDF au format du modèle, police incorporée', async () => {
  const { source, fichiers } = await versTypst(editeur, blocs(), modele, { titre: 'Essai', langue: 'fr' })
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

test('une source Typst fautive donne une erreur de code export-pdf-echoue', async () => {
  await assert.rejects(compilerPdf('#fonction-inconnue()', { polices: polices(), wasm: wasm() }), {
    code: 'export-pdf-echoue',
  })
})
