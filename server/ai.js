// Thin proxy to the Claude API for AI-assisted rewrite suggestions. Kept
// server-side so the API key never reaches the browser.
//
// Deliberately dependency-free: uses Node's built-in fetch.

// Sonnet 5 depuis le 16/09/2026 : 2 $ / 10 $ par million de jetons contre
// 3 $ / 15 $ pour le 4.5, soit un tiers de moins pour le même travail de
// reformulation. Surchargeable par AI_MODEL (.env) — et si on en change, il
// faut ajuster les deux tarifs du .env avec, sans quoi le coût affiché dans
// le back-office devient faux en silence.
const DEFAULT_MODEL = 'claude-sonnet-5'
const MAX_INPUT_CHARS = 8000

export class AIConfigError extends Error {}
export class AIRequestError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
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
    t = t.replace(/^"([^"]*)"$/u, '$1').replace(/^« ?([^«»]*) ?»$/u, '$1').trim()
    if (t === avant) break
  }
  return t
}

export async function suggestEdit(config, text, instruction) {
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new AIConfigError(
      "Aucune clé API configurée. Définis ANTHROPIC_API_KEY dans le fichier .env du serveur."
    )
  }
  if (!text || !text.trim()) {
    throw new AIRequestError('Aucun texte sélectionné.', 400)
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new AIRequestError(
      `Le passage sélectionné est trop long (max ${MAX_INPUT_CHARS} caractères).`,
      413
    )
  }

  const model = config.model || process.env.AI_MODEL || DEFAULT_MODEL
  const userInstruction = (instruction && instruction.trim()) || 'Améliore ce passage.'

  const body = {
    model,
    max_tokens: 2048,
    system:
      "Tu es un assistant de réécriture intégré à un éditeur de texte collaboratif. " +
      "On te donne un passage et une instruction. Réponds UNIQUEMENT par le texte réécrit, " +
      "dans la même langue que le passage d'origine, sans guillemets, sans préambule, " +
      "sans explication, sans markdown. Si le passage contient plusieurs paragraphes " +
      "séparés par des sauts de ligne, garde exactement le même nombre de paragraphes, " +
      "dans le même ordre, séparés eux aussi par un seul saut de ligne chacun — sauf si " +
      "l'instruction demande explicitement de les fusionner ou de les scinder.",
    messages: [
      {
        role: 'user',
        // Le passage entre balises, pas entre guillemets triples : le modèle
        // les reproduisait dans sa réponse, et ils atterrissaient dans le
        // document (signalé par Sylvain le 28/09/2026). nettoyerSuggestion
        // retire ce qui passerait quand même.
        content: `Instruction : ${userInstruction}\n\n<passage>\n${text}\n</passage>\n\nRéponds par le passage réécrit seulement, sans balises ni guillemets.`,
      },
    ],
  }

  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    throw new AIRequestError(`Impossible de joindre l'API Claude : ${err.message}`, 502)
  }

  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.json())?.error?.message || ''
    } catch {
      // ignore
    }
    throw new AIRequestError(
      `L'API Claude a répondu ${response.status}${detail ? ` : ${detail}` : ''}`,
      502
    )
  }

  const data = await response.json()
  const suggestion = nettoyerSuggestion(
    (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
  )

  if (!suggestion) {
    throw new AIRequestError("Réponse vide de l'API Claude.", 502)
  }
  // La consommation est renvoyée avec la suggestion : c'est elle qui permet
  // de connaître le coût réel par personne (voir server/metrics.js et
  // claude/conception-backoffice.md) — sans quoi le quota de l'offre
  // gratuite serait un chiffre inventé.
  return {
    suggestion,
    usage: {
      entree: data.usage?.input_tokens ?? null,
      sortie: data.usage?.output_tokens ?? null,
    },
  }
}
