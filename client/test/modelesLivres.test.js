// Les modèles livrés (01/10/2026, shared/modeles.js) : chacun doit être une
// feuille de style **valide telle quelle** (aucune valeur ramenée par
// `assainir`, sinon le modèle ne rend pas ce qu'il annonce) et produire un
// export Typst et Word sans erreur, au format qu'il affiche.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { doc } from './harness.js'
import { docToTypst } from '../src/typstExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { fusionner, assainir, dimensionsPage, POLICES } from '../../shared/style.js'
import { MODELES_LIVRES, modeleLivre, libelleFormat, compterEcarts } from '../../shared/modeles.js'

const D = doc({ h: 1, texte: 'Titre' }, 'Un paragraphe.', { h: 2, texte: 'Sous-titre' }, { citation: 'Une citation.' })

test('un seul modèle livré : « Texte brut » (les modèles de goût ont été retirés le 02/10/2026)', () => {
  assert.deepEqual(MODELES_LIVRES.map((m) => m.id), ['texte-brut'])
  assert.equal(MODELES_LIVRES[0].nom, 'Texte brut')
  for (const m of MODELES_LIVRES) assert.ok(m.description.length > 20, m.id)
  for (const retire of ['manuscrit', 'livre', 'note']) assert.equal(modeleLivre(retire), null, retire)
})

for (const m of MODELES_LIVRES) {
  test(`« ${m.nom} » : valide tel quel, sans valeur ramenée`, () => {
    const complet = fusionner(m.style)
    assert.deepEqual(assainir(m.style), complet)
  })

  test(`« ${m.nom} » : n’utilise que des polices de la liste fermée`, () => {
    const ids = new Set(POLICES.map((p) => p.id))
    for (const [bloc, r] of Object.entries(m.style.blocs || {})) {
      if (r.font) assert.ok(ids.has(r.font), `${bloc} : ${r.font}`)
    }
  })

  test(`« ${m.nom} » : s’exporte en Typst et en Word au format affiché`, async () => {
    const style = fusionner(m.style)
    const [l, h] = dimensionsPage(style.page)
    const typst = docToTypst(D, style, 'Doc')
    assert.ok(typst.includes(`width: ${l}mm`) && typst.includes(`height: ${h}mm`))
    const blob = await buildDocxBlob(D, style, 'Doc')
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml').async('string')
    assert.match(xml, /<w:pgSz/)
  })
}

test('les formats se lisent : A4, A5, paysage, personnalisé, ancien', () => {
  assert.equal(libelleFormat({ size: 'A4' }), 'A4')
  assert.equal(libelleFormat({ size: 'A5', orientation: 'paysage' }), 'A5 paysage')
  assert.equal(libelleFormat({ size: 'personnalise', largeur: 110, hauteur: 178.5 }), '110 × 178,5 mm')
  assert.equal(libelleFormat({ size: 'Letter' }), 'Letter')
  assert.equal(libelleFormat(undefined), 'A4')
})

test('« Texte brut » n’impose rien : A4, une seule police, pas de numéros de page', () => {
  const f = fusionner(modeleLivre('texte-brut').style)
  assert.equal(f.page.size, 'A4')
  assert.equal(f.page.pageNumbers.enabled, false)
  for (const b of ['body', 'quote', 'h1', 'h2', 'h3']) assert.equal(f.blocs[b].font, 'system', b)
})

test('compterEcarts compte les valeurs, pas les groupes', () => {
  assert.equal(compterEcarts(null), 0)
  assert.equal(compterEcarts({ version: 2 }), 0)
  assert.equal(compterEcarts({ page: { entete: { gauche: { type: 'texte', texte: 'x' } } }, blocs: { h1: { size: 3, bold: false } } }), 4)
})
