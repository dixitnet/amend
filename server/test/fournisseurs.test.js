// Les fournisseurs de modèles (14/10/2026, server/fournisseurs.js) : le serveur
// parle le langage de l'API Messages d'Anthropic ; pour un modèle Mistral, la
// requête est traduite vers /v1/chat/completions du point d'accès européen et
// la réponse retraduite. Faux fetch partout : aucune clé réelle, aucun appel.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fournisseurDe,
  cleDe,
  serviceDe,
  variableDe,
  id9,
  traduireRequete,
  traduireReponse,
  envoyer,
  urlMistral,
} from '../fournisseurs.js'
import { suggestEdit, AIConfigError } from '../ai.js'
import { MODELES } from '../reglagesIa.js'
import { coutUsd, TARIFS_USD } from '../usageIa.js'

test('le fournisseur se lit dans l’identifiant du modèle, et chacun a sa clé et son nom', () => {
  assert.equal(fournisseurDe('claude-haiku-5-5'), 'anthropic')
  assert.equal(fournisseurDe('mistral-large-4-0'), 'mistral')
  assert.equal(fournisseurDe('open-mistral-nemo'), 'mistral')
  assert.equal(serviceDe('mistral-large-4-0'), 'Mistral')
  assert.equal(serviceDe('claude-sonnet-5-5'), 'Claude')
  assert.equal(variableDe('mistral-large-4-0'), 'MISTRAL_API_KEY')
  assert.equal(variableDe('claude-sonnet-5-5'), 'ANTHROPIC_API_KEY')
  const avant = process.env.MISTRAL_API_KEY
  process.env.MISTRAL_API_KEY = 'cle-x'
  assert.equal(cleDe('mistral-large-4-0'), 'cle-x')
  delete process.env.MISTRAL_API_KEY
  assert.equal(cleDe('mistral-large-4-0'), '')
  if (avant) process.env.MISTRAL_API_KEY = avant
})

test('l’adresse de Mistral est le point d’accès européen, sauf essai', () => {
  delete process.env.MISTRAL_API_URL
  assert.equal(urlMistral(), 'https://api.eu.mistral.ai/v1/chat/completions')
  process.env.MISTRAL_API_URL = 'http://127.0.0.1:9/'
  assert.equal(urlMistral(), 'http://127.0.0.1:9/v1/chat/completions')
  delete process.env.MISTRAL_API_URL
})

test('Mistral Large 4 est proposé dans le back-office, avec son tarif', () => {
  const m = MODELES.find((x) => x.id === 'mistral-large-4-0')
  assert.ok(m && m.nom === 'Mistral Large 4')
  assert.ok(TARIFS_USD['mistral-large-4-0'])
  // 1 M d'entrée + 1 M de sortie, point d'accès UE (+ 10 %) : 0,748 + 2,299.
  assert.ok(Math.abs(coutUsd('mistral-large-4-0', { entree: 1e6, sortie: 1e6 }) - 3.047) < 1e-9)
  // Le cache relu n'est pas remisé chez Mistral dans cette estimation (haute).
  assert.ok(Math.abs(coutUsd('mistral-large-4-0', { cacheLu: 1e6 }) - 0.748) < 1e-9)
  assert.ok(Math.abs(coutUsd('claude-sonnet-5-5', { cacheLu: 1e6 }) - 0.2) < 1e-9)
})

test('id9 : neuf caractères alphanumériques, toujours les mêmes pour le même identifiant', () => {
  assert.match(id9('toolu_01ABCxyz9876543210'), /^[A-Za-z0-9]{9}$/)
  assert.equal(id9('toolu_01ABCxyz9876543210'), id9('toolu_01ABCxyz9876543210'))
  assert.equal(id9('toolu_AbCdEf123'), 'AbCdEf123')
})

test('requête : consigne, outils, appels et résultats d’outil, réflexion coupée', () => {
  const corps = traduireRequete({
    model: 'mistral-large-4-0',
    max_tokens: 16384,
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: 'Tu es Margo.', cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'none' },
    tools: [{ name: 'plan', description: 'Le plan', input_schema: { type: 'object', properties: {} } }],
    messages: [
      { role: 'user', content: 'Relis.' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Je regarde.' },
          { type: 'tool_use', id: 'toolu_AbCdEf123', name: 'plan', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_AbCdEf123', content: 'Chapitre 1', is_error: true },
          { type: 'text', text: 'Consigne du service : refais plus petit.' },
        ],
      },
    ],
  })
  assert.equal(corps.model, 'mistral-large-4-0')
  assert.equal(corps.max_tokens, 16384)
  assert.equal(corps.reasoning_effort, 'none')
  assert.equal(corps.thinking, undefined)
  assert.equal(corps.tool_choice, 'none')
  assert.equal(corps.stream, false)
  assert.deepEqual(corps.messages[0], { role: 'system', content: 'Tu es Margo.' })
  assert.deepEqual(corps.messages[1], { role: 'user', content: 'Relis.' })
  assert.equal(corps.messages[2].role, 'assistant')
  assert.equal(corps.messages[2].content, 'Je regarde.')
  assert.equal(corps.messages[2].tool_calls[0].id, 'AbCdEf123')
  assert.equal(corps.messages[2].tool_calls[0].function.name, 'plan')
  assert.equal(corps.messages[2].tool_calls[0].function.arguments, '{}')
  // Le texte qui suit un résultat d'outil rejoint ce résultat : pas de message `user` après un `tool`.
  assert.equal(corps.messages.length, 4)
  assert.equal(corps.messages[3].role, 'tool')
  assert.equal(corps.messages[3].tool_call_id, 'AbCdEf123')
  assert.equal(corps.messages[3].name, 'plan')
  assert.match(corps.messages[3].content, /^\[erreur\] Chapitre 1\n\nConsigne du service/)
  assert.equal(corps.tools[0].type, 'function')
  assert.equal(corps.tools[0].function.parameters.type, 'object')
})

