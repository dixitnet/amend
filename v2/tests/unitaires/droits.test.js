// T1 : les rôles et leurs capacités (domaine/droits.js), cas nominaux puis
// cas piégés : un rôle inconnu vaut le plus restrictif, aucun rôle ne donne rien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, roleEffectif, capacites, acces } from '../../domaine/index.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

test('quatre rôles, du plus faible au plus fort', () => {
  assert.deepEqual(ROLES, ['lecteur', 'correcteur', 'editeur', 'proprietaire'])
  assert.ok(Object.isFrozen(ROLES))
})

test('chaque rôle a les capacités du précédent, et les siennes', () => {
  assert.deepEqual(capacites('lecteur'), ['lire'])
  assert.deepEqual(capacites('correcteur'), ['lire', 'commenter', 'suggerer'])
  assert.deepEqual(capacites('editeur'), [
    'lire',
    'commenter',
    'suggerer',
    'ecrire',
    'arbitrer',
    'restaurer',
    'inviter',
  ])
  assert.deepEqual(capacites('proprietaire'), [...capacites('editeur'), 'supprimer', 'transferer'])
  for (let i = 1; i < ROLES.length; i++)
    for (const c of capacites(ROLES[i - 1])) assert.ok(capacites(ROLES[i]).includes(c), `${ROLES[i]} : ${c}`)
})

test("la vie et la mort du document n'appartiennent qu'au propriétaire", () => {
  for (const role of ['lecteur', 'correcteur', 'editeur']) {
    assert.ok(!capacites(role).includes('supprimer'), role)
    assert.ok(!capacites(role).includes('transferer'), role)
  }
  assert.ok(capacites('editeur').includes('inviter'))
  assert.ok(!capacites('correcteur').includes('inviter'))
})

test('traduction en accès au texte : seuls éditeur et propriétaire écrivent', () => {
  assert.equal(acces(capacites('proprietaire')), 'ecriture')
  assert.equal(acces(capacites('editeur')), 'ecriture')
  // Jusqu'à l'étape 5 (suggestions), le correcteur ne fait que lire.
  assert.equal(acces(capacites('correcteur')), 'lecture')
  assert.equal(acces(capacites('lecteur')), 'lecture')
  assert.equal(acces(capacites(null)), null)
})

test('aucun rôle, aucun accès', () => {
  for (const r of [null, undefined]) {
    assert.deepEqual(capacites(r), [])
    assert.equal(acces(capacites(r)), null)
  }
  assert.equal(roleEffectif([]), null)
  assert.equal(roleEffectif([null, undefined]), null)
  assert.equal(roleEffectif(null), null)
  assert.equal(roleEffectif(undefined), null)
})

test('rôle effectif : le plus fort de ceux qui s’appliquent', () => {
  assert.equal(roleEffectif(['lecteur', 'editeur', 'correcteur']), 'editeur')
  assert.equal(roleEffectif(['proprietaire', 'lecteur']), 'proprietaire')
  assert.equal(roleEffectif('correcteur'), 'correcteur')
  // Un rôle inconnu ne gagne jamais sur un rôle connu, et vaut le plus restrictif seul.
  assert.equal(roleEffectif(['administrateur', 'correcteur']), 'correcteur')
  assert.equal(roleEffectif(['administrateur']), 'lecteur')
})

test('rôles piégés : toujours le plus restrictif, jamais une erreur ni plus de droits', () => {
  for (const { texte, raison } of piegees.roles) {
    assert.deepEqual(capacites(texte), ['lire'], raison)
    assert.equal(acces(capacites(texte)), 'lecture', raison)
    assert.equal(roleEffectif([texte]), 'lecteur', raison)
  }
  for (const valeur of [0, 1, true, {}, [], ['editeur']]) {
    assert.deepEqual(capacites(valeur), ['lire'], JSON.stringify(valeur))
    assert.equal(roleEffectif([valeur]), 'lecteur', JSON.stringify(valeur))
  }
})

test('les capacités rendues ne se modifient pas', () => {
  assert.throws(() => capacites('lecteur').push('ecrire'))
  assert.throws(() => capacites(null).push('lire'))
  assert.deepEqual(capacites('lecteur'), ['lire'])
})
