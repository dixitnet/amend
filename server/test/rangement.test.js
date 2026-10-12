// Le rangement personnel (12/10/2026, server/rangement.js) : dossiers sur
// trois niveaux, un document dans un seul dossier, favoris, suppression d'un
// dossier qui ne perd rien, élagage des orphelines — et la migration des
// anciennes étoiles.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Rangements, PROFONDEUR_MAX, DOSSIERS_MAX, nomDeDossier } from '../rangement.js'
import { Storage } from '../storage.js'
import { migrerDonnees } from '../donnees.js'

const ALICE = 'alice@test.local'
const BOB = 'bob@test.local'

function neuf() {
  const d = mkdtempSync(join(tmpdir(), 'amend-rangement-'))
  process.on('exit', () => rmSync(d, { recursive: true, force: true }))
  return { dir: d, r: new Rangements(d) }
}
const refus = (fn, statut, motif) =>
  assert.throws(fn, (e) => e.status === statut && (!motif || motif.test(e.message)), `attendu ${statut} ${motif || ''}`)

test('un rangement neuf est vide, et chacun a le sien', () => {
  const { r } = neuf()
  assert.deepEqual(r.lire(ALICE), { version: 1, dossiers: [], placement: {}, favoris: [] })
  r.creerDossier(ALICE, 'Thèse')
  assert.equal(r.lire(ALICE).dossiers.length, 1)
  assert.equal(r.lire(BOB).dossiers.length, 0, 'le rangement d’Alice n’est pas celui de Bob')
})

test('les noms sont nettoyés, non vides, uniques dans un même dossier', () => {
  const { r } = neuf()
  assert.equal(nomDeDossier('  Mes\n  chapitres  '), 'Mes chapitres')
  assert.equal(nomDeDossier('x'.repeat(200)).length, 60)
  refus(() => r.creerDossier(ALICE, '   '), 400)
  const { dossier: these } = r.creerDossier(ALICE, 'Thèse')
  refus(() => r.creerDossier(ALICE, 'thèse'), 409, /déjà un dossier/)
  // Le même nom dans un autre dossier est permis.
  const { dossier: ch } = r.creerDossier(ALICE, 'Chapitres', these.id)
  assert.equal(ch.parent, these.id)
  r.creerDossier(ALICE, 'Chapitres')
})

test('trois niveaux au plus', () => {
  const { r } = neuf()
  assert.equal(PROFONDEUR_MAX, 3)
  const a = r.creerDossier(ALICE, 'A').dossier
  const b = r.creerDossier(ALICE, 'B', a.id).dossier
  const c = r.creerDossier(ALICE, 'C', b.id).dossier
  refus(() => r.creerDossier(ALICE, 'D', c.id), 400, /3 niveaux/)
  // Déplacer un dossier chargé sous un autre : la profondeur de tout le sous-arbre compte.
  const x = r.creerDossier(ALICE, 'X').dossier
  r.creerDossier(ALICE, 'Y', x.id)
  refus(() => r.deplacerDossier(ALICE, x.id, c.id), 400, /3 niveaux/)
  refus(() => r.deplacerDossier(ALICE, x.id, b.id), 400, /3 niveaux/)
  assert.equal(r.deplacerDossier(ALICE, x.id, a.id).dossier.parent, a.id, 'A › X › Y tient en 3')
})

test('un dossier ne se range ni dans lui-même ni dans un descendant', () => {
  const { r } = neuf()
  const a = r.creerDossier(ALICE, 'A').dossier
  const b = r.creerDossier(ALICE, 'B', a.id).dossier
  refus(() => r.deplacerDossier(ALICE, a.id, a.id), 400)
  refus(() => r.deplacerDossier(ALICE, a.id, b.id), 400, /dans lui-même/)
  assert.equal(r.deplacerDossier(ALICE, b.id, null).dossier.parent, null)
})

test('renommer, avec les mêmes règles', () => {
  const { r } = neuf()
  const a = r.creerDossier(ALICE, 'A').dossier
  r.creerDossier(ALICE, 'B')
  refus(() => r.renommerDossier(ALICE, a.id, 'b'), 409)
  assert.equal(
    r.renommerDossier(ALICE, a.id, 'a', null).dossier.nom,
    'a',
    'se renommer en changeant la casse est permis'
  )
  refus(() => r.renommerDossier(ALICE, 'd_inconnu', 'Z'), 404)
})

test('ranger un document : un seul dossier à la fois, ou la racine', () => {
  const { r } = neuf()
  const a = r.creerDossier(ALICE, 'A').dossier
  const b = r.creerDossier(ALICE, 'B').dossier
  r.placerDocument(ALICE, 'doc1', a.id)
  assert.equal(r.lire(ALICE).placement.doc1, a.id)
  r.placerDocument(ALICE, 'doc1', b.id)
  assert.equal(r.lire(ALICE).placement.doc1, b.id, 'il a quitté A')
  r.placerDocument(ALICE, 'doc1', null)
  assert.equal(r.lire(ALICE).placement.doc1, undefined)
  refus(() => r.placerDocument(ALICE, 'doc1', 'd_inconnu'), 404)
})

