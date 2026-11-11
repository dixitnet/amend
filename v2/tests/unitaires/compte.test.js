// La suppression d'un compte (domaine/compte.js), lots du 11/11/2026, lot D.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSuppressionCompte, confirmationSuppressionValide } from '../../domaine/index.js'

const doc = (id, acces) => ({ id, titre: id, acces })
test('documents : quitté, confié au plus ancien éditeur, refusé, supprimé', () => {
  const plan = planSuppressionCompte({
    moi: 'm',
    documents: [
      doc('co', [
        { personne: 'm', role: 'proprietaire' },
        { personne: 'x', role: 'proprietaire' },
      ]),
      doc('ed', [
        { personne: 'm', role: 'proprietaire' },
        { personne: 'l', role: 'lecteur' },
        { personne: 'e1', role: 'editeur' },
        { personne: 'e2', role: 'editeur' },
      ]),
      doc('lect', [
        { personne: 'm', role: 'proprietaire' },
        { personne: 'c', role: 'correcteur' },
      ]),
      doc('seul', [{ personne: 'm', role: 'proprietaire' }]),
      doc('invite', [
        { personne: 'x', role: 'proprietaire' },
        { personne: 'm', role: 'editeur' },
      ]),
    ],
    equipes: [],
  })
  assert.deepEqual(
    plan.documents.map((d) => [d.id, d.sort, d.a]),
    [
      ['co', 'quitte', undefined],
      ['ed', 'confie', 'e1'],
      ['lect', 'refus', undefined],
      ['seul', 'supprime', undefined],
      ['invite', 'quitte', undefined],
    ],
  )
  assert.equal(plan.peut, false, 'un refus bloque tout')
})

test('équipes : quittée, refusée au dernier gestionnaire, supprimée si seule', () => {
  const plan = planSuppressionCompte({
    moi: 'm',
    documents: [],
    equipes: [
      {
        id: 'a',
        nom: 'A',
        membres: [
          { personne: 'm', role: 'editeur' },
          { personne: 'g', role: 'proprietaire' },
        ],
      },
      {
        id: 'b',
        nom: 'B',
        membres: [
          { personne: 'm', role: 'proprietaire' },
          { personne: 'x', role: 'lecteur' },
        ],
      },
      { id: 'c', nom: 'C', membres: [{ personne: 'm', role: 'proprietaire' }] },
      {
        id: 'd',
        nom: 'D',
        membres: [
          { personne: 'm', role: 'proprietaire' },
          { personne: 'g', role: 'proprietaire' },
        ],
      },
    ],
  })
  assert.deepEqual(
    plan.equipes.map((e) => [e.id, e.sort]),
    [
      ['a', 'quitte'],
      ['b', 'refus'],
      ['c', 'supprime'],
      ['d', 'quitte'],
    ],
  )
  assert.equal(plan.peut, false)
  assert.equal(planSuppressionCompte({ moi: 'm', documents: [], equipes: [] }).peut, true)
})

test('confirmation : l’adresse en toutes lettres, sans casse', () => {
  assert.equal(confirmationSuppressionValide(' Alice@Exemple.fr ', 'alice@exemple.fr'), true)
  assert.equal(confirmationSuppressionValide('alice', 'alice@exemple.fr'), false)
  assert.equal(confirmationSuppressionValide(undefined, 'alice@exemple.fr'), false)
})
