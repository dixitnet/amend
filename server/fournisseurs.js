// Les fournisseurs de modèles (14/10/2026). Le serveur parle **un seul langage**
// — l'API Messages d'Anthropic : server/ai.js (Corrections IA) et
// server/dialogue.js (Margo) fabriquent des requêtes à ce format. Ce module
// choisit où les envoyer selon le modèle :
//   - `claude-*`  : à Anthropic, telles quelles ;
//   - `mistral-*` : à Mistral (point d'accès européen), après traduction vers
//     /v1/chat/completions (outils → `function`, tool_use ↔ tool_calls, arrêt
//     par longueur → max_tokens, jetons), puis la réponse est retraduite au
//     format Messages. Le reste du code ne voit aucune différence.
// La traduction est celle de la passerelle du banc d'essai
// (banc-modeles/passerelle-mistral.js), qui a servi à mesurer Mistral Large 4
// sur Corrections IA et sur Margo (rapports du volet 1 et du volet 2).
// Les clés viennent de l'environnement du serveur (ANTHROPIC_API_KEY,
// MISTRAL_API_KEY) : jamais lues ailleurs, jamais journalisées.

import { createHash } from 'node:crypto'

/** L'adresse des messages de l'API Anthropic. `ANTHROPIC_API_URL` ne sert qu'aux
 * essais (un faux serveur local : `tools/faux-anthropic.js`) ; en production la
 * variable est absente. */
export function urlAnthropic() {
  return `${(process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`
}

/** L'adresse des complétions de Mistral : le point d'accès **européen**.
 * `MISTRAL_API_URL` ne sert qu'aux essais. */
export function urlMistral() {
  return `${(process.env.MISTRAL_API_URL || 'https://api.eu.mistral.ai').replace(/\/$/, '')}/v1/chat/completions`
}

const MODELE_MISTRAL = /^(open-)?(mistral|ministral|magistral|codestral|devstral|pixtral)/i

/** 'anthropic' ou 'mistral', d'après l'identifiant du modèle. */
export function fournisseurDe(modele) {
  return MODELE_MISTRAL.test(String(modele || '')) ? 'mistral' : 'anthropic'
}

const SERVICES = {
  anthropic: { nom: 'Claude', variable: 'ANTHROPIC_API_KEY' },
  mistral: { nom: 'Mistral', variable: 'MISTRAL_API_KEY' },
}

/** La clé du fournisseur de ce modèle (chaîne vide si absente). */
export function cleDe(modele) {
  return process.env[SERVICES[fournisseurDe(modele)].variable] || ''
}
/** Le nom du service pour les messages (« Claude », « Mistral »). */
export function serviceDe(modele) {
  return SERVICES[fournisseurDe(modele)].nom
}
/** Le nom de la variable d'environnement de la clé. */
export function variableDe(modele) {
  return SERVICES[fournisseurDe(modele)].variable
}

// -------------------------------------------------------- identifiants d'appel
/** Mistral impose des identifiants d'appel d'outil de 9 caractères [A-Za-z0-9].
 * Déterministe : le même identifiant Anthropic donne toujours le même. */
export function id9(id) {
  const brut = String(id ?? '').replace(/^toolu_/, '')
  if (/^[A-Za-z0-9]{9}$/.test(brut)) return brut
  return createHash('sha256')
    .update(String(id ?? ''))
    .digest('base64')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 9)
}

function texteDe(contenu) {
  if (contenu == null) return ''
  if (typeof contenu === 'string') return contenu
  return contenu
    .filter((b) => b && (b.type === 'text' || typeof b.text === 'string'))
    .map((b) => b.text)
    .join('\n')
}

// ------------------------------------------------------------ requête → Mistral
/** Traduit un corps de requête Messages (Anthropic) en corps chat/completions
 * (Mistral). Ce qui n'a pas d'équivalent est supprimé : `cache_control` et les
 * blocs de réflexion. `thinking: disabled` devient `reasoning_effort: none` :
 * Large 4 réfléchit par défaut, et ces jetons se paient au tarif de sortie et
 * rongent `max_tokens` — pour la correction comme pour Margo, le banc l'a
 * mesuré réflexion coupée. Le texte qui suit des résultats d'outil dans un même
 * message utilisateur (consigne de reprise) est ajouté au dernier résultat
 * d'outil : un message `user` juste après un message `tool` est refusé par
 * certaines versions de l'API. */
