// L'analyse des images orphelines (domaine/imagesOrphelines.js), 14/11/2026.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomsCites, analyserImages, DELAI_GRACE_IMAGES_MS, DOCUMENTS_LISTES_MAX } from '../../domaine/index.js'

const nom = (c, ext = 'jpg') => `${c.repeat(32)}.${ext}`
const octets = (texte) => new TextEncoder().encode(texte)

test('les noms cités : dans n’importe quel octet de l’état, PNG, JPEG et GIF', () => {
  const etat = octets(`\u0001\u0002/api/documents/d1/images/${nom('a')}\u0003xx${nom('b', 'png')}…${nom('c', 'gif')}`)
  assert.deepEqual([...nomsCites(etat)].sort(), [nom('a'), nom('b', 'png'), nom('c', 'gif')])
  assert.equal(nomsCites(octets('rien ici')).size, 0)
  assert.equal(nomsCites(octets(`${'a'.repeat(31)}.jpg`)).size, 0, 'trop court : pas un nom')
  assert.equal(nomsCites(new Uint8Array()).size, 0)
})

test('le rapport : utilisées, orphelines (après le délai de grâce), récentes', () => {
  const maintenant = 1_000_000_000_000
  const vieux = maintenant - DELAI_GRACE_IMAGES_MS - 1
  const r = analyserImages({
    images: [
      { document: 'd1', nom: nom('a'), taille: 100, creeLe: vieux },
      { document: 'd1', nom: nom('b'), taille: 300, creeLe: vieux },
      { document: 'd2', nom: nom('c'), taille: 50, creeLe: vieux },
      { document: 'd2', nom: nom('d'), taille: 7, creeLe: maintenant - 1000 },
    ],
    citees: new Set([nom('a')]),
    maintenant,
  })
  assert.deepEqual(r.total, { n: 4, octets: 457 })
  assert.deepEqual(r.utilisees, { n: 1, octets: 100 })
  assert.deepEqual(r.orphelines, { n: 2, octets: 350 })
  assert.deepEqual(r.recentes, { n: 1, octets: 7 }, 'récente : pas jugée, même sans référence')
  assert.deepEqual(r.documents, [
    { document: 'd1', n: 1, octets: 300 },
    { document: 'd2', n: 1, octets: 50 },
  ])
})

test('une image citée est utilisée, même ancienne ; une image sans document cité n’est jamais orpheline avant le délai', () => {
  const r = analyserImages({
    images: [{ document: 'd', nom: nom('e'), taille: 5, creeLe: 0 }],
    citees: new Set([nom('e')]),
    maintenant: DELAI_GRACE_IMAGES_MS * 10,
  })
  assert.equal(r.orphelines.n, 0)
  assert.equal(r.utilisees.n, 1)
})

test('le rapport liste au plus vingt documents, les plus lourds d’abord', () => {
  const images = Array.from({ length: DOCUMENTS_LISTES_MAX + 5 }, (_, i) => ({
    document: `d${i}`,
    nom: nom(i.toString(16).padStart(1, '0')[0]),
    taille: i + 1,
    creeLe: 0,
  }))
  const r = analyserImages({ images, citees: new Set(), maintenant: DELAI_GRACE_IMAGES_MS * 2 })
  assert.equal(r.documents.length, DOCUMENTS_LISTES_MAX)
  assert.equal(r.documents[0].octets, DOCUMENTS_LISTES_MAX + 5)
  assert.equal(r.orphelines.n, DOCUMENTS_LISTES_MAX + 5)
})
