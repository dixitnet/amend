// La ligne de séparation et le saut de page (13/10/2026) : deux blocs, deux
// rôles, dans chacune des quatre sorties. Le saut de page garde le nom
// `horizontal_rule` des anciens documents ; la ligne est `ligne_separation`.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { schema } from '../src/schema.js'
import { docToTypst } from '../src/typstExport.js'
import { docToMarkdown } from '../src/mdExport.js'
import { docPourPublication } from '../src/publicationExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { styleParDefaut } from '../../shared/style.js'

const p = (t) => schema.nodes.paragraph.create(null, schema.text(t))
const saut = () => schema.nodes.horizontal_rule.create()
const ligne = () => schema.nodes.ligne_separation.create()
const avec = (...blocs) => schema.node('doc', null, [p('avant'), ...blocs, p('après')])

test('PDF : le saut de page saute la page, la ligne trace un trait — jamais l’inverse', () => {
  const sautSeul = docToTypst(avec(saut()), styleParDefaut(), 'Doc')
  assert.match(sautSeul, /#pagebreak\(weak: true\)/)
  assert.doesNotMatch(sautSeul, /#line\(/)
  const ligneSeule = docToTypst(avec(ligne()), styleParDefaut(), 'Doc')
  assert.match(ligneSeule, /#line\(length: 100%/)
  assert.doesNotMatch(ligneSeule, /pagebreak\(weak: true\)/)
})

test('Markdown : « --- » pour la ligne, un commentaire pour le saut de page', () => {
  const md = docToMarkdown(avec(ligne(), saut()))
  assert.match(md, /^---$/m)
  assert.match(md, /<!-- saut de page -->/)
  assert.equal(docToMarkdown(avec(saut())).includes('---'), false, 'un saut de page ne dessine pas de trait')
})

test('page publiée : une séparation dans les deux cas (une page web n’a pas de pages)', () => {
  const types = (d) => docPourPublication(d).map((b) => b.type)
  assert.equal(types(avec(saut())).length, 3)
  assert.equal(types(avec(saut()))[1], 'separation')
  assert.equal(types(avec(ligne()))[1], 'separation')
})

test('Word : le saut de page est un saut, la ligne une bordure', async () => {
  const xml = async (d) => {
    const blob = await buildDocxBlob(d, styleParDefaut(), 'Doc')
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    return zip.file('word/document.xml').async('string')
  }
  const s = await xml(avec(saut()))
  assert.match(s, /w:pageBreakBefore/)
  assert.doesNotMatch(s, /w:pBdr/)
  const l = await xml(avec(ligne()))
  assert.match(l, /<w:pBdr><w:bottom /)
  assert.doesNotMatch(l, /w:pageBreakBefore/)
})
