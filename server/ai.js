// Thin proxy to the Claude API for AI-assisted rewrite suggestions. Kept
// server-side so the API key never reaches the browser.
//
// Deliberately dependency-free: uses Node's built-in fetch.

import { ErreurHttp } from './erreurs.js'
import { typographier } from '../shared/typographie.js'

/** L'adresse des messages de l'API. `ANTHROPIC_API_URL` ne sert qu'aux essais
 * (un faux serveur local : `tools/faux-anthropic.js`, protocole de test
 * global) ; en production la variable est absente. */
export function urlAnthropic() {
  return `${(process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`
}

// Haiku 5.5 par défaut (10/10/2026) : le modèle le moins cher (0,10 $ / 0,50 $
// par million de jetons), et le banc d'essai (claude/rapport-banc-modeles.md)
// ne le distingue pas de Sonnet pour la correction. Depuis le 13/10/2026 le
// modèle se règle dans le back-office (Corrections IA, server/reglagesIa.js) et
// arrive ici par `config.model` ; AI_MODEL n'est plus lue.
const DEFAULT_MODEL = 'claude-haiku-5-5'
const MAX_INPUT_CHARS = 8000

export class AIConfigError extends Error {}
export class AIRequestError extends ErreurHttp {
  constructor(message, status) {
    super(status, message)
  }
}

/**
 * Asks Claude to rewrite `text` according to `instruction` and returns the
 * rewritten text only (no preamble, no explanation).
 *
 * @param {{apiKey?: string, model?: string}} config
 * @param {string} text - the selected passage to rewrite
 * @param {string} instruction - what the user asked for, e.g. "plus concis"
 */
/** La réponse du modèle, débarrassée de ce qu'on lui a demandé de ne pas
 * mettre et qu'il met parfois quand même : des guillemets triples ou une
 * clôture de code (```) autour du texte, les balises <passage>, des
 * guillemets qui enferment tout le passage. Le texte lui-même n'est jamais
 * touché : on ne retire qu'une enveloppe complète, en tête et en queue. */
export function nettoyerSuggestion(brut) {
  let t = String(brut || '').trim()
  for (let n = 0; n < 4; n++) {
    const avant = t
    t = t.replace(/^```[a-z]*\s*\n?([\s\S]*?)\n?\s*```$/u, '$1').trim()
    t = t.replace(/^"""\s*\n?([\s\S]*?)\n?\s*"""$/u, '$1').trim()
    t = t.replace(/^<passage>\s*\n?([\s\S]*?)\n?\s*<\/passage>$/u, '$1').trim()
    // Des guillemets qui enferment tout, et seulement tout : un passage qui
    // en contient d'autres à l'intérieur n'est pas déballé.
    t = t
      .replace(/^"([^"]*)"$/u, '$1')
      .replace(/^« ?([^«»]*) ?»$/u, '$1')
      .trim()
    if (t === avant) break
  }
  return t
}

/** Le budget de sortie : proportionné au passage — une correction rend à
 * peu près la longueur qu'elle reçoit, une reformulation peut l'allonger —
 * et jamais en dessous d'un plancher large. Avant le 30/09/2026 c'était
 * 2 048 fixes, et Sonnet 5 en dépensait près de la moitié à **réfléchir**
 * (voir plus bas) : les paragraphes longs revenaient coupés. */
const MAX_TOKENS_PLANCHER = 4096
const MAX_TOKENS_PLAFOND = 8192
export function budgetDeSortie(text) {
  // ~3 caractères par jeton en français, ×2 de marge.
  const estimation = Math.ceil((String(text || '').length / 3) * 2)
  return Math.min(MAX_TOKENS_PLAFOND, Math.max(MAX_TOKENS_PLANCHER, estimation))
}

/**
 * Le corps de la requête. Exporté pour les tests.
 *
 * `thinking: disabled` (30/09/2026) : depuis la famille Claude 5, le modèle
 * réfléchit **par défaut** avant de répondre, et ces jetons de réflexion
 * comptent dans `max_tokens` et se paient au tarif de sortie. Pour une
 * correction, cette réflexion n'apporte rien : sur le paragraphe qui a
 * révélé le défaut, 937 jetons de réflexion sur 2 048, et le texte coupé.
 * Sonnet 5 accepte `disabled` ; Sonnet 5.5 le refuse (400) et attend
 * `between_tools` — d'où le repli dans suggestEdit, puisque le modèle se
 * change par le .env.
 */
