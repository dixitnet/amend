// L'export Word d'un document qui contient une image (11/10/2026).
//
// Le lint a trouvé que `case 'image'` de docxExport.js utilisait `corps`, une
// variable déclarée seulement dans le `case 'table'` voisin : tout export
// Word d'un document avec une image levait une ReferenceError, que l'image
// soit récupérée ou non. Aucun test ne passait par là.

import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { schema } from './harness.js'
import { buildDocxBlob } from '../src/docxExport.js'
import { assainir } from '../../shared/style.js'

// Un PNG d'un pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const SRC = '/api/docs/abc/images/photo.png'
const document_ = schema.node('doc', null, [
  schema.node('paragraph', null, [schema.text('Avant.')]),
  schema.node('image', { src: SRC, alt: 'Une photo', largeur: 800, hauteur: 600 }),
  schema.node('paragraph', null, [schema.text('Après.')]),
])

async function xmlWord(fetchFactice) {
  const vrai = globalThis.fetch
  globalThis.fetch = fetchFactice
  try {
    const blob = await buildDocxBlob(document_, assainir({}), 'Doc')
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    return { xml: await zip.file('word/document.xml').async('string'), zip }
  } finally {
    globalThis.fetch = vrai
  }
}

test('Word : une image récupérée entre dans le fichier (dessin + média)', async () => {
  const { xml, zip } = await xmlWord(async () => new Response(PNG, { status: 200 }))
  assert.ok(xml.includes('<w:drawing'), "le dessin de l'image est dans le document")
  assert.ok(
    Object.keys(zip.files).some((f) => f.startsWith('word/media/')),
    "l'image est dans le dossier des médias"
  )
  assert.ok(xml.includes('Avant.') && xml.includes('Après.'), 'le texte autour reste')
})

test("Word : une image qu'on ne peut pas relire laisse une mention, sans interrompre l'export", async () => {
  const { xml } = await xmlWord(async () => new Response('introuvable', { status: 404 }))
  assert.ok(xml.includes('[image non récupérée]'))
  assert.ok(!xml.includes('<w:drawing'))
  assert.ok(xml.includes('Avant.') && xml.includes('Après.'))
})

test('Word : une image dont le téléchargement échoue (réseau) laisse aussi la mention', async () => {
  const { xml } = await xmlWord(async () => {
    throw new Error('réseau coupé')
  })
  assert.ok(xml.includes('[image non récupérée]'))
})

// ===================================================== images pleine page (23/10/2026)

/** Les dimensions (px à 96 ppp) de chaque image du document Word. */
async function dimensionsImages(doc_, style) {
  const vrai = globalThis.fetch
  globalThis.fetch = async () => new Response(PNG, { status: 200 })
  try {
    const blob = await buildDocxBlob(doc_, style, 'Doc')
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml').async('string')
    return [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => [Number(m[1]) / 9525, Number(m[2]) / 9525])
  } finally {
    globalThis.fetch = vrai
  }
}

const image = (largeur, hauteur) => schema.node('image', { src: SRC, alt: '', largeur, hauteur })
const docImages = (...images) => schema.node('doc', null, images)

// A4 portrait, marges 20 / 25 mm : 170 mm × 247 mm utiles, soit 643 × 934 px (932 une fois les 2 px de garde retirés).
test('Word, par défaut : une image plus large que la page est réduite, une petite reste petite', async () => {
  const [grande, petite] = await dimensionsImages(docImages(image(800, 600), image(100, 50)), assainir({}))
  assert.deepEqual(grande.map(Math.round), [643, 482])
  assert.deepEqual(petite, [100, 50], 'jamais agrandie')
})

test('Word, images pleine page : la plus grande taille entre les marges, proportions gardées', async () => {
  const style = assainir({ page: { imagesPleinePage: true } })
  const [large, petite, haute] = await dimensionsImages(
    docImages(image(800, 600), image(100, 50), image(400, 1200)),
    style
  )
  assert.deepEqual(large.map(Math.round), [643, 482], 'limitée par la largeur')
  assert.deepEqual(petite.map(Math.round), [643, 322], 'une petite image est agrandie jusqu’aux marges')
  assert.equal(Math.round(haute[1]), 932, 'une image haute est limitée par la hauteur utile')
  assert.equal(Math.round(haute[0]), 311, 'et garde ses proportions')
})

