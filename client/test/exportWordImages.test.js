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

test("Word : une image récupérée entre dans le fichier (dessin + média)", async () => {
  const { xml, zip } = await xmlWord(async () => new Response(PNG, { status: 200 }))
  assert.ok(xml.includes('<w:drawing'), "le dessin de l'image est dans le document")
  assert.ok(Object.keys(zip.files).some((f) => f.startsWith('word/media/')), "l'image est dans le dossier des médias")
  assert.ok(xml.includes('Avant.') && xml.includes('Après.'), 'le texte autour reste')
})

test("Word : une image qu'on ne peut pas relire laisse une mention, sans interrompre l'export", async () => {
  const { xml } = await xmlWord(async () => new Response('introuvable', { status: 404 }))
  assert.ok(xml.includes('[image non récupérée]'))
  assert.ok(!xml.includes('<w:drawing'))
  assert.ok(xml.includes('Avant.') && xml.includes('Après.'))
})

test("Word : une image dont le téléchargement échoue (réseau) laisse aussi la mention", async () => {
  const { xml } = await xmlWord(async () => {
    throw new Error('réseau coupé')
  })
  assert.ok(xml.includes('[image non récupérée]'))
})