test('réponse : texte, appels d’outil, raison d’arrêt et jetons (cache séparé de l’entrée fraîche)', () => {
  const r = traduireReponse(
    {
      id: 'cmpl-abc',
      choices: [
        {
          message: {
            content: 'Je lis.',
            tool_calls: [{ id: 'xYz987654', type: 'function', function: { name: 'lire', arguments: '{"de":1}' } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 40,
        prompt_tokens_details: { cached_tokens: 600 },
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    },
    'mistral-large-4-0'
  )
  assert.equal(r.model, 'mistral-large-4-0')
  assert.equal(r.stop_reason, 'tool_use')
  assert.deepEqual(r.content[0], { type: 'text', text: 'Je lis.' })
  assert.deepEqual(r.content[1], { type: 'tool_use', id: 'toolu_xYz987654', name: 'lire', input: { de: 1 } })
  assert.equal(r.usage.input_tokens, 400)
  assert.equal(r.usage.cache_read_input_tokens, 600)
  assert.equal(r.usage.output_tokens, 40)
  assert.equal(r.usage.output_tokens_details.thinking_tokens, 5)

  const coupee = traduireReponse({ choices: [{ message: { content: 'Début…' }, finish_reason: 'length' }] }, 'm')
  assert.equal(coupee.stop_reason, 'max_tokens')
  const invalide = traduireReponse(
    {
      choices: [
        {
          message: { tool_calls: [{ id: 'a', function: { name: 'lire', arguments: '{pas du json' } }] },
          finish_reason: 'stop',
        },
      ],
    },
    'm'
  )
  assert.deepEqual(invalide.content[0].input, {})
  assert.equal(invalide.stop_reason, 'tool_use')
})

test('envoyer : un modèle Mistral part au point d’accès européen avec sa clé, un modèle Claude chez Anthropic', async () => {
  const appels = []
  const fetcher = async (url, init) => {
    appels.push({ url, init })
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Bonjour.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  const rep = await envoyer({
    corps: { model: 'mistral-large-4-0', max_tokens: 100, messages: [{ role: 'user', content: 'Salut' }] },
    fetcher,
    apiKey: 'cle-m',
  })
  assert.equal(appels[0].url, 'https://api.eu.mistral.ai/v1/chat/completions')
  assert.equal(appels[0].init.headers.authorization, 'Bearer cle-m')
  assert.equal(rep.ok, true)
  const data = await rep.json()
  assert.equal(data.content[0].text, 'Bonjour.')
  assert.equal(data.stop_reason, 'end_turn')

  await envoyer({ corps: { model: 'claude-haiku-5-5', messages: [] }, fetcher, apiKey: 'cle-a' })
  assert.equal(appels[1].url, 'https://api.anthropic.com/v1/messages')
  assert.equal(appels[1].init.headers['x-api-key'], 'cle-a')
})

test('envoyer : une erreur de Mistral revient au format des erreurs de l’API Messages', async () => {
  const fetcher = async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
  const rep = await envoyer({ corps: { model: 'mistral-large-4-0', messages: [] }, fetcher, apiKey: 'x' })
  assert.equal(rep.ok, false)
  assert.equal(rep.status, 401)
  assert.equal((await rep.json()).error.message, 'Unauthorized')
})

test('Corrections IA sur Mistral : requête traduite, réflexion coupée, suggestion typographiée', async () => {
  const appels = []
  const fetcher = async (url, init) => {
    appels.push({ url, corps: JSON.parse(init.body), headers: init.headers })
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "L'économie se redresse." }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 9 },
      }),
      { status: 200 }
    )
  }
  const r = await suggestEdit(
    { model: 'mistral-large-4-0', apiKey: 'cle-m', fetch: fetcher },
    'Léconomie se redresse.',
    'Corrige.'
  )
  assert.equal(appels.length, 1)
  assert.equal(appels[0].url, 'https://api.eu.mistral.ai/v1/chat/completions')
  assert.equal(appels[0].headers.authorization, 'Bearer cle-m')
  assert.equal(appels[0].corps.reasoning_effort, 'none')
  assert.equal(appels[0].corps.messages[0].role, 'system')
  assert.match(appels[0].corps.messages[1].content, /<passage>\nLéconomie se redresse\.\n<\/passage>/)
  assert.equal(r.suggestion, 'L’économie se redresse.')
  assert.equal(r.usage.entree, 120)
  assert.equal(r.usage.sortie, 9)
  assert.equal(r.usage.arret, 'end_turn')
})

test('Corrections IA sur Mistral : sans clé, l’erreur nomme MISTRAL_API_KEY', async () => {
  const avant = process.env.MISTRAL_API_KEY
  delete process.env.MISTRAL_API_KEY
  try {
    await assert.rejects(
      () => suggestEdit({ model: 'mistral-large-4-0' }, 'Un texte.', 'Corrige.'),
      (err) => err instanceof AIConfigError && /MISTRAL_API_KEY/.test(err.message)
    )
  } finally {
    if (avant) process.env.MISTRAL_API_KEY = avant
  }
})

test('Corrections IA sur Mistral : une réponse coupée par le budget est refusée comme chez Claude', async () => {
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Début tronq' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 10, completion_tokens: 4096 },
      }),
      { status: 200 }
    )
  await assert.rejects(
    () => suggestEdit({ model: 'mistral-large-4-0', apiKey: 'x', fetch: fetcher }, 'Un texte.', 'Corrige.'),
    /coupée avant la fin/
  )
})
