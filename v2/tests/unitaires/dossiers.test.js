// T1 : les règles des dossiers (domaine/dossiers.js), étape 6c.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  capacites,
  nomDossier,
  refusDeplacementDossier,
  sectionDuDocument,
  peutRanger,
  refusRetrait,
} from '../../domaine/index.js'

test('nom de dossier : NFC, sans espaces autour, non vide, 80 signes au plus', () => {
  assert.deepEqual(nomDossier('  Essais  '), { ok: true, nom: 'Essais' })
  assert.equal(nomDossier('Récits').nom, 'Récits')
  assert.equal(nomDossier('   ').code, 'nom-vide')
  assert.equal(nomDossier(null).code, 'nom-vide')
  assert.equal(nomDossier(['a']).code, 'nom-vide')
  assert.equal(nomDossier('a'.repeat(81)).code, 'nom-trop-long')
})

test('déplacer un dossier : jamais dans lui-même ni dans ses sous-dossiers', () => {
  const d = [
    { id: 'a', parent: null },
    { id: 'b', parent: 'a' },
    { id: 'c', parent: 'b' },
    { id: 'x', parent: null },
  ]
  assert.equal(refusDeplacementDossier(d, 'c', null), null)
  assert.equal(refusDeplacementDossier(d, 'c', 'x'), null)
  assert.equal(refusDeplacementDossier(d, 'a', 'a'), 'deplacement-circulaire')
  assert.equal(refusDeplacementDossier(d, 'a', 'c'), 'deplacement-circulaire')
  assert.equal(refusDeplacementDossier(d, 'a', 'inconnu'), 'dossier-introuvable')
  assert.equal(refusDeplacementDossier(d, 'inconnu', null), 'dossier-introuvable')
})

test('déplacer un dossier : une boucle déjà en base ne fait pas tourner sans fin', () => {
  const d = [
    { id: 'a', parent: 'b' },
    { id: 'b', parent: 'a' },
    { id: 'x', parent: null },
  ]
  assert.equal(refusDeplacementDossier(d, 'x', 'a'), null)
})

test('section : Mes documents s’il est rangé chez moi, sinon Partagé avec moi', () => {
  assert.equal(sectionDuDocument('moi', 'moi'), 'mes-documents')
  assert.equal(sectionDuDocument('autre', 'moi'), 'partage')
  assert.equal(sectionDuDocument(null, 'moi'), 'partage')
})

test('ranger : le propriétaire, s’il est rangé chez lui', () => {
  assert.ok(peutRanger(capacites('proprietaire'), 'moi', 'moi'))
  assert.ok(!peutRanger(capacites('proprietaire'), 'autre', 'moi'), 'un copropriétaire le voit dans Partagé avec moi')
  assert.ok(!peutRanger(capacites('editeur'), 'moi', 'moi'))
})

test('se retirer : toujours, sauf le dernier propriétaire', () => {
  assert.equal(refusRetrait('lecteur', 1), null)
  assert.equal(refusRetrait(null, 1), null, 'un rôle venu du seul lien')
  assert.equal(refusRetrait('proprietaire', 2), null)
  assert.equal(refusRetrait('proprietaire', 1), 'dernier-proprietaire')
})