export function traduireRequete(a) {
  const messages = []
  const systeme = texteDe(a.system)
  if (systeme) messages.push({ role: 'system', content: systeme })
  const noms = new Map() // identifiant d'appel → nom de l'outil
  for (const m of a.messages || []) {
    const blocs = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || []
    if (m.role === 'assistant') {
      const texte = blocs
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      const appels = blocs
        .filter((b) => b.type === 'tool_use')
        .map((b) => {
          noms.set(id9(b.id), b.name)
          return {
            id: id9(b.id),
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          }
        })
      if (!texte && !appels.length) continue
      const msg = { role: 'assistant' }
      if (texte || !appels.length) msg.content = texte
      if (appels.length) msg.tool_calls = appels
      messages.push(msg)
      continue
    }
    const resultats = blocs.filter((b) => b.type === 'tool_result')
    const textes = blocs.filter((b) => b.type === 'text' && b.text).map((b) => b.text)
    for (const r of resultats) {
      const id = id9(r.tool_use_id)
      const corps = texteDe(r.content)
      messages.push({
        role: 'tool',
        tool_call_id: id,
        ...(noms.get(id) ? { name: noms.get(id) } : {}),
        content: r.is_error ? `[erreur] ${corps}` : corps,
      })
    }
    if (textes.length) {
      const texte = textes.join('\n\n')
      if (resultats.length) messages[messages.length - 1].content += `\n\n${texte}`
      else messages.push({ role: 'user', content: texte })
    }
  }
  const corps = { model: a.model, messages, stream: false }
  if (a.max_tokens != null) corps.max_tokens = a.max_tokens
  if (a.thinking && a.thinking.type === 'disabled') corps.reasoning_effort = 'none'
  if (a.temperature != null) corps.temperature = a.temperature
  if (a.top_p != null) corps.top_p = a.top_p
  if (a.tools && a.tools.length) {
    corps.tools = a.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} },
      },
    }))
    const tc = a.tool_choice && a.tool_choice.type
    if (tc === 'none') corps.tool_choice = 'none'
    else if (tc === 'any' || tc === 'tool') corps.tool_choice = 'any'
    else if (tc === 'auto') corps.tool_choice = 'auto'
  }
  return corps
}

// --------------------------------------------------------- réponse → Anthropic
const ARRETS = { stop: 'end_turn', length: 'max_tokens', model_length: 'max_tokens', tool_calls: 'tool_use' }

/** Traduit une réponse chat/completions en réponse Messages. */
export function traduireReponse(r, modele) {
  const choix = (r.choices && r.choices[0]) || {}
  const msg = choix.message || {}
  const contenu = []
  if (typeof msg.content === 'string') {
    if (msg.content) contenu.push({ type: 'text', text: msg.content })
  } else if (Array.isArray(msg.content)) {
    for (const c of msg.content) if (c.type === 'text' && c.text) contenu.push({ type: 'text', text: c.text })
  }
  for (const tc of msg.tool_calls || []) {
    let input = {}
    const brut = tc.function && tc.function.arguments
    if (brut && typeof brut === 'object') input = brut
    else {
      try {
        input = brut ? JSON.parse(brut) : {}
      } catch {
        input = {}
      }
    }
    contenu.push({ type: 'tool_use', id: `toolu_${id9(tc.id)}`, name: tc.function && tc.function.name, input })
  }
  let arret = ARRETS[choix.finish_reason] || 'end_turn'
  if (arret === 'end_turn' && contenu.some((b) => b.type === 'tool_use')) arret = 'tool_use'
  const u = r.usage || {}
  const cache = u.prompt_tokens_details?.cached_tokens ?? u.num_cached_tokens ?? 0
  const raisonnement = u.completion_tokens_details?.reasoning_tokens ?? 0
  return {
    id: `msg_${id9(r.id || Math.random())}`,
    type: 'message',
    role: 'assistant',
    model: modele,
    content: contenu,
    stop_reason: arret,
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(0, (u.prompt_tokens || 0) - cache),
      output_tokens: u.completion_tokens || 0,
      cache_read_input_tokens: cache,
      cache_creation_input_tokens: 0,
      ...(raisonnement ? { output_tokens_details: { thinking_tokens: raisonnement } } : {}),
    },
  }
}

// ------------------------------------------------------------------- l'envoi
/** Envoie une requête au format Messages au fournisseur du modèle et rend
 * un objet à la `Response` (`ok`, `status`, `json()`) dont le corps est toujours
 * au format Messages — réponse ou `{ error: { message } }`. Une panne de
 * connexion lève, comme `fetch`. `fetcher` : les tests injectent un faux. */
export async function envoyer({ corps, fetcher = globalThis.fetch, apiKey }) {
  const modele = corps.model
  const cle = apiKey || cleDe(modele)
  if (fournisseurDe(modele) !== 'mistral') {
    return fetcher(urlAnthropic(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(corps),
    })
  }
  const rep = await fetcher(urlMistral(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${cle}` },
    body: JSON.stringify(traduireRequete(corps)),
  })
  let data = null
  try {
    data = await rep.json()
  } catch {
    data = null
  }
  let sortie
  if (rep.ok && data) sortie = traduireReponse(data, modele)
  else {
    const detail = (data && (data.error?.message || data.message || (data.detail && JSON.stringify(data.detail)))) || ''
    sortie = { type: 'error', error: { type: 'api_error', message: String(detail).slice(0, 500) } }
  }
  const bonne = rep.ok && !!data
  return { ok: bonne, status: rep.ok && !data ? 502 : rep.status, json: async () => sortie }
}
