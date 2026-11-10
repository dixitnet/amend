// L'adaptateur IA (étape 8) : une conversation à tours, avec outils, la même
// pour Anthropic (client simulé) et Scaleway (fetch simulé).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creerIA, MODELES, MODELE_PAR_DEFAUT } from '../../adaptateurs/ia/index.js'

const OUTILS = [{ nom: 'lire', description: 'lit', schema: { type: 'object', properties: {} } }]

test('modèles : DeepSeek par défaut ; Fable 5.2, Sonnet 5.5, Haiku 5.5 chez Anthropic', () => {
  assert.equal(MODELE_PAR_DEFAUT, 'deepseek-v4.1-flash-1017')
  assert.equal(MODELES[MODELE_PAR_DEFAUT].fournisseur, 'scaleway')
  for (const m of ['claude-fable-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5'])
    assert.equal(MODELES[m].fournisseur, 'anthropic')
  assert.ok(!('glm-5.3' in MODELES), 'GLM-5.3 n’est pas repris (Sylvain, 10/11/2026)')
})

test('disponible : un modèle connu dont le fournisseur a sa clé ; sinon, modele-indisponible', () => {
  const ia = creerIA({ cleScaleway: 'k' })
  assert.equal(ia.disponible(MODELE_PAR_DEFAUT), true)
  assert.equal(ia.disponible('claude-fable-5-2'), false)
  assert.equal(ia.disponible('inconnu'), false)
  assert.throws(() => ia.conversation({ modele: 'claude-fable-5-2', consigne: 'c' }), { code: 'modele-indisponible' })
})

function anthropicSimule(reponses) {
  const requetes = []
  return {
    requetes,
    messages: {
      stream(corps) {
        requetes.push(structuredClone(corps))
        const r = reponses.shift()
        return { finalMessage: async () => (r instanceof Error ? Promise.reject(r) : r) }
      },
    },
  }
}

