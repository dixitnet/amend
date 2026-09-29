// La réponse de l'IA, nettoyée (28/09/2026).
//
// Sylvain voyait des paragraphes encadrés par `"""` : le modèle reprenait
// les guillemets triples qui entouraient le passage dans la question. La
// question n'en a plus ; et si le modèle en ajoute quand même, ils sont
// retirés — sans jamais toucher au texte lui-même.

import test from 'node:test'
import assert from 'node:assert/strict'
import { nettoyerSuggestion } from '../ai.js'

test('les enveloppes que le modèle ajoute parfois sont retirées', () => {
  assert.equal(nettoyerSuggestion('"""\nLe chat dort.\n"""'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('```\nLe chat dort.\n```'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('```text\nLe chat dort.\nLe chien aussi.\n```'), 'Le chat dort.\nLe chien aussi.')
  assert.equal(nettoyerSuggestion('<passage>\nLe chat dort.\n</passage>'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('"Le chat dort."'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('« Le chat dort. »'), 'Le chat dort.')
  assert.equal(nettoyerSuggestion('"""\n"Le chat dort."\n"""'), 'Le chat dort.')
})

test('le texte lui-même n’est jamais touché', () => {
  // Des guillemets à l'intérieur, ou d'un seul côté, ne sont pas une enveloppe.
  assert.equal(nettoyerSuggestion('Il a dit "non" puis "oui".'), 'Il a dit "non" puis "oui".')
  assert.equal(nettoyerSuggestion('"Bonjour", dit-il.'), '"Bonjour", dit-il.')
  assert.equal(nettoyerSuggestion('Le chat dort.\n\nLe chien court.'), 'Le chat dort.\n\nLe chien court.')
  assert.equal(nettoyerSuggestion('  Le chat dort.  '), 'Le chat dort.')
  assert.equal(nettoyerSuggestion(''), '')
})

// --- L'appel lui-même, avec une fausse API (30/09/2026) -----------------------
//
// Sylvain voyait des paragraphes longs « remplacés par un paragraphe
// tronqué » : Sonnet 5 réfléchit par défaut, la réflexion compte dans
// `max_tokens` (2 048 à l'époque), et la réponse coupée était insérée telle
// quelle. Ici : la réflexion est coupée, le budget suit le passage, une
// réponse coupée est refusée, et le repli pour les modèles qui refusent
// `disabled`. Aucune clé réelle : `config.fetch` est une fausse API.

import { suggestEdit, budgetDeSortie, corpsDeRequete, AIRequestError } from '../ai.js'

const CLE_FACTICE = 'sk-test-factice'

/** Une fausse API : `reponses` est la liste des réponses à rendre, dans
 * l'ordre ; les requêtes reçues sont gardées pour inspection. */
function fausseApi(...reponses) {
  const requetes = []
  const fetcher = async (url, options) => {
    requetes.push(JSON.parse(options.body))
    const r = reponses.shift()
    return {
      ok: r.status === 200,
      status: r.status,
      json: async () => r.body,
    }
  }
  return { fetcher, requetes }
}

const reponseTexte = (texte, extra = {}) => ({
  status: 200,
  body: {
    content: [{ type: 'text', text: texte }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
    ...extra,
  },
})

test('la réflexion du modèle est désactivée et le budget de sortie suit le passage', async () => {
  const api = fausseApi(reponseTexte('Le chômage est stable.'))
  const r = await suggestEdit({ apiKey: CLE_FACTICE, fetch: api.fetcher }, 'Le chomage est stable.', 'Corrige.')
  assert.equal(r.suggestion, 'Le chômage est stable.')
  assert.equal(api.requetes.length, 1)
  assert.deepEqual(api.requetes[0].thinking, { type: 'disabled' })
  assert.equal(api.requetes[0].max_tokens, 4096, 'jamais en dessous du plancher')
  assert.equal(r.usage.reflexion, 0)
  assert.equal(r.usage.arret, 'end_turn')

  // Un long passage : le budget monte avec lui, jusqu'au plafond.
  assert.equal(budgetDeSortie('x'.repeat(2700)), 4096)
  assert.equal(budgetDeSortie('x'.repeat(7000)), 4667)
  assert.equal(budgetDeSortie('x'.repeat(20000)), 8192)
  assert.equal(corpsDeRequete({ model: 'm', text: 'x'.repeat(7000), instruction: 'i' }).max_tokens, 4667)
})

test('une réponse coupée par le budget est refusée, jamais insérée — et sa consommation remonte', async () => {
  const api = fausseApi(
    reponseTexte('Le début seulement', {
      stop_reason: 'max_tokens',
      usage: { input_tokens: 1478, output_tokens: 2048, output_tokens_details: { thinking_tokens: 937 } },
    })
  )
  await assert.rejects(
    suggestEdit({ apiKey: CLE_FACTICE, fetch: api.fetcher }, 'Un paragraphe.', 'Corrige.'),
    (err) => {
      assert.ok(err instanceof AIRequestError)
      assert.match(err.message, /coupée/)
      assert.equal(err.status, 502)
      assert.deepEqual(err.usage, { entree: 1478, sortie: 2048, reflexion: 937, arret: 'max_tokens' })
      return true
    }
  )
})

test('un modèle qui refuse « disabled » est rappelé avec « between_tools »', async () => {
  const api = fausseApi(
    { status: 400, body: { error: { type: 'invalid_request_error', message: 'thinking.type: disabled is not supported on this model' } } },
    reponseTexte('Corrigé.')
  )
  const r = await suggestEdit({ apiKey: CLE_FACTICE, fetch: api.fetcher }, 'Corrigé', 'Corrige.')
  assert.equal(r.suggestion, 'Corrigé.')
  assert.equal(api.requetes.length, 2)
  assert.deepEqual(api.requetes[0].thinking, { type: 'disabled' })
  assert.deepEqual(api.requetes[1].thinking, { type: 'between_tools' })
})

test('une autre erreur 400 n’est pas rejouée', async () => {
  const api = fausseApi({ status: 400, body: { error: { message: 'max_tokens: trop grand' } } })
  await assert.rejects(suggestEdit({ apiKey: CLE_FACTICE, fetch: api.fetcher }, 'Texte', 'Corrige.'), /400 : max_tokens/)
  assert.equal(api.requetes.length, 1)
})

test('les repères de notes sont expliqués au modèle', () => {
  const corps = corpsDeRequete({ model: 'm', text: 'Un texte⟦1⟧ suivi.', instruction: 'Corrige.' })
  assert.match(corps.system, /⟦1⟧/)
  assert.match(corps.messages[0].content, /Un texte⟦1⟧ suivi\./)
})
