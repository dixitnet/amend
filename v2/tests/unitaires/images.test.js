// Les images d'un document (domaine/images.js), lots du 11/11/2026, lot B.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IMAGE_MAX_OCTETS,
  IMAGES_DOCUMENT_MAX_OCTETS,
  typeImage,
  refusImage,
  nomImageValide,
  refusEntree,
  dimensionsReduites,
  garderOriginal,
  IMAGE_ENTREE_MAX_OCTETS,
  IMAGE_LARGEUR_MAX_PX,
} from '../../domaine/index.js'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])

test('type d’une image : d’après ses premiers octets, PNG, JPEG et GIF seulement', () => {
  assert.deepEqual(typeImage(PNG), { type: 'image/png', extension: 'png' })
  assert.deepEqual(typeImage(JPEG), { type: 'image/jpeg', extension: 'jpg' })
  assert.equal(typeImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.deepEqual(typeImage(new TextEncoder().encode('GIF89a')), { type: 'image/gif', extension: 'gif' })
  assert.deepEqual(typeImage(new TextEncoder().encode('GIF87a')), { type: 'image/gif', extension: 'gif' })
  assert.equal(typeImage(new TextEncoder().encode('GIF88a')), null, 'une version de GIF inconnue')
  assert.equal(typeImage(new TextEncoder().encode('GIF8')), null, 'GIF tronqué')
  assert.equal(typeImage(new Uint8Array()), null)
})

test('refus : vide, trop lourde, document plein, type inconnu', () => {
  assert.equal(refusImage(PNG), null)
  assert.equal(refusImage(new Uint8Array()), 'image-vide')
  const lourde = new Uint8Array(IMAGE_MAX_OCTETS + 1)
  lourde.set(PNG)
  assert.equal(refusImage(lourde), 'image-trop-lourde')
  assert.equal(refusImage(PNG, IMAGES_DOCUMENT_MAX_OCTETS - 2), 'images-document-pleines')
  assert.equal(refusImage(Uint8Array.from([1, 2, 3])), 'image-type-refuse')
})

test('nom d’une image gardée : aucun chemin possible', () => {
  assert.equal(nomImageValide(`${'a'.repeat(32)}.png`), true)
  assert.equal(nomImageValide(`${'a'.repeat(32)}.svg`), false)
  assert.equal(nomImageValide('../x.png'), false)
  assert.equal(nomImageValide(null), false)
})

test('nom d’une image gardée : le GIF est permis', () => {
  assert.equal(nomImageValide(`${'b'.repeat(32)}.gif`), true)
})

test('refus avant réduction : vide, trop lourde (25 Mo), type inconnu', () => {
  assert.equal(refusEntree({ type: 'image/png', octets: 3 }), null)
  assert.equal(refusEntree({ type: 'image/gif', octets: 3 }), null)
  assert.equal(refusEntree({ type: 'image/jpeg', octets: IMAGE_ENTREE_MAX_OCTETS }), null)
  assert.equal(refusEntree({ type: 'image/jpeg', octets: IMAGE_ENTREE_MAX_OCTETS + 1 }), 'image-entree-trop-lourde')
  assert.equal(refusEntree({ type: 'image/png', octets: 0 }), 'image-vide')
  assert.equal(refusEntree({ type: 'image/webp', octets: 3 }), 'image-type-refuse')
  assert.equal(refusEntree({ type: '', octets: 3 }), 'image-type-refuse')
})

test('réduction : 2 000 px de large au plus, jamais agrandie, proportions gardées', () => {
  assert.deepEqual(dimensionsReduites(4000, 3000), { largeur: 2000, hauteur: 1500, facteur: 0.5 })
  assert.deepEqual(dimensionsReduites(1000, 500), { largeur: 1000, hauteur: 500, facteur: 1 })
  assert.equal(dimensionsReduites(IMAGE_LARGEUR_MAX_PX, 10).largeur, 2000)
  assert.deepEqual(dimensionsReduites(20000, 1), { largeur: 2000, hauteur: 1, facteur: 0.1 })
})

test('l’original est gardé : un GIF dans les limites ; un PNG ou JPEG non réduit qui ne pèse pas plus que son ré-encodage', () => {
  const gif = { type: 'image/gif', octets: 1000, largeur: 300 }
  assert.equal(garderOriginal(gif), true, 'GIF : l’animation est gardée')
  assert.equal(garderOriginal({ ...gif, octets: IMAGE_MAX_OCTETS + 1 }), false, 'GIF trop lourd : ré-encodé')
  assert.equal(garderOriginal({ ...gif, largeur: 2001 }), false, 'GIF trop large : ré-encodé')
  const png = { type: 'image/png', octets: 1000, largeur: 800 }
  assert.equal(garderOriginal(png, 1200), true)
  assert.equal(garderOriginal(png, 900), false, 'le ré-encodage pèse moins')
  assert.equal(garderOriginal(png), false, 'sans ré-encodage calculé')
  assert.equal(garderOriginal({ ...png, largeur: 2400 }, 5000), false, 'à réduire')
  assert.equal(garderOriginal({ type: 'image/webp', octets: 1, largeur: 1 }, 5), false)
})
