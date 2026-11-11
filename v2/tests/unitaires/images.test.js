// Les images d'un document (domaine/images.js), lots du 11/11/2026, lot B.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IMAGE_MAX_OCTETS,
  IMAGES_DOCUMENT_MAX_OCTETS,
  typeImage,
  refusImage,
  nomImageValide,
} from '../../domaine/index.js'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0])

test('type d’une image : d’après ses premiers octets, PNG et JPEG seulement', () => {
  assert.deepEqual(typeImage(PNG), { type: 'image/png', extension: 'png' })
  assert.deepEqual(typeImage(JPEG), { type: 'image/jpeg', extension: 'jpg' })
  assert.equal(typeImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.equal(typeImage(new TextEncoder().encode('GIF89a')), null)
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
