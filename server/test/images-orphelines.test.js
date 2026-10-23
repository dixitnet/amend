// Les images orphelines (23/10/2026) : ce qui est gardé, ce qui est supprimé,
// et surtout ce qui ne l'est jamais.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { analyserImages, purgerImages, references } from '../imagesOrphelines.js'

const JOUR = 24 * 3600 * 1000
const maintenant = Date.UTC(2026, 9, 23)

/** Un document Yjs avec des images, tel que y-prosemirror l'écrit : un
 * élément `image` dont l'attribut `src` est l'adresse. */
function miseAJourAvecImages(...adresses) {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment('prosemirror')
  for (const src of adresses) {
    const img = new Y.XmlElement('image')
    img.setAttribute('src', src)
    img.setAttribute('largeur', 800)
    fragment.push([img])
  }
  return Buffer.from(Y.encodeStateAsUpdate(doc))
}

function racine() {
  const dir = mkdtempSync(join(tmpdir(), 'amend-orph-'))
  mkdirSync(join(dir, 'uploads'), { recursive: true })
  return dir
}

/** Dépose une image factice, vieille de `ageJours`. */
function image(dir, docId, nom, ageJours = 30, contenu = 'x'.repeat(100)) {
  mkdirSync(join(dir, 'uploads', docId), { recursive: true })
  const chemin = join(dir, 'uploads', docId, nom)
  writeFileSync(chemin, contenu)
  const t = new Date(maintenant - ageJours * JOUR)
  utimesSync(chemin, t, t)
  return chemin
}

const adr = (docId, nom) => `/api/docs/${docId}/images/${nom}`

test('les octets d’une mise à jour Yjs portent l’adresse de l’image en clair', () => {
  // C'est l'hypothèse sur laquelle repose tout le module : si une version de
  // Yjs changeait l'encodage des chaînes, ce test le dirait avant qu'une
  // purge ne supprime une image encore utilisée.
  const octets = miseAJourAvecImages(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png'))
  assert.ok(octets.includes(Buffer.from(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png'))))
})

test('une image du texte est gardée, une image sans référence est orpheline', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  image(dir, 'doc1', 'BBBBBBBBBBBBBBBBBBBBBB.jpg')
  writeFileSync(join(dir, 'doc1.log'), miseAJourAvecImages(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')))
  const a = analyserImages(dir, { maintenant })
  assert.equal(a.fichiers, 2)
  assert.equal(a.orphelines, 1)
  assert.deepEqual(
    a.documents[0].orphelines.map((o) => o.nom),
    ['BBBBBBBBBBBBBBBBBBBBBB.jpg']
  )
  assert.equal(a.documents[0].gardees, 1)
  assert.equal(a.illisibles.length, 0)
})

test('une image présente dans une version enregistrée est gardée', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  mkdirSync(join(dir, 'versions', 'doc1'), { recursive: true })
  writeFileSync(
    join(dir, 'versions', 'doc1', '1790000000000.bin'),
    miseAJourAvecImages(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png'))
  )
  writeFileSync(join(dir, 'doc1.log'), miseAJourAvecImages())
  assert.equal(analyserImages(dir, { maintenant }).orphelines, 0)
})

test('une image de la page publiée est gardée', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  writeFileSync(join(dir, 'doc1.log'), miseAJourAvecImages())
  writeFileSync(join(dir, 'publications.json'), JSON.stringify({ 'abc-def-ghi-jkl': { docId: 'doc1' } }))
  writeFileSync(join(dir, 'pub-abc-def-ghi-jkl.html'), '<figure><img src="images/AAAAAAAAAAAAAAAAAAAAAA.png"></figure>')
  assert.equal(analyserImages(dir, { maintenant }).orphelines, 0)
})

test('une image qu’un AUTRE document référence est gardée (copier-coller entre documents)', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  writeFileSync(join(dir, 'doc1.log'), miseAJourAvecImages())
  writeFileSync(join(dir, 'doc2.log'), miseAJourAvecImages(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')))
  assert.equal(analyserImages(dir, { maintenant }).orphelines, 0)
})

test('le même nom dans un autre document n’en protège pas un autre', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  image(dir, 'doc2', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  writeFileSync(join(dir, 'doc1.log'), miseAJourAvecImages(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')))
  const a = analyserImages(dir, { maintenant })
  assert.equal(a.orphelines, 1)
  assert.equal(a.documents.find((d) => d.orphelines.length).docId, 'doc2')
})

test('le délai de grâce : une image récente n’est jamais une orpheline', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png', 2)
  image(dir, 'doc1', 'BBBBBBBBBBBBBBBBBBBBBB.png', 8)
  const a = analyserImages(dir, { maintenant })
  assert.equal(a.orphelines, 1)
  assert.equal(a.documents[0].recentes, 1)
  const r = purgerImages(dir, { maintenant })
  assert.equal(r.supprimees, 1)
  assert.ok(existsSync(join(dir, 'uploads', 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')), 'la récente reste')
  assert.ok(!existsSync(join(dir, 'uploads', 'doc1', 'BBBBBBBBBBBBBBBBBBBBBB.png')))
})

test('la purge supprime les orphelines, garde le reste, et retire un dossier vidé', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  image(dir, 'doc1', 'BBBBBBBBBBBBBBBBBBBBBB.png', 30, 'y'.repeat(250))
  image(dir, 'vide', 'CCCCCCCCCCCCCCCCCCCCCC.png')
  writeFileSync(join(dir, 'doc1.log'), miseAJourAvecImages(adr('doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')))
  const r = purgerImages(dir, { maintenant })
  assert.equal(r.ok, true)
  assert.equal(r.supprimees, 2)
  assert.equal(r.octets, 350)
  assert.ok(existsSync(join(dir, 'uploads', 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')))
  assert.ok(!existsSync(join(dir, 'uploads', 'vide')), 'dossier vide retiré')
  assert.equal(analyserImages(dir, { maintenant }).orphelines, 0, 'et une seconde passe ne trouve rien')
})

test('une source illisible interrompt tout : rien n’est supprimé', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  // Un « .log » qui est en fait un dossier : la lecture échoue.
  mkdirSync(join(dir, 'doc9.log'))
  const r = purgerImages(dir, { maintenant })
  assert.equal(r.ok, false)
  assert.equal(r.raison, 'source-illisible')
  assert.ok(existsSync(join(dir, 'uploads', 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')))
})

test('seules les images d’uploads/ sont touchées : un autre fichier ou un nom étrange reste en place', () => {
  const dir = racine()
  image(dir, 'doc1', 'AAAAAAAAAAAAAAAAAAAAAA.png')
  const autre = image(dir, 'doc1', 'notes.txt')
  const court = image(dir, 'doc1', 'a.png')
  writeFileSync(join(dir, 'registre.json'), '{}')
  const r = purgerImages(dir, { maintenant })
  assert.equal(r.supprimees, 1)
  assert.ok(existsSync(autre) && existsSync(court), 'ni le .txt ni le nom trop court')
  assert.equal(readFileSync(join(dir, 'registre.json'), 'utf8'), '{}')
})

test('sans dossier uploads ni journaux : rien à dire, rien d’inventé', () => {
  const dir = mkdtempSync(join(tmpdir(), 'amend-orph-vide-'))
  const a = analyserImages(dir, { maintenant })
  assert.equal(a.fichiers, 0)
  assert.equal(a.orphelines, 0)
  assert.deepEqual([...references(dir).refs], [])
  rmSync(dir, { recursive: true, force: true })
})
