// Thin proxy to the Claude API for AI-assisted rewrite suggestions. Kept
// server-side so the API key never reaches the browser.
//
// Deliberately dependency-free: uses Node's built-in fetch.

const DEFAULT_MODEL = 'claude-sonnet-4-5'
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
        content: `Instruction : ${userInstruction}\n\nPassage à réécrire :\n"""\n${text}\n"""`,
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
  const suggestion = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()

  if (!suggestion) {
    throw new AIRequestError("Réponse vide de l'API Claude.", 502)
  }
  return suggestion
}
