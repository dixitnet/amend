// La logique de « Mes documents » : favoris en haut, dossiers à trois
// niveaux, recherche sans accents, tri, destinations du menu « Déplacer ».

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  arbre,
  chemin,
  compter,
  construireVue,
  dateCorbeille,
  libelleChemin,
  normaliser,
  optionsDeplacement,
  peutCreerDans,
  profondeur,
  trier,
} from '../src/rangementDocs.js'

const DOSSIERS = [
  { id: 'a', nom: 'Thèse', parent: null },
  { id: 'b', nom: 'Chapitres', parent: 'a' },
  { id: 'c', nom: 'Brouillons', parent: 'b' },
  { id: 'z', nom: 'Archives', parent: null },
]
const doc = (id, title, extra = {}) => ({ id, title, updatedAt: 1000, createdAt: 1000, starred: false, dossier: null, ...extra })

test('le chemin et la profondeur d’un dossier', () => {
  assert.deepEqual(chemin(DOSSIERS, 'c').map((d) => d.id), ['a', 'b', 'c'])
  assert.deepEqual(chemin(DOSSIERS, null), [])
  assert.deepEqual(chemin(DOSSIERS, 'inconnu'), [])
  assert.equal(profondeur(DOSSIERS, null), 0)
  assert.equal(profondeur(DOSSIERS, 'c'), 3)
  assert.equal(libelleChemin(DOSSIERS, 'c'), 'Thèse › Chapitres › Brouillons')
})

test('une boucle dans les données ne fait pas tourner indéfiniment', () => {
  const boucle = [{ id: 'x', nom: 'X', parent: 'y' }, { id: 'y', nom: 'Y', parent: 'x' }]
  assert.equal(chemin(boucle, 'x').length, 2)
})

test('on propose de créer un dossier jusqu’au troisième niveau, pas au-delà', () => {
  assert.equal(peutCreerDans(DOSSIERS, null), true)
  assert.equal(peutCreerDans(DOSSIERS, 'b'), true)
  assert.equal(peutCreerDans(DOSSIERS, 'c'), false)
})

test('normaliser : sans accents ni majuscules', () => {
  assert.equal(normaliser('Été À L’Œuvre'), 'ete a l’œuvre')
  assert.equal(normaliser(null), '')
})

test('l’effectif d’un dossier compte ses sous-dossiers', () => {
  const docs = [doc('1', 'a', { dossier: 'c' }), doc('2', 'b', { dossier: 'a' }), doc('3', 'c'), doc('4', 'd', { dossier: 'disparu' })]
  const n = compter(DOSSIERS, docs)
  assert.equal(n.get('a'), 2)
  assert.equal(n.get('b'), 1)
  assert.equal(n.get('c'), 1)
  assert.equal(n.get('z'), 0)
})

test('les tris : récents, titre sans tenir compte des accents, création', () => {
  const docs = [
    doc('1', 'Zèbre', { updatedAt: 1, createdAt: 30 }),
    doc('2', 'école', { updatedAt: 3, createdAt: 10 }),
    doc('3', 'Abeille', { updatedAt: 2, createdAt: 20 }),
  ]
  assert.deepEqual(trier(docs, 'recents').map((d) => d.id), ['2', '3', '1'])
  assert.deepEqual(trier(docs, 'titre').map((d) => d.title), ['Abeille', 'école', 'Zèbre'])
  assert.deepEqual(trier(docs, 'creation').map((d) => d.id), ['1', '3', '2'])
  assert.deepEqual(docs.map((d) => d.id), ['1', '2', '3'], 'la liste d’origine n’est pas modifiée')
})

test('l’arbre des dossiers, dans l’ordre d’un menu', () => {
  assert.deepEqual(arbre(DOSSIERS).map((x) => [x.dossier.id, x.niveau]), [['z', 1], ['a', 1], ['b', 2], ['c', 3]])
  const options = optionsDeplacement(DOSSIERS)
  assert.equal(options[0].id, '')
  assert.deepEqual(options.slice(1).map((o) => o.id), ['z', 'a', 'b', 'c'])
  assert.ok(options[4].libelle.startsWith('    '), 'indentation par niveau')
})

