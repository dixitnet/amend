// Les formats de page (01/10/2026) : A4, A5, personnalisé, portrait ou
// paysage. `dimensionsPage` (shared/style.js) est l'unique source de la
// taille d'une page ; ce fichier vérifie qu'elle arrive intacte dans les
// trois sorties — la source Typst, le fichier Word, le CSS — et que
// l'assainissement empêche une valeur hors bornes d'y arriver.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { doc } from './harness.js'
import { docToTypst } from '../src/typstExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { buildPageCss } from '../src/styleConfig.js'
import {
  fusionner,
  reduire,
  assainir,
  dimensionsPage,
  FORMATS_PAGE,
  FORMATS_ANCIENS,
  BORNES_FORMAT,
  UTILE_MIN,
  PAGE_DEFAUT,
  VERSION_STYLE,
} from '../../shared/style.js'

const D = doc({ h: 1, texte: 'Titre' }, 'Un paragraphe.')
const typst = (page) => docToTypst(D, assainir({ page }), 'Doc')

async function pgSz(page) {
  const blob = await buildDocxBlob(D, assainir({ page }), 'Doc')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xml = await zip.file('word/document.xml').async('string')
  const m = xml.match(/<w:pgSz[^>]*>/)
  assert.ok(m, 'pas de w:pgSz')
  const attr = (n) => Number((m[0].match(new RegExp(`w:${n}="(\\d+)"`)) || [])[1])
  return { w: attr('w'), h: attr('h'), orient: (m[0].match(/w:orient="(\w+)"/) || [])[1] }
}
const mmEnTwips = (mm) => Math.round((mm / 25.4) * 1440)
const proche = (a, b) => Math.abs(a - b) <= 2

test('les formats proposés sont A4, A5 et personnalisé ; Letter n’est plus offert mais reste lu', () => {
  assert.deepEqual(FORMATS_PAGE.map((f) => f.id), ['A4', 'A5', 'personnalise'])
  assert.deepEqual(FORMATS_ANCIENS.map((f) => f.id), ['Letter'])
  assert.deepEqual(dimensionsPage({ size: 'Letter' }), [215.9, 279.4])
  // Une valeur inconnue retombe sur A4 plutôt que de casser l'export.
  assert.deepEqual(dimensionsPage({ size: 'A3' }), [210, 297])
  assert.deepEqual(dimensionsPage(undefined), [210, 297])
})

test('paysage : les côtés sont permutés pour un format nommé', () => {
  assert.deepEqual(dimensionsPage({ size: 'A4', orientation: 'paysage' }), [297, 210])
  assert.deepEqual(dimensionsPage({ size: 'A5', orientation: 'portrait' }), [148, 210])
})

test('personnalisé : les deux côtés tels qu’écrits, et l’orientation est sans effet', () => {
  assert.deepEqual(dimensionsPage({ size: 'personnalise', largeur: 140, hauteur: 215 }), [140, 215])
  assert.deepEqual(dimensionsPage({ size: 'personnalise', largeur: 215, hauteur: 140, orientation: 'portrait' }), [215, 140])
})

test('personnalisé : hors bornes, ramené ; absent ou illisible, valeur par défaut', () => {
  const [l, h] = dimensionsPage({ size: 'personnalise', largeur: 5, hauteur: 99999 })
  assert.equal(l, BORNES_FORMAT.min)
  assert.equal(h, BORNES_FORMAT.max)
  assert.deepEqual(dimensionsPage({ size: 'personnalise', largeur: 'abc' }), [PAGE_DEFAUT.largeur, PAGE_DEFAUT.hauteur])
})

test('l’assainissement ramène les valeurs invalides sans rien rejeter', () => {
  const a = assainir({
    page: { size: 'X', orientation: 'zz', marginLeft: 'abc', marginTop: -5, largeur: 1e9, langue: 'jp', titresSolidaires: 'oui' },
    blocs: { body: { size: 'grand', font: 'inconnue', bold: 'oui', align: 'diagonal', lineHeight: 1.15 } },
  })
  assert.equal(a.page.size, 'A4')
  assert.equal(a.page.orientation, 'portrait')
  assert.equal(a.page.marginLeft, 20)
  assert.equal(a.page.marginTop, 0)
  assert.equal(a.page.largeur, BORNES_FORMAT.max)
  assert.equal(a.page.langue, 'fr')
  assert.equal(a.page.titresSolidaires, true)
  assert.equal(a.blocs.body.size, 11)
  assert.equal(a.blocs.body.font, 'system')
  assert.equal(a.blocs.body.bold, false)
  assert.equal(a.blocs.body.align, 'left')
  assert.equal(a.blocs.body.lineHeight, 1.15)
  assert.equal(a.version, VERSION_STYLE)
})

