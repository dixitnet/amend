// T1 : les rôles et leurs capacités (domaine/droits.js), cas nominaux puis
// cas piégés : un rôle inconnu vaut le plus restrictif, aucun rôle ne donne rien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, roleEffectif, capacites, accesBranche, peutCommenter } from '../../domaine/index.js'

const surTexte = (role, branche = 'main') => accesBranche(capacites(role), branche)?.texte ?? null
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
  assert.deepEqual(capacites('proprietaire'), [...capacites('editeur'), 'supprimer', 'transferer', 'ranger'])
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

test('texte principal : seuls éditeur et propriétaire écrivent ; correcteur et lecteur lisent', () => {
  assert.equal(surTexte('proprietaire'), 'ecriture')
  assert.equal(surTexte('editeur'), 'ecriture')
  assert.equal(surTexte('correcteur'), 'lecture')
  assert.equal(surTexte('lecteur'), 'lecture')
  assert.equal(surTexte(null), null)
})

test('suggestions : correcteur, éditeur et propriétaire écrivent ; le lecteur ne les voit pas', () => {
  for (const role of ['correcteur', 'editeur', 'proprietaire'])
    assert.equal(surTexte(role, 'suggestions'), 'ecriture', role)
  assert.equal(surTexte('lecteur', 'suggestions'), null)
  assert.equal(surTexte(null, 'suggestions'), null)
})

test('aucune autre branche', () => {
  for (const b of ['autre', 'Main', '', null, undefined, '__proto__', ['main']])
    assert.equal(accesBranche(capacites('proprietaire'), b), null, String(b))
})

test('présence : le correcteur se montre comme l’éditeur, le lecteur reste invisible ; retour à une version : qui écrit le texte', () => {
  assert.equal(accesBranche(capacites('lecteur'), 'main').presence, false)
  for (const role of ['correcteur', 'editeur', 'proprietaire'])
    assert.equal(accesBranche(capacites(role), 'main').presence, true, role)
  for (const role of ['lecteur', 'correcteur'])
    assert.equal(accesBranche(capacites(role), 'main').restaurer, false, role)
  for (const role of ['editeur', 'proprietaire'])
    assert.equal(accesBranche(capacites(role), 'main').restaurer, true, role)
  for (const role of ['correcteur', 'editeur', 'proprietaire']) {
    assert.equal(accesBranche(capacites(role), 'suggestions').presence, false, role)
    assert.equal(accesBranche(capacites(role), 'suggestions').restaurer, false, role)
  }
})

test('commentaires : le lecteur ne commente pas ; le correcteur commente et répond', () => {
  for (const action of ['voir', 'creer', 'repondre', 'reagir', 'modifier', 'supprimer', 'resoudre'])
    assert.equal(peutCommenter(capacites('lecteur'), 'l', action, { auteur: 'l' }), false, action)
  for (const role of ['correcteur', 'editeur', 'proprietaire'])
    for (const action of ['voir', 'creer', 'repondre', 'reagir'])
      assert.ok(peutCommenter(capacites(role), 'x', action), `${role} ${action}`)
  assert.equal(peutCommenter(capacites(null), 'x', 'voir'), false)
})

test('commentaires : on modifie le sien seulement ; l’éditeur modère (supprime, résout) ceux des autres', () => {
  const c = capacites('correcteur')
  const e = capacites('editeur')
  assert.ok(peutCommenter(c, 'carla', 'modifier', { auteur: 'carla' }))
  assert.ok(!peutCommenter(c, 'carla', 'modifier', { auteur: 'bruno' }))
  assert.ok(
    !peutCommenter(e, 'edith', 'modifier', { auteur: 'carla' }),
    'personne ne réécrit le commentaire d’un autre',
  )
  assert.ok(peutCommenter(c, 'carla', 'supprimer', { auteur: 'carla' }))
  assert.ok(!peutCommenter(c, 'carla', 'supprimer', { auteur: 'bruno' }))
  assert.ok(peutCommenter(e, 'edith', 'supprimer', { auteur: 'carla' }))
  assert.ok(peutCommenter(c, 'carla', 'resoudre', { auteur: 'carla' }))
  assert.ok(!peutCommenter(c, 'carla', 'resoudre', { auteur: 'bruno' }))
  assert.ok(peutCommenter(e, 'edith', 'resoudre', { auteur: 'carla' }))
})

test('commentaires : auteur absent ou piégé, action inconnue : refus', () => {
  const c = capacites('correcteur')
  for (const objet of [null, {}, { auteur: undefined }, { auteur: ['carla'] }, { auteur: { toString: () => 'carla' } }])
    assert.ok(!peutCommenter(c, 'carla', 'modifier', objet), JSON.stringify(objet))
  for (const action of ['effacer', '', undefined, '__proto__', 'constructor'])
    assert.ok(!peutCommenter(capacites('proprietaire'), 'x', action, { auteur: 'x' }), String(action))
})

test('aucun rôle, aucun accès', () => {
  for (const r of [null, undefined]) {
    assert.deepEqual(capacites(r), [])
    assert.equal(surTexte(r), null)
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
    assert.equal(accesBranche(capacites(texte), 'main').texte, 'lecture', raison)
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
