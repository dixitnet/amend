// T1 : les règles des dossiers (domaine/dossiers.js), étape 6c.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nomDossier, refusDeplacementDossier, sectionDuDocument, refusRetrait } from '../../domaine/index.js'

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

test('section : son équipe si j’en suis membre, Mes documents s’il est rangé chez moi, sinon Partagé avec moi', () => {
  assert.equal(sectionDuDocument({ emplacement: 'moi' }, 'moi'), 'mes-documents')
  assert.equal(sectionDuDocument({ emplacement: 'autre' }, 'moi'), 'partage')
  assert.equal(sectionDuDocument({ emplacement: null }, 'moi'), 'partage')
  assert.equal(sectionDuDocument({ emplacement: null, equipe: 'e' }, 'moi', new Set(['e'])), 'equipe')
  assert.equal(sectionDuDocument({ emplacement: null, equipe: 'e' }, 'moi', new Set()), 'partage', 'hors de l’équipe')
})

test('se retirer : toujours, sauf le dernier propriétaire', () => {
  assert.equal(refusRetrait('lecteur', 1), null)
  assert.equal(refusRetrait(null, 1), null, 'un rôle venu du seul lien')
  assert.equal(refusRetrait('proprietaire', 2), null)
  assert.equal(refusRetrait('proprietaire', 1), 'dernier-proprietaire')
})

test('nom de dossier ou d’équipe : les règles d’un nom de personne (audit du 10/11/2026)', () => {
  assert.equal(nomDossier('a\u202Eb').code, 'nom-caracteres', 'inversion du sens d’écriture')
  assert.equal(nomDossier('a\u200Bb').code, 'nom-caracteres', 'espace sans chasse')
  assert.equal(nomDossier('Les\n  essais').nom, 'Les essais')
  assert.equal(nomDossier('é'.repeat(80)).ok, true, '80 signes comptés en points de code')
  assert.equal(nomDossier('😀'.repeat(81)).code, 'nom-trop-long')
})