export function corpsDeRequete({ model, text, instruction, thinking = 'disabled' }) {
  return {
    model,
    max_tokens: budgetDeSortie(text),
    thinking: { type: thinking },
    system:
      'Tu es un assistant de réécriture intégré à un éditeur de texte collaboratif. ' +
      'On te donne un passage et une instruction. Réponds UNIQUEMENT par le texte réécrit, ' +
      "dans la même langue que le passage d'origine, sans guillemets, sans préambule, " +
      'sans explication, sans markdown. Si le passage contient plusieurs paragraphes ' +
      'séparés par des sauts de ligne, garde exactement le même nombre de paragraphes, ' +
      'dans le même ordre, séparés eux aussi par un seul saut de ligne chacun — sauf si ' +
      "l'instruction demande explicitement de les fusionner ou de les scinder. " +
      'Le passage peut contenir des repères de la forme ⟦1⟧, ⟦2⟧… : ils tiennent la place ' +
      "d'une note ou d'une image. Reproduis chacun tel quel, exactement au même endroit du " +
      'texte, sans jamais en ajouter, en retirer ni en déplacer. Un saut de ligne à ' +
      "l'intérieur d'un paragraphe est voulu : garde-le.",
    messages: [
      {
        role: 'user',
        // Le passage entre balises, pas entre guillemets triples : le modèle
        // les reproduisait dans sa réponse, et ils atterrissaient dans le
        // document (signalé par Sylvain le 28/09/2026). nettoyerSuggestion
        // retire ce qui passerait quand même.
        content: `Instruction : ${instruction}\n\n<passage>\n${text}\n</passage>\n\nRéponds par le passage réécrit seulement, sans balises ni guillemets.`,
      },
    ],
  }
}

/** Le modèle a-t-il refusé notre réglage de réflexion ? (Sonnet 5.5 et
 * suivants : `thinking: disabled` → 400.) */
function refuseLeReglageDeReflexion(status, detail) {
  return status === 400 && /thinking/i.test(detail || '')
}

export async function suggestEdit(config, text, instruction) {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new AIConfigError('Aucune clé API configurée. Définis ANTHROPIC_API_KEY dans le fichier .env du serveur.')
  }
  if (!text || !text.trim()) {
    throw new AIRequestError('Aucun texte sélectionné.', 400)
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new AIRequestError(
      `Un paragraphe est trop long pour une correction (${MAX_INPUT_CHARS} signes au plus, espaces compris).`,
      413
    )
  }

  const model = config.model || DEFAULT_MODEL
  const userInstruction = (instruction && instruction.trim()) || 'Améliore ce passage.'
  // `config.fetch` : pour les tests, qui ne parlent jamais à la vraie API.
  const fetcher = config.fetch || fetch

  const appeler = async (thinking) => {
    let response
    try {
      response = await fetcher(urlAnthropic(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(corpsDeRequete({ model, text, instruction: userInstruction, thinking })),
      })
    } catch (err) {
      throw new AIRequestError(`Impossible de joindre l'API Claude : ${err.message}`, 502)
    }
    return response
  }

  let response = await appeler('disabled')
  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.json())?.error?.message || ''
    } catch {
      // ignore
    }
    if (refuseLeReglageDeReflexion(response.status, detail)) {
      response = await appeler('between_tools')
      if (!response.ok) {
        try {
          detail = (await response.json())?.error?.message || ''
        } catch {
          detail = ''
        }
      }
    }
    if (!response.ok) {
      throw new AIRequestError(`L'API Claude a répondu ${response.status}${detail ? ` : ${detail}` : ''}`, 502)
    }
  }

  const data = await response.json()
  const usage = {
    entree: data.usage?.input_tokens ?? null,
    sortie: data.usage?.output_tokens ?? null,
    // Ce que le modèle a dépensé à réfléchir (compris dans `sortie`) — zéro
    // attendu ; s'il remonte, le réglage n'a pas pris.
    reflexion: data.usage?.output_tokens_details?.thinking_tokens ?? 0,
    arret: data.stop_reason || null,
  }
  // Une réponse coupée par le budget n'est **jamais** insérée : avant le
  // 30/09/2026 elle l'était, en réécriture entière, et le paragraphe
  // semblait « remplacé par un paragraphe tronqué ».
  if (data.stop_reason === 'max_tokens') {
    const err = new AIRequestError(
      'La réponse de l’IA a été coupée avant la fin : sélectionnez un passage plus court et réessayez.',
      502
    )
    err.usage = usage
    throw err
  }
  // Typographiée avant d'être comparée au passage d'origine : sans cela, un
  // modèle qui rend des apostrophes droites faisait de chaque « ’ » du texte
  // une « correction » (08/10/2026, shared/typographie.js).
  const suggestion = typographier(
    nettoyerSuggestion(
      (data.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
    )
  )

  if (!suggestion) {
    throw new AIRequestError("Réponse vide de l'API Claude.", 502)
  }
  // La consommation est renvoyée avec la suggestion : c'est elle qui permet
  // de connaître le coût réel par personne (voir server/metrics.js et
  // claude/conception-backoffice.md) — sans quoi le quota de l'offre
  // gratuite serait un chiffre inventé.
  return { suggestion, usage }
}