test('Anthropic : outils, résultats renvoyés, réflexion jamais coupée, effort et cache envoyés', async () => {
  const client = anthropicSimule([
    {
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'tool_use', id: 't1', name: 'lire', input: { de: 1 } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 2, output_tokens: 3 },
    },
    {
      content: [{ type: 'text', text: 'Fini.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  ])
  const ia = creerIA({ anthropic: client })
  const c = ia.conversation({ modele: 'claude-fable-5-2', consigne: 'Consigne', outils: OUTILS })
  const t1 = await c.tour({ texte: 'Corrige' })
  assert.equal(t1.arret, 'outils')
  assert.deepEqual(t1.appels, [{ id: 't1', nom: 'lire', entree: { de: 1 } }])
  assert.deepEqual(t1.jetons, { entree: 15, sortie: 3, cacheLu: 2 })
  const t2 = await c.tour({ resultats: [{ id: 't1', contenu: 'texte', erreur: false }] })
  assert.equal(t2.arret, 'fin')
  assert.equal(t2.texte, 'Fini.')
  const [r1, r2] = client.requetes
  assert.equal(r1.model, 'claude-fable-5-2')
  assert.equal(r1.system, 'Consigne')
  assert.ok(!('thinking' in r1), 'la réflexion de Fable ne se coupe pas : jamais de paramètre thinking')
  assert.ok(!('tool_choice' in r1), 'pas d’outil imposé')
  assert.deepEqual(r1.output_config, { effort: 'high' })
  assert.deepEqual(r1.cache_control, { type: 'ephemeral' })
  assert.equal(r1.tools[0].name, 'lire')
  // Le second tour renvoie la réponse du premier telle quelle, réflexion comprise.
  assert.equal(r2.messages[1].content[0].type, 'thinking')
  assert.deepEqual(r2.messages[2].content, [{ type: 'tool_result', tool_use_id: 't1', content: 'texte' }])
})

test('Anthropic : refus et longueur rendus en codes ; panne : ia-indisponible, l’historique intact', async () => {
  const client = anthropicSimule([
    new Error('réseau'),
    { content: [], stop_reason: 'refusal', usage: {} },
    { content: [{ type: 'text', text: 'x' }], stop_reason: 'max_tokens', usage: {} },
  ])
  const c = creerIA({ anthropic: client }).conversation({ modele: 'claude-sonnet-5-5', consigne: 'c' })
  await assert.rejects(c.tour({ texte: 'a' }), { code: 'ia-indisponible' })
  assert.equal((await c.tour({ texte: 'a' })).arret, 'refus')
  assert.equal(client.requetes[1].messages.length, 1, 'la demande échouée n’est pas restée dans l’historique')
  assert.equal((await c.tour({ texte: 'b' })).arret, 'longueur')
})

function fetchSimule(reponses) {
  const requetes = []
  const f = async (url, init) => {
    requetes.push({ url, corps: JSON.parse(init.body), entetes: init.headers })
    const r = reponses.shift()
    if (r instanceof Error) throw r
    return { ok: r.statut === undefined || r.statut < 400, status: r.statut ?? 200, json: async () => r.corps }
  }
  return { f, requetes }
}

test('Scaleway : outils au format OpenAI, réflexion none, résultats en messages « tool »', async () => {
  const { f, requetes } = fetchSimule([
    {
      corps: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: '',
              tool_calls: [{ id: 'c1', type: 'function', function: { name: 'lire', arguments: '{"de":2}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 40 } },
      },
    },
    { corps: { choices: [{ finish_reason: 'stop', message: { content: 'Voilà.' } }], usage: {} } },
  ])
  const c = creerIA({ cleScaleway: 'k', fetch: f }).conversation({
    modele: MODELE_PAR_DEFAUT,
    consigne: 'Consigne',
    outils: OUTILS,
  })
  const t1 = await c.tour({ texte: 'Corrige' })
  assert.deepEqual(t1.appels, [{ id: 'c1', nom: 'lire', entree: { de: 2 } }])
  assert.equal(t1.arret, 'outils')
  assert.deepEqual(t1.jetons, { entree: 60, sortie: 7, cacheLu: 40 })
  const t2 = await c.tour({ resultats: [{ id: 'c1', contenu: 'texte' }] })
  assert.equal(t2.texte, 'Voilà.')
  assert.equal(t2.arret, 'fin')
  const [r1, r2] = requetes
  assert.equal(r1.entetes.authorization, 'Bearer k')
  assert.equal(r1.corps.reasoning_effort, 'none')
  assert.equal(r1.corps.tool_choice, 'auto')
  assert.deepEqual(r1.corps.messages[0], { role: 'system', content: 'Consigne' })
  assert.equal(r1.corps.tools[0].function.name, 'lire')
  assert.equal(r2.corps.messages[2].tool_calls[0].id, 'c1')
  assert.deepEqual(r2.corps.messages[3], { role: 'tool', tool_call_id: 'c1', content: 'texte' })
})

test('Scaleway : arguments illisibles, refus du filtre, erreur HTTP', async () => {
  const { f, requetes } = fetchSimule([
    {
      corps: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: { tool_calls: [{ id: 'c', function: { name: 'lire', arguments: '{' } }] },
          },
        ],
      },
    },
    { statut: 503, corps: {} },
    { corps: { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] } },
  ])
  const c = creerIA({ cleScaleway: 'k', fetch: f }).conversation({ modele: MODELE_PAR_DEFAUT, consigne: 'c' })
  assert.deepEqual((await c.tour({ texte: 'a' })).appels[0].entree, { illisible: true })
  await assert.rejects(c.tour({ resultats: [{ id: 'c', contenu: 'x' }] }), { code: 'ia-indisponible' })
  assert.equal((await c.tour({ resultats: [{ id: 'c', contenu: 'x' }] })).arret, 'refus')
  assert.equal(requetes[2].corps.messages.length, 4, 'les résultats refusés par la panne ne sont pas en double')
})

test('résultats et consigne du service dans le même tour : résultats d’abord, chez les deux fournisseurs', async () => {
  const client = anthropicSimule([
    { content: [{ type: 'tool_use', id: 't', name: 'lire', input: {} }], stop_reason: 'tool_use', usage: {} },
    { content: [{ type: 'text', text: 'Bilan.' }], stop_reason: 'end_turn', usage: {} },
  ])
  const c = creerIA({ anthropic: client }).conversation({ modele: 'claude-haiku-5-5', consigne: 'c', outils: OUTILS })
  await c.tour({ texte: 'a' })
  await c.tour({ resultats: [{ id: 't', contenu: 'r' }], texte: 'Fais le bilan.' })
  assert.deepEqual(
    client.requetes[1].messages[2].content.map((b) => b.type),
    ['tool_result', 'text'],
  )
  const { f, requetes } = fetchSimule([
    {
      corps: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: { tool_calls: [{ id: 'x', function: { name: 'lire', arguments: '{}' } }] },
          },
        ],
      },
    },
    { corps: { choices: [{ finish_reason: 'stop', message: { content: 'Bilan.' } }] } },
  ])
  const c2 = creerIA({ cleScaleway: 'k', fetch: f }).conversation({
    modele: MODELE_PAR_DEFAUT,
    consigne: 'c',
    outils: OUTILS,
  })
  await c2.tour({ texte: 'a' })
  await c2.tour({ resultats: [{ id: 'x', contenu: 'r' }], texte: 'Fais le bilan.' })
  assert.deepEqual(
    requetes[1].corps.messages.slice(3).map((m) => m.role),
    ['tool', 'user'],
  )
})

test('Scaleway : une réponse 200 illisible vaut ia-indisponible, sans trace dans l’historique (audit A4)', async () => {
  const requetes = []
  const reponses = [
    { ok: true, status: 200, json: async () => JSON.parse('<html>') },
    { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }) },
  ]
  const f = async (url, init) => (requetes.push(JSON.parse(init.body)), reponses.shift())
  const c = creerIA({ cleScaleway: 'k', fetch: f }).conversation({ modele: MODELE_PAR_DEFAUT, consigne: 'c' })
  await assert.rejects(c.tour({ texte: 'a' }), { code: 'ia-indisponible' })
  await c.tour({ texte: 'b' })
  assert.deepEqual(
    requetes[1].messages.map((m) => m.content),
    ['c', 'b'],
  )
})