test('supprimer un dossier ne perd rien : documents et sous-dossiers remontent', () => {
  const { r } = neuf()
  const a = r.creerDossier(ALICE, 'A').dossier
  const b = r.creerDossier(ALICE, 'B', a.id).dossier
  r.creerDossier(ALICE, 'B') // un « B » existe déjà à la racine : le sous-dossier remonté est renommé
  r.placerDocument(ALICE, 'd1', a.id)
  r.placerDocument(ALICE, 'd2', b.id)
  const apres = r.supprimerDossier(ALICE, a.id)
  assert.equal(apres.dossiers.length, 2)
  assert.equal(apres.dossiers.find((d) => d.id === b.id).parent, null)
  assert.equal(new Set(apres.dossiers.map((d) => d.nom.toLowerCase())).size, 2, 'pas de doublon à la racine')
  assert.equal(apres.placement.d1, undefined, 'à la racine')
  assert.equal(apres.placement.d2, b.id, 'son dossier est resté')

  // Un dossier de second niveau supprimé : ses documents remontent au premier.
  const p = r.creerDossier(ALICE, 'P').dossier
  const q = r.creerDossier(ALICE, 'Q', p.id).dossier
  r.placerDocument(ALICE, 'd3', q.id)
  assert.equal(r.supprimerDossier(ALICE, q.id).placement.d3, p.id)
})

test('les favoris sont personnels et se défont', () => {
  const { r } = neuf()
  r.favori(ALICE, 'doc1', true)
  r.favori(ALICE, 'doc1', true)
  assert.deepEqual(r.lire(ALICE).favoris, ['doc1'], 'pas de doublon')
  assert.equal(r.estFavori(ALICE, 'doc1'), true)
  assert.equal(r.estFavori(BOB, 'doc1'), false)
  r.favori(ALICE, 'doc1', false)
  assert.deepEqual(r.lire(ALICE).favoris, [])
})

test('les entrées orphelines sont écartées à la lecture et oubliées à l’écriture', () => {
  const { r } = neuf()
  const a = r.creerDossier(ALICE, 'A').dossier
  r.placerDocument(ALICE, 'vivant', a.id)
  r.placerDocument(ALICE, 'disparu', a.id)
  r.favori(ALICE, 'vivant', true)
  r.favori(ALICE, 'disparu', true)
  const visibles = new Set(['vivant'])
  const vu = r.elaguer(r.lire(ALICE), visibles)
  assert.deepEqual(Object.keys(vu.placement), ['vivant'])
  assert.deepEqual(vu.favoris, ['vivant'])
  r.favori(ALICE, 'autre', true, visibles)
  assert.deepEqual(r.lire(ALICE).favoris.sort(), ['autre', 'vivant'].sort(), 'l’écriture a oublié « disparu »')
})

test('au plus cent dossiers', () => {
  const { r } = neuf()
  for (let i = 0; i < DOSSIERS_MAX; i++) r.creerDossier(ALICE, `d${i}`)
  refus(() => r.creerDossier(ALICE, 'de trop'), 403, /limite/)
})

test('le fichier de rangement ne porte l’adresse de personne dans son nom ni dans son contenu', () => {
  const { dir, r } = neuf()
  r.creerDossier(ALICE, 'Secret')
  const fichiers = readdirSync(join(dir, 'rangements'))
  assert.equal(fichiers.length, 1)
  assert.ok(!fichiers[0].includes('alice'), 'nom dérivé de l’identifiant du compte')
  assert.ok(!readFileSync(join(dir, 'rangements', fichiers[0]), 'utf8').includes('@'))
})

// --- La migration des étoiles ---------------------------------------------------

test('migration : un document étoilé devient favori de tous ses membres, une seule fois', () => {
  const { dir, r } = neuf()
  const s = new Storage(dir)
  const d1 = s.createDoc('Étoilé', ALICE)
  s.grantAccess(d1.id, BOB, 'correcteur')
  const d2 = s.createDoc('Pas étoilé', ALICE)
  // L'ancien format : le champ `starred` dans la fiche.
  const reg = s._readRegistry()
  reg[d1.id].starred = true
  s._writeRegistry(reg)

  const migrations = [{ version: 2, nom: 'étoiles', appliquer: () => s.migrerEtoilesVersFavoris(r) }]
  const res = migrerDonnees(dir, migrations, { cible: 2 })
  assert.deepEqual(res.appliquees, ['étoiles'])
  assert.deepEqual(r.lire(ALICE).favoris, [d1.id])
  assert.deepEqual(r.lire(BOB).favoris, [d1.id], 'même un correcteur a désormais son favori')
  assert.ok(!('starred' in s._readRegistry()[d1.id]), 'le champ ancien est retiré')
  assert.ok(existsSync(join(dir, 'docs.json.avant-v1')), 'le registre d’avant est gardé')

  // Rejouée (après une coupure, par exemple) : rien ne double.
  assert.equal(s.migrerEtoilesVersFavoris(r), 0)
  assert.deepEqual(r.lire(ALICE).favoris, [d1.id])
  assert.equal(d2.id !== d1.id, true)
})
