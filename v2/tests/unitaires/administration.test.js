// T1 : l'administration de l'instance (domaine/administration.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listeAdministrateurs, estAdministrateur, numeroDeVersion } from '../../domaine/index.js'

test('administrateurs : liste d’adresses normalisées ; jamais une adresse d’essai', () => {
  const l = listeAdministrateurs(' A@Exemple.fr, b@exemple.fr;pas-une-adresse  x@essai.amend.invalid ')
  assert.deepEqual([...l], ['a@exemple.fr', 'b@exemple.fr'])
  assert.ok(estAdministrateur('a@exemple.fr', l))
  assert.ok(estAdministrateur(' A@EXEMPLE.FR ', l))
  assert.ok(!estAdministrateur('c@exemple.fr', l))
  assert.ok(!estAdministrateur('x@essai.amend.invalid', new Set(['x@essai.amend.invalid'])))
  assert.ok(!estAdministrateur(null, l))
  assert.equal(listeAdministrateurs('').size, 0)
  assert.equal(listeAdministrateurs(undefined).size, 0)
})

test('numéro de version : 2.001, 2.042, 2.1234 ; rien sans dépôt', () => {
  assert.equal(numeroDeVersion(1), '2.001')
  assert.equal(numeroDeVersion(42), '2.042')
  assert.equal(numeroDeVersion(1234), '2.1234')
  assert.equal(numeroDeVersion(0), null)
  assert.equal(numeroDeVersion(null), null)
})
