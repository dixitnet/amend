// Les réglages de mise en page « livre » (28/10/2026) et ce que les exports en
// font : marges miroir, césure, veuves et orphelines, premier paragraphe sans
// retrait, début de chapitre et descente, position du numéro, notes de bas de
// page, séparateur de scène, légende.
//
// Typst : on lit la **source** (le test typstReel compile pour de vrai quand
// Typst est installé). Word : on ouvre le .docx produit et on lit son XML.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { schema } from './harness.js'
import { docToTypst, regleNotes } from '../src/typstExport.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { fusionner, assainir, largeurColonne, BLOCS, STYLES_PARAGRAPHE, blocDuParagraphe } from '../../shared/style.js'

const n = (type, attrs, enfants) => schema.node(type, attrs, enfants)
const t = (texte) => [schema.text(texte)]
const p = (texte, style) => n('paragraph', style ? { style } : null, t(texte))

/** Un petit livre : un chapitre, du texte, un séparateur, une légende, une note, un second chapitre. */
function livre() {
  return n('doc', null, [
    n('heading', { level: 1 }, t('Premier chapitre')),
    p('Texte après le titre.'),
    p('Texte suivant.'),
    p('Une légende', 'legende'),
    n('ligne_separation'),
    p('Texte après le séparateur.'),
    n('paragraph', null, [schema.text('Appel'), n('footnote', null, t('La note.'))]),
    n('heading', { level: 1 }, t('Second chapitre')),
    p('Fin.'),
  ])
}
const typst = (page, blocs) => docToTypst(livre(), fusionner({ page, blocs }), 'Livre', 'x')

// ===================================================== Typst

test('Typst : marges miroir — intérieure et extérieure, à la place de gauche et droite', () => {
  const miroir = typst({ margesMiroir: true, marginLeft: 25, marginRight: 15 })
  assert.match(miroir, /inside: 25mm, outside: 15mm/)
  assert.doesNotMatch(miroir, /left: 25mm/)
  const normal = typst({ marginLeft: 25, marginRight: 15 })
  assert.match(normal, /left: 25mm, right: 15mm/)
  assert.doesNotMatch(normal, /inside:/)
})