test('l’assainissement garde une feuille valide telle quelle', () => {
  const valide = fusionner({ page: { size: 'A5', orientation: 'paysage', marginTop: 12 }, blocs: { h1: { align: 'center', size: 30 } } })
  assert.deepEqual(assainir(valide), valide)
})

test('les marges ne mangent jamais la page : elles sont réduites pour laisser la largeur utile', () => {
  const a = assainir({ page: { size: 'personnalise', largeur: 80, hauteur: 120, marginLeft: 40, marginRight: 40, marginTop: 70, marginBottom: 70 } })
  assert.ok(80 - a.page.marginLeft - a.page.marginRight >= UTILE_MIN - 0.5)
  assert.ok(120 - a.page.marginTop - a.page.marginBottom >= UTILE_MIN - 0.5)
  // Et un cas normal n'est pas touché.
  const b = assainir({ page: { size: 'A5', marginLeft: 15, marginRight: 15 } })
  assert.equal(b.page.marginLeft, 15)
})

test('on n’enregistre que l’orientation quand c’est tout ce qui change', () => {
  assert.deepEqual(reduire(assainir({ page: { orientation: 'paysage' } })), { version: VERSION_STYLE, page: { orientation: 'paysage' } })
  assert.deepEqual(reduire(assainir({})), { version: VERSION_STYLE })
})

// ----------------------------------------------------------- Typst

test('Typst : paysage et format libre arrivent dans la page, sans `flipped`', () => {
  const a4p = typst({ size: 'A4', orientation: 'paysage' })
  assert.match(a4p, /width: 297mm/)
  assert.match(a4p, /height: 210mm/)
  assert.ok(!a4p.includes('flipped'))
  const libre = typst({ size: 'personnalise', largeur: 140, hauteur: 215.5 })
  assert.match(libre, /width: 140mm/)
  assert.match(libre, /height: 215\.5mm/)
  assert.match(typst({ size: 'Letter' }), /width: 215\.9mm/)
})

// ----------------------------------------------------------- Word

test('Word : portrait A4, paysage A4 (côtés dans l’ordre portrait + drapeau), format libre', async () => {
  const p = await pgSz({ size: 'A4' })
  assert.ok(proche(p.w, mmEnTwips(210)) && proche(p.h, mmEnTwips(297)), JSON.stringify(p))
  assert.notEqual(p.orient, 'landscape')

  // Paysage : la bibliothèque permute à l'écriture — au final w > h, et
  // Word est prévenu par `w:orient="landscape"`.
  const l = await pgSz({ size: 'A4', orientation: 'paysage' })
  assert.ok(proche(l.w, mmEnTwips(297)) && proche(l.h, mmEnTwips(210)), JSON.stringify(l))
  assert.equal(l.orient, 'landscape')

  const libre = await pgSz({ size: 'personnalise', largeur: 140, hauteur: 215 })
  assert.ok(proche(libre.w, mmEnTwips(140)) && proche(libre.h, mmEnTwips(215)), JSON.stringify(libre))

  // Un format libre « à l'italienne » (plus large que haut) est un paysage.
  const italien = await pgSz({ size: 'personnalise', largeur: 215, hauteur: 140 })
  assert.ok(proche(italien.w, mmEnTwips(215)) && proche(italien.h, mmEnTwips(140)), JSON.stringify(italien))
  assert.equal(italien.orient, 'landscape')
})

// ----------------------------------------------------------- CSS

test('CSS : la règle @page porte les dimensions réelles', () => {
  assert.match(buildPageCss(assainir({ page: { size: 'A4', orientation: 'paysage' } })), /size: 297mm 210mm/)
  assert.match(buildPageCss(assainir({ page: { size: 'personnalise', largeur: 140, hauteur: 215 } })), /size: 140mm 215mm/)
})

test('« Titre du document » est un contenu d’en-tête valide : l’assainissement le garde, un inconnu est ramené', () => {
  const ok = assainir({ page: { entete: { gauche: { type: 'titreDocument' }, droite: { type: 'nimporte-quoi', texte: 'x' } } } })
  assert.equal(ok.page.entete.gauche.type, 'titreDocument')
  assert.equal(ok.page.entete.droite.type, 'rien')
})

test('Word : « Titre du document » écrit le titre dans l’en-tête, côté gauche et côté droit', async () => {
  const style = assainir({ page: { entete: { gauche: { type: 'titreDocument' }, droite: { type: 'titreDocument' } } } })
  const blob = await buildDocxBlob(D, style, 'Mon titre')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const entetes = Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f))
  assert.ok(entetes.length >= 1)
  let tout = ''
  for (const f of entetes) tout += await zip.file(f).async('string')
  assert.ok(tout.includes('Mon titre'))
})
