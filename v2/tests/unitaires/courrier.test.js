// T1 : l'adaptateur de courrier ne parle jamais à Mailgun pour une adresse
// en .invalid (comptes de développement et d'essai), même avec une clé.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creerCourrier } from '../../adaptateurs/courrier/index.js'

test('courrier : une adresse en .invalid ne part jamais, même avec une clé', async (t) => {
  const appels = []
  t.mock.method(globalThis, 'fetch', async (...a) => (appels.push(a), new Response('{}')))
  t.mock.method(console, 'log', () => {})
  const c = creerCourrier({ cle: 'cle-factice', domaine: 'mg.exemple.fr', expediteur: 'x <x@y.fr>' })
  await c.envoyer({ a: '61@essai.amend.invalid', sujet: 's', texte: 't', html: 'h' })
  await c.envoyer({ a: ' 62@dev.amend.INVALID ', sujet: 's', texte: 't', html: 'h' })
  assert.equal(appels.length, 0)
  assert.equal(c.envoyes.length, 2)
  await c.envoyer({ a: 'quelqu.un@exemple.fr', sujet: 's', texte: 't', html: 'h' })
  assert.equal(appels.length, 1, 'une vraie adresse part')
})