test('à la racine : les sous-dossiers de premier niveau et les documents hors dossier', () => {
  const docs = [doc('1', 'Libre'), doc('2', 'Rangé', { dossier: 'a' })]
  const vue = construireVue({ docs, dossiers: DOSSIERS })
  assert.deepEqual(vue.sousDossiers.map((s) => [s.dossier.id, s.effectif]), [['z', 0], ['a', 1]])
  assert.deepEqual(vue.documents.map((x) => x.doc.id), ['1'])
  assert.equal(vue.recherche, false)
})

test('dans un dossier : ses documents seulement, et le fil d’Ariane', () => {
  const docs = [doc('1', 'Libre'), doc('2', 'Rangé', { dossier: 'b' }), doc('3', 'Plus bas', { dossier: 'c' })]
  const vue = construireVue({ docs, dossiers: DOSSIERS, courant: 'b' })
  assert.deepEqual(vue.fil.map((d) => d.nom), ['Thèse', 'Chapitres'])
  assert.deepEqual(vue.sousDossiers.map((s) => s.dossier.id), ['c'])
  assert.deepEqual(vue.documents.map((x) => x.doc.id), ['2'])
})

test('un dossier ouvert qui n’existe plus ramène à la racine', () => {
  const vue = construireVue({ docs: [doc('1', 'Libre')], dossiers: DOSSIERS, courant: 'fantome' })
  assert.equal(vue.ouvert, null)
  assert.deepEqual(vue.documents.map((x) => x.doc.id), ['1'])
})

test('un document dont le dossier a disparu se retrouve à la racine', () => {
  const vue = construireVue({ docs: [doc('1', 'Orphelin', { dossier: 'disparu' })], dossiers: DOSSIERS })
  assert.deepEqual(vue.documents.map((x) => x.doc.id), ['1'])
})

test('les favoris restent en haut, quel que soit le dossier ouvert, avec leur emplacement', () => {
  const docs = [
    doc('1', 'Favori profond', { starred: true, dossier: 'c' }),
    doc('2', 'Favori libre', { starred: true, updatedAt: 5000 }),
    doc('3', 'Ordinaire'),
  ]
  for (const courant of [null, 'z', 'c']) {
    const vue = construireVue({ docs, dossiers: DOSSIERS, courant })
    assert.deepEqual(vue.favoris.map((f) => f.doc.id), ['2', '1'], `dossier ${courant}`)
  }
  const vue = construireVue({ docs, dossiers: DOSSIERS })
  assert.equal(vue.favoris[1].emplacement, 'Thèse › Chapitres › Brouillons')
  assert.equal(vue.favoris[0].emplacement, '')
})

test('la recherche traverse tous les dossiers, ignore accents et casse, exige tous les mots', () => {
  const docs = [
    doc('1', 'Été 2025 — bilan', { dossier: 'c' }),
    doc('2', 'Bilan annuel'),
    doc('3', 'Autre chose', { dossier: 'a' }),
  ]
  const vue = construireVue({ docs, dossiers: DOSSIERS, courant: 'z', recherche: 'ETE bilan' })
  assert.equal(vue.recherche, true)
  assert.deepEqual(vue.documents.map((x) => x.doc.id), ['1'])
  assert.equal(vue.documents[0].emplacement, 'Thèse › Chapitres › Brouillons')
  assert.deepEqual(vue.sousDossiers, [])
  assert.deepEqual(construireVue({ docs, dossiers: DOSSIERS, recherche: 'bilan' }).documents.map((x) => x.doc.id).sort(), ['1', '2'])
  assert.deepEqual(construireVue({ docs, dossiers: DOSSIERS, recherche: 'introuvable' }).documents, [])
})

test('la recherche filtre aussi les favoris', () => {
  const docs = [doc('1', 'Alpha', { starred: true }), doc('2', 'Beta', { starred: true })]
  assert.deepEqual(construireVue({ docs, dossiers: [], recherche: 'alp' }).favoris.map((f) => f.doc.id), ['1'])
})

test('un titre vide se cherche comme « Sans titre »', () => {
  const vue = construireVue({ docs: [doc('1', '')], dossiers: [], recherche: 'sans titre' })
  assert.equal(vue.documents.length, 1)
})

test('la date d’entrée dans la corbeille', () => {
  assert.equal(dateCorbeille({ corbeille: { le: Date.UTC(2026, 9, 12, 12) } }), '12/10/2026')
  assert.equal(dateCorbeille({}), '')
})