test('Typst : les images lisent la largeur des marges qu’elles soient miroir ou non', () => {
  // Trouvé en compilant : avec des marges miroir, `page.margin.left` n'existe pas.
  const image = n('image', { src: '/api/docs/x/images/p.png', alt: '', largeur: 400, hauteur: 300 })
  const avec = (page) => docToTypst(n('doc', null, [image]), fusionner({ page }), 'Livre', 'x')
  for (const miroir of [true, false]) {
    const src = avec({ margesMiroir: miroir })
    assert.match(src, /#let largeur-marges\(m\) = if "left" in m/)
    assert.match(src, /let disponible = page\.width - largeur-marges\(page\.margin\)/)
    assert.doesNotMatch(src, /page\.margin\.(left|right)/)
  }
  assert.match(avec({ margesMiroir: true, imagesPleinePage: true }), /hauteur-utile = page\.height - page\.margin\.top/)
})

test('Typst : colonnes — rien en une colonne, `columns` et gouttière en deux ou trois', () => {
  const une = typst({})
  assert.doesNotMatch(une, /columns:/)
  assert.doesNotMatch(une, /#set columns/)
  const deux = typst({ colonnes: 2, gouttiere: 8 })
  assert.match(deux, /columns: 2,/)
  assert.match(deux, /#set columns\(gutter: 8mm\)/)
  assert.match(typst({ colonnes: 3, gouttiere: 5 }), /columns: 3,/)
})

test('Typst : une image tient dans sa colonne', () => {
  const image = n('image', { src: '/api/docs/x/images/p.png', alt: '', largeur: 400, hauteur: 300 })
  const src = (page) => docToTypst(n('doc', null, [image]), fusionner({ page }), 'Livre', 'x')
  assert.match(
    src({ colonnes: 2, gouttiere: 8 }),
    /let disponible = \(page\.width - largeur-marges\(page\.margin\) - 8mm\) \/ 2/
  )
  assert.match(src({ colonnes: 3, gouttiere: 6 }), /- 12mm\) \/ 3/)
  assert.match(src({}), /let disponible = page\.width - largeur-marges\(page\.margin\)\n/)
  // Le réglage d'un document ne déborde pas sur le suivant.
  assert.match(src({}), /let disponible = page\.width - largeur-marges\(page\.margin\)\n/)
})

test('la largeur d’une colonne : entre les marges, moins les gouttières, divisée', () => {
  const a4 = { size: 'A4', marginLeft: 25, marginRight: 25 } // 160 mm utiles
  assert.equal(largeurColonne(fusionner({ page: a4 }).page), 160)
  assert.equal(largeurColonne(fusionner({ page: { ...a4, colonnes: 2, gouttiere: 10 } }).page), 75)
  assert.equal(largeurColonne(fusionner({ page: { ...a4, colonnes: 3, gouttiere: 5 } }).page), 50)
})

test('Word : colonnes — une section à plusieurs colonnes, sinon rien', async () => {
  const une = await lireDocx({})
  assert.doesNotMatch(une.document, /<w:cols/)
  const trois = await lireDocx({ colonnes: 3, gouttiere: 10, debutChapitre: 'page' })
  const cols = trois.document.match(/<w:cols [^>]*>/g) || []
  assert.equal(cols.length, 2) // une par section
  assert.match(cols[0], /w:num="3"/)
  assert.match(cols[0], /w:space="56[67]"/, cols[0]) // 10 mm (arrondi docx)
})

test('Typst : césure et veuves/orphelines — rien d’écrit tant qu’on garde le comportement de Typst', () => {
  const normal = typst({})
  assert.doesNotMatch(normal, /hyphenate: false/)
  assert.doesNotMatch(normal, /widow: 0%/)
  const sans = typst({ cesure: false, veuvesOrphelines: false })
  assert.match(sans, /hyphenate: false/)
  assert.match(sans, /costs: \(widow: 0%, orphan: 0%\)/)
})

test('Typst : premier paragraphe sans retrait — après un titre ou un séparateur seulement', () => {
  const src = typst({ premierSansRetrait: true }, { body: { firstLineIndent: 5 } })
  assert.match(src, /#let amend-corps-sr\(corps\)/)
  assert.match(src, /#let amend-corps-sr[\s\S]*?first-line-indent: \(amount: 0\.00pt/)
  // Le texte après chaque titre et celui après le séparateur — pas les autres.
  assert.equal((src.match(/#amend-corps-sr\[/g) || []).length, 3)
  assert.match(src, /#amend-corps-sr\[Fin\.\]/)
  assert.match(src, /#amend-corps-sr\[Texte après le titre\.\]/)
  assert.match(src, /#amend-corps-sr\[Texte après le séparateur\.\]/)
  assert.match(src, /#amend-corps\[Texte suivant\.\]/)
  assert.doesNotMatch(typst({}), /amend-corps-sr/)
})

test('Typst : début de chapitre — continuer, nouvelle page, nouvelle page à droite', () => {
  assert.doesNotMatch(typst({ debutChapitre: 'continuer' }), /pagebreak\(/)
  assert.match(typst({ debutChapitre: 'page' }), /pagebreak\(weak: true\)\n {2}amend-h1/)
  assert.match(typst({ debutChapitre: 'droite' }), /pagebreak\(to: "odd", weak: true\)/)
})

test('Typst : la descente ne se pose que sur un titre qui ouvre une page', () => {
  assert.match(typst({ debutChapitre: 'droite', descente: 40 }), /pagebreak\(to: "odd", weak: true\)\n {2}v\(40mm\)/)
  assert.match(typst({ debutChapitre: 'page', descente: 12.5 }), /v\(12\.5mm\)/)
  assert.doesNotMatch(typst({ debutChapitre: 'continuer', descente: 40 }), /v\(40mm\)/)
  assert.doesNotMatch(typst({ debutChapitre: 'page', descente: 0 }), /v\(0mm\)/)
})

test('Typst : le numéro de page — bas centré (inchangé), côté extérieur, en haut, sauf pages d’ouverture', () => {
  const centre = typst({ pageNumbers: { enabled: true } })
  assert.match(centre, /numbering: "1", number-align: center/)
  assert.doesNotMatch(centre, /footer: context/)

  const exterieur = typst({ pageNumbers: { enabled: true, position: 'bas-exterieur' } })
  assert.doesNotMatch(exterieur, /numbering: "1"/)
  assert.match(
    exterieur,
    /footer: context[\s\S]*align\(if calc\.even\(ici\) \{ left \} else \{ right \}, counter\(page\)\.display\("1"\)\)/
  )

  const haut = typst({ pageNumbers: { enabled: true, position: 'haut-exterieur' } })
  assert.match(
    haut,
    /header: context[\s\S]*place\(if calc\.even\(ici\) \{ left \} else \{ right \}, counter\(page\)\.display\("1"\)\)/
  )
  assert.doesNotMatch(haut, /footer: context/)

  // Pas de numéro sur les pages d'ouverture : même le bas centré passe par un pied de page.
  const saut = typst({ pageNumbers: { enabled: true, sautOuverture: true } })
  assert.doesNotMatch(saut, /numbering: "1"/)
  assert.match(saut, /footer: context[\s\S]*if true and ouverture \{ none \}/)
  assert.match(
    typst({ pageNumbers: { enabled: true, sautOuverture: false, position: 'bas-exterieur' } }),
    /if false and ouverture/
  )
})

test('Typst : un numéro en haut cohabite avec l’en-tête de texte', () => {
  const src = typst({
    pageNumbers: { enabled: true, position: 'haut-exterieur' },
    entete: { gauche: { type: 'titreDocument' }, droite: { type: 'titre' } },
  })
  assert.equal((src.match(/header: context/g) || []).length, 1)
  assert.match(src, /let contenu = if calc\.even\(ici\)/)
  assert.match(src, /place\(/)
})

test('Typst : les notes — réduction et interligne réglables, 2 pt et interligne du texte par défaut', () => {
  const corps = fusionner({}).blocs.body // 11 pt
  assert.match(regleNotes(corps), /size: 9pt/)
  assert.match(regleNotes(corps, { notesReduction: 3 }), /size: 8pt/)
  assert.match(regleNotes(corps, { notesReduction: 0 }), /size: 11pt/)
  // Plancher à 7 pt.
  assert.match(regleNotes(corps, { notesReduction: 6 }), /size: 7pt/)
  const memeInterligne = regleNotes(corps)
  const simple = regleNotes(corps, { notesInterligne: 1 })
  assert.match(memeInterligne, /leading: 1\.15em/)
  assert.match(simple, /leading: 1\.00em/)
  assert.match(typst({ notesReduction: 4 }), /size: 7pt, weight: "regular"/)
})

test('Typst : le séparateur de scène — trait, astérisques, astérisme, blanc', () => {
  assert.match(typst({}), /#line\(length: 100%/)
  assert.match(typst({ separateur: 'trait' }), /#line\(length: 100%/)
  const ast = typst({ separateur: 'asterisques' })
  assert.match(ast, /#align\(center\)\[\\\*  \\\*  \\\*\]/)
  assert.doesNotMatch(ast, /#line\(length: 100%/)
  assert.match(typst({ separateur: 'asterisme' }), /#align\(center\)\[⁂\]/)
  const blanc = typst({ separateur: 'blanc' })
  assert.match(blanc, /#v\(1\.4em\)/)
  assert.doesNotMatch(blanc, /#line\(/)
  // Le réglage d'un document ne déborde pas sur le suivant.
  assert.match(typst({}), /#line\(length: 100%/)
})

test('Typst : la légende est un style de paragraphe, avec sa fonction', () => {
  assert.ok(BLOCS.some((b) => b.id === 'caption'))
  assert.equal(blocDuParagraphe('legende'), 'caption')
  assert.ok(STYLES_PARAGRAPHE.some((s) => s.valeur === 'legende'))
  const src = typst({})
  assert.match(src, /#let amend-caption\(corps\)/)
  assert.match(src, /#amend-caption\[Une légende\]/)
  // Centrée, en italique, plus petite que le texte.
  const f = src.slice(src.indexOf('#let amend-caption'), src.indexOf('\n}', src.indexOf('#let amend-caption')))
  assert.match(f, /style: "italic"/)
  assert.match(f, /set align\(center\)/)
  assert.match(f, /size: 9pt/)
})

// ===================================================== Word

async function lireDocx(page, blocs) {
  const blob = await buildDocxBlob(livre(), assainir({ page, blocs }), 'Livre')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const lire = (f) => zip.file(f).async('string')
  return {
    document: await lire('word/document.xml'),
    settings: await lire('word/settings.xml'),
    endnotes: await lire('word/endnotes.xml'),
    zip,
  }
}

test('Word : marges miroir — `mirrorMargins` dans les paramètres, à sa place dans le schéma', async () => {
  const miroir = await lireDocx({ margesMiroir: true })
  assert.match(miroir.settings, /<w:displayBackgroundShape\/><w:mirrorMargins\/>/)
  // Le fichier reste un .docx lisible, avec tout son contenu.
  assert.ok(miroir.document.includes('Premier chapitre'))
  const normal = await lireDocx({})
  assert.doesNotMatch(normal.settings, /mirrorMargins/)
})

test('Word : césure et veuves/orphelines', async () => {
  const avec = await lireDocx({})
  assert.match(avec.settings, /<w:autoHyphenation/)
  assert.doesNotMatch(avec.settings, /<w:autoHyphenation w:val="(false|0)"/)
  assert.match(avec.document, /<w:widowControl\/>/)
  const sans = await lireDocx({ cesure: false, veuvesOrphelines: false })
  assert.match(sans.settings, /<w:autoHyphenation w:val="(false|0)"/)
  assert.match(sans.document, /<w:widowControl w:val="(false|0)"/)
})

test('Word : début de chapitre — une section par titre 1, « page suivante » ou « page impaire »', async () => {
  const continuer = await lireDocx({ debutChapitre: 'continuer' })
  assert.equal((continuer.document.match(/<w:sectPr/g) || []).length, 1)
  const page = await lireDocx({ debutChapitre: 'page' })
  assert.equal((page.document.match(/<w:sectPr/g) || []).length, 2)
  assert.match(page.document, /<w:type w:val="nextPage"\/>/)
  const droite = await lireDocx({ debutChapitre: 'droite' })
  assert.equal((droite.document.match(/<w:sectPr/g) || []).length, 2)
  assert.match(droite.document, /<w:type w:val="oddPage"\/>/)
  // Le numéro de la première page ne se pose qu'une fois : la numérotation continue.
  const avecNumeros = await lireDocx({ debutChapitre: 'droite', pageNumbers: { enabled: true, startAt: 5 } })
  assert.equal((avecNumeros.document.match(/<w:pgNumType w:start="5"/g) || []).length, 1)
})

test('Word : la descente remplace l’espace avant d’un titre 1 qui ouvre une page', async () => {
  const avec = await lireDocx({ debutChapitre: 'droite', descente: 40 })
  assert.match(avec.document, /w:before="2267"/) // 40 mm
  const sans = await lireDocx({ debutChapitre: 'continuer', descente: 40 })
  assert.doesNotMatch(sans.document, /w:before="2267"/)
})

test('Word : numéro de page — côté extérieur, en haut, pas sur les pages d’ouverture', async () => {
  const exterieur = await lireDocx({ pageNumbers: { enabled: true, position: 'bas-exterieur' } })
  assert.match(exterieur.settings, /<w:evenAndOddHeaders\/>/)
  assert.match(exterieur.document, /w:type="even"/)
  const footers = ['footer1.xml', 'footer2.xml'].map((f) => exterieur.zip.file(`word/${f}`))
  assert.ok(footers.every(Boolean))
  const jcs = await Promise.all(
    footers.map(async (f) => (await f.async('string')).match(/<w:jc w:val="(\w+)"\/>/)?.[1])
  )
  assert.deepEqual([...jcs].sort(), ['left', 'right'])

  const haut = await lireDocx({ pageNumbers: { enabled: true, position: 'haut-exterieur' } })
  assert.match(haut.document, /<w:headerReference w:type="default"/)
  assert.doesNotMatch(haut.document, /<w:footerReference/)

  // Pas de numéro sur les pages d'ouverture : « première page » à part, par section.
  const saut = await lireDocx({ debutChapitre: 'page', pageNumbers: { enabled: true, sautOuverture: true } })
  assert.equal((saut.document.match(/<w:titlePg\/>/g) || []).length, 2)
  assert.match(saut.document, /<w:footerReference w:type="first"/)
  // Sans saut de page entre chapitres, Word ne sait pas faire : on n'invente rien.
  const impossible = await lireDocx({ debutChapitre: 'continuer', pageNumbers: { enabled: true, sautOuverture: true } })
  assert.doesNotMatch(impossible.document, /<w:titlePg\/>/)
})

test('Word : premier paragraphe sans retrait, séparateur, légende, notes', async () => {
  const base = { blocs: { body: { firstLineIndent: 6, align: 'left' } } }
  const sans = await lireDocx({}, base.blocs)
  const avec = await lireDocx({ premierSansRetrait: true }, base.blocs)
  const retraits = (x) => (x.document.match(/w:firstLine="\d+"/g) || []).length
  // Trois paragraphes (après un titre, après le second titre, après le séparateur) n'ont plus de retrait.
  assert.equal(retraits(sans) - retraits(avec), 3)

  assert.match((await lireDocx({ separateur: 'asterisques' })).document, /\*   \*   \*/)
  assert.ok((await lireDocx({ separateur: 'asterisme' })).document.includes('⁂'))
  assert.match((await lireDocx({ separateur: 'trait' })).document, /<w:pBdr>/)
  const blanc = await lireDocx({ separateur: 'blanc' })
  assert.doesNotMatch(blanc.document, /<w:pBdr>/)

  const defaut = await lireDocx({})
  assert.match(defaut.document, /<w:pStyle w:val="Caption"\/>/)
  assert.ok(defaut.zip.file('word/styles.xml'))
  assert.match(await defaut.zip.file('word/styles.xml').async('string'), /w:styleId="Caption"/)

  // Notes de fin : 11 pt − 2 pt = 9 pt (soit w:sz 18) par défaut, 8 pt avec une réduction de 3.
  assert.match(defaut.endnotes, /<w:sz w:val="18"\/>/)
  assert.match((await lireDocx({ notesReduction: 3 })).endnotes, /<w:sz w:val="16"\/>/)
})
