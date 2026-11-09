// T1 : les règles des dossiers d'équipe (domaine/equipes.js), étape 6d.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  capacites,
  rolesDonnables,
  refusMembre,
  refusDepart,
  peutModifierEquipe,
  peutGererEquipe,
  deplacementDocument,
} from '../../domaine/index.js'

const c = (role) => capacites(role)

test('membres : seul le gestionnaire les gère ; jamais aucun gestionnaire', () => {
  assert.equal(refusMembre(c('editeur'), null, 'lecteur', 1), 'droit-insuffisant')
  assert.equal(refusMembre(c('proprietaire'), null, 'editeur', 1), null)
  assert.equal(refusMembre(c('proprietaire'), null, 'proprietaire', 1), null, 'nommer un autre gestionnaire')
  assert.equal(refusMembre(c('proprietaire'), 'proprietaire', 'editeur', 1), 'dernier-gestionnaire')
  assert.equal(refusMembre(c('proprietaire'), 'proprietaire', null, 2), null)
  assert.equal(refusMembre(c('proprietaire'), null, 'chef', 2), 'role-invalide')
})

test('partir : toujours, sauf le dernier gestionnaire', () => {
  assert.equal(refusDepart('lecteur', 1), null)
  assert.equal(refusDepart('proprietaire', 2), null)
  assert.equal(refusDepart('proprietaire', 1), 'dernier-gestionnaire')
})

test('dossiers de l’équipe : un éditeur ; l’équipe elle-même : le gestionnaire', () => {
  assert.ok(!peutModifierEquipe(c('correcteur')))
  assert.ok(peutModifierEquipe(c('editeur')))
  assert.ok(!peutGererEquipe(c('editeur')))
  assert.ok(peutGererEquipe(c('proprietaire')))
})

test('document d’équipe : pas de propriétaire nommé, l’équipe l’est', () => {
  assert.deepEqual(rolesDonnables(c('proprietaire'), { dansEquipe: true }), ['lecteur', 'correcteur', 'editeur'])
  assert.deepEqual(rolesDonnables(c('proprietaire')), ['lecteur', 'correcteur', 'editeur', 'proprietaire'])
})

test('déplacer un document : ranger, entrer, sortir, selon les rôles', () => {
  const base = { emplacementEstMoi: true, capsDocument: c('proprietaire'), capsSource: [], capsDestination: [] }
  const d = (o) => deplacementDocument({ ...base, ...o })
  assert.deepEqual(d({ source: null, destination: null }), { action: 'ranger' })
  assert.deepEqual(d({ source: null, destination: null, emplacementEstMoi: false }), { code: 'droit-insuffisant' })
  assert.deepEqual(d({ source: null, destination: null, capsDocument: c('editeur') }), { code: 'droit-insuffisant' })
  assert.deepEqual(d({ source: null, destination: 'e', capsDestination: c('editeur') }), { action: 'entrer' })
  assert.deepEqual(d({ source: null, destination: 'e', capsDestination: c('correcteur') }), {
    code: 'droit-insuffisant',
  })
  assert.deepEqual(d({ source: 'e', destination: 'e', capsSource: c('editeur'), capsDocument: c('editeur') }), {
    action: 'ranger',
  })
  assert.deepEqual(d({ source: 'e', destination: 'e', capsSource: c('lecteur') }), { code: 'droit-insuffisant' })
  assert.deepEqual(d({ source: 'e', destination: null, capsSource: c('editeur') }), { code: 'droit-insuffisant' })
  assert.deepEqual(d({ source: 'e', destination: null, capsSource: c('proprietaire') }), { action: 'sortir' })
  assert.deepEqual(d({ source: 'e', destination: 'f', capsSource: c('proprietaire') }), {
    code: 'deplacement-impossible',
  })
})