test('Word, images pleine page : tient compte des marges du modèle', async () => {
  const style = assainir({ page: { imagesPleinePage: true, marginLeft: 40, marginRight: 40 } })
  const [img] = await dimensionsImages(docImages(image(800, 600)), style)
  // 210 − 80 = 130 mm = 491 px.
  assert.equal(Math.round(img[0]), 491)
})

test('Word, images pleine page : une image dans une citation garde sa taille ordinaire', async () => {
  const citation = schema.node('blockquote', null, [schema.node('paragraph', null, [schema.text('a')]), image(100, 50)])
  const style = assainir({ page: { imagesPleinePage: true } })
  const dims = await dimensionsImages(docImages(citation), style)
  assert.deepEqual(dims[0], [100, 50], 'la largeur utile d’une citation est plus étroite que la page')
})

test('Word, images pleine page : le paragraphe de l’image ne porte ni retrait ni interligne du texte', async () => {
  const vrai = globalThis.fetch
  globalThis.fetch = async () => new Response(PNG, { status: 200 })
  try {
    const style = assainir({
      page: { imagesPleinePage: true },
      blocs: { body: { firstLineIndent: 10, lineHeight: 1.5 } },
    })
    const zip = await JSZip.loadAsync(
      await (await buildDocxBlob(docImages(image(800, 600)), style, 'Doc')).arrayBuffer()
    )
    const xml = await zip.file('word/document.xml').async('string')
    const paragraphe = xml.match(/<w:p>(?:(?!<\/w:p>).)*<w:drawing/s)[0]
    assert.doesNotMatch(paragraphe, /w:firstLine|w:ind /)
    assert.match(paragraphe, /w:line="240"/)
    assert.match(paragraphe, /w:jc w:val="center"/)
  } finally {
    globalThis.fetch = vrai
  }
})

/** Le XML du document Word. */
async function xmlDe(doc_, style) {
  const vrai = globalThis.fetch
  globalThis.fetch = async () => new Response(PNG, { status: 200 })
  try {
    const zip = await JSZip.loadAsync(await (await buildDocxBlob(doc_, style, 'Doc')).arrayBuffer())
    return await zip.file('word/document.xml').async('string')
  } finally {
    globalThis.fetch = vrai
  }
}

test('Word, images pleine page : une page à elle, centrée en hauteur par l’espacement avant', async () => {
  const xml = await xmlDe(docImages(image(800, 600)), assainir({ page: { imagesPleinePage: true } }))
  const paragraphe = xml.match(/<w:p>(?:(?!<\/w:p>).)*<w:drawing/s)[0]
  assert.match(paragraphe, /<w:pageBreakBefore\/>/)
  // Zone utile 932 px, image 482 px de haut : (932 − 482) / 2 = 225 px = 3 375 twips.
  assert.match(paragraphe, /w:before="3375"/)
})

test('Word, images pleine page : le texte qui suit repart en haut de la page d’après, sans page blanche', async () => {
  const para = (t) => schema.node('paragraph', null, [schema.text(t)])
  const style = assainir({ page: { imagesPleinePage: true } })
  const sauts = (xml) => (xml.match(/<w:pageBreakBefore\/>/g) || []).length
  // Texte, image, texte : un saut avant l'image, un après.
  assert.equal(sauts(await xmlDe(docImages(para('a'), image(800, 600), para('b')), style)), 2)
  // Deux images de suite : chacune pose son saut avant, pas de repère entre elles ; rien après la dernière.
  assert.equal(sauts(await xmlDe(docImages(image(800, 600), image(100, 50)), style)), 2)
  // Sans le réglage : aucun saut.
  assert.equal(sauts(await xmlDe(docImages(para('a'), image(800, 600), para('b')), assainir({}))), 0)
})
