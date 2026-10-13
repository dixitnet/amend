// Les listes à plusieurs niveaux (13/10/2026) dans les quatre sorties : ce
// que l'éditeur laisse désormais créer (jusqu'à six niveaux) doit ressortir
// emboîté en Markdown, en Typst (PDF), en Word et dans la page publiée.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { schema } from '../src/schema.js'
import { docToTypst } from '../src/typstExport.js'
import { docToMarkdown } from '../src/mdExport.js'
import { docPourPublication } from '../src/publicationExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { NIVEAUX_DE_LISTE_MAX } from '../src/commandesBarre.js'
import { styleParDefaut } from '../../shared/style.js'

const p = (t) => schema.nodes.paragraph.create(null, schema.text(t))
const li = (...b) => schema.node('list_item', null, b)
const ul = (...i) => schema.node('bullet_list', null, i)
const ol = (...i) => schema.node('ordered_list', null, i)

const puces = schema.node('doc', null, [ul(li(p('A'), ul(li(p('A1'), ul(li(p('A1a')))), li(p('A2')))), li(p('B')))])
const numerotee = schema.node('doc', null, [ol(li(p('un'), ol(li(p('sous'), ol(li(p('sous-sous')))))))])

/** Une liste à puces de `n` niveaux, un élément par niveau. */
function profonde(n) {
  let courant = ul(li(p(`niveau ${n}`)))
  for (let k = n - 1; k >= 1; k--) courant = ul(li(p(`niveau ${k}`), courant))
  return schema.node('doc', null, [courant])
}

test('le plafond de l’éditeur est de six niveaux', () => {
  assert.equal(NIVEAUX_DE_LISTE_MAX, 6)
})

test('Markdown : deux espaces de plus par niveau', () => {
  assert.equal(docToMarkdown(puces).trim(), ['- A', '  - A1', '    - A1a', '  - A2', '- B'].join('\n'))
  assert.match(docToMarkdown(numerotee), /^1\. un\n {2}1\. sous\n {4}1\. sous-sous/m)
})

test('Typst : une liste dans la liste, à chaque niveau, dans les deux familles', () => {
  const t = docToTypst(puces, styleParDefaut(), 'D')
  assert.equal((t.match(/#list\(/g) || []).length, 3, 'trois listes emboîtées')
  const e = docToTypst(numerotee, styleParDefaut(), 'D')
  assert.equal((e.match(/#enum\(/g) || []).length, 3)
  // Six niveaux ne cassent pas la source.
  assert.equal((docToTypst(profonde(6), styleParDefaut(), 'D').match(/#list\(/g) || []).length, 6)
})

test('page publiée : la liste porte ses sous-listes', () => {
  const [racine] = docPourPublication(puces)
  assert.equal(racine.type, 'liste')
  const sous = racine.items[0].blocs.find((b) => b.type === 'liste')
  assert.ok(sous, 'sous-liste du premier élément')
  assert.ok(
    sous.items[0].blocs.some((b) => b.type === 'liste'),
    'et sa propre sous-liste'
  )
})

test('Word : un niveau de liste par niveau, 1. → a. → i. pour les listes numérotées', async () => {
  const lire = async (d, fichier) => {
    const blob = await buildDocxBlob(d, styleParDefaut(), 'D')
    return (await JSZip.loadAsync(await blob.arrayBuffer())).file(fichier).async('string')
  }
  const niveaux = (await lire(puces, 'word/document.xml')).match(/<w:ilvl w:val="(\d)"\/>/g)
  assert.deepEqual(
    niveaux,
    ['0', '1', '2', '1', '0'].map((n) => `<w:ilvl w:val="${n}"/>`)
  )
  const num = await lire(numerotee, 'word/numbering.xml')
  const formats = [...num.matchAll(/<w:numFmt w:val="(decimal|lowerLetter|lowerRoman)"/g)].map((m) => m[1])
  assert.deepEqual(formats.slice(0, 6), [
    'decimal',
    'lowerLetter',
    'lowerRoman',
    'decimal',
    'lowerLetter',
    'lowerRoman',
  ])
  // Les six niveaux sont déclarés : une liste numérotée profonde ne retombe pas sur rien.
  const profondeNum = schema.node('doc', null, [
    [1, 2, 3, 4, 5, 6].reduceRight((fils, k) => ol(li(p(`n${k}`), ...(fils ? [fils] : []))), null),
  ])
  const xml = await lire(profondeNum, 'word/document.xml')
  assert.match(xml, /<w:ilvl w:val="5"\/>/)
})

test('le tiret à tous les niveaux : PDF et Word, comme à l’écran', async () => {
  const t = docToTypst(profonde(3), styleParDefaut(), 'D')
  assert.equal((t.match(/#list\(marker: \[–\], /g) || []).length, 3)
  assert.doesNotMatch(
    docToTypst(numerotee, styleParDefaut(), 'D'),
    /marker:/,
    'les listes numérotées gardent leurs numéros'
  )
  const blob = await buildDocxBlob(profonde(3), styleParDefaut(), 'D')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const num = await zip.file('word/numbering.xml').async('string')
  const signes = [...num.matchAll(/<w:lvlText w:val="–"\/>/g)]
  assert.equal(signes.length, 6, 'un tiret déclaré pour chacun des six niveaux')
  // La puce intégrée de `docx` reste déclarée (•, ○, ■) mais plus aucune liste n'y renvoie.
  const doc = await zip.file('word/document.xml').async('string')
  assert.equal(new Set(doc.match(/<w:numId w:val="\d+"\/>/g)).size, 1, 'une seule définition de numérotation employée')
})
