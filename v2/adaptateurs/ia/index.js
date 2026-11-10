// Adaptateur IA (couche 2) : la façade de notre serveur vers les modèles de
// langage, pour Margo (étape 8, docs/v2-etape-8-plan.md). Deux fournisseurs,
// deux façons de parler, une seule interface : une conversation qu'on fait
// avancer d'un tour, avec des outils.
//  - Anthropic, par son SDK officiel (`@anthropic-ai/sdk`) : Sonnet 5.5,
//    Haiku 5.5, Fable 5.2 ;
//  - Scaleway (Paris), par son API compatible OpenAI : DeepSeek V4.1 Flash,
//    le modèle qui a bien marché pour Margo dans la v1 (Sylvain, 10/11/2026).
// L'adaptateur ne décide rien : ni consigne, ni outil, ni limite. Il rend des
// codes (`fin`, `outils`, `longueur`, `refus`), jamais des phrases.
import Anthropic from '@anthropic-ai/sdk'

/** Les modèles mobilisables (plan de l'étape 8, point 10).
 * `effort` : la profondeur de réflexion envoyée aux modèles d'Anthropic (leur
 * réflexion ne se coupe pas) ; `reflexion` : celle de Scaleway (`none`, comme la
 * production de la v1). */
export const MODELES = Object.freeze({
  'deepseek-v4.1-flash-1017': { fournisseur: 'scaleway', reflexion: 'none', sortieMax: 16000 },
  'claude-sonnet-5-5': { fournisseur: 'anthropic', effort: 'medium', sortieMax: 32000 },
  'claude-haiku-5-5': { fournisseur: 'anthropic', effort: 'low', sortieMax: 32000 },
  'claude-fable-5-2': { fournisseur: 'anthropic', effort: 'high', sortieMax: 32000 },
})
/** Le modèle de Margo par défaut, et son repli quand un autre refuse. */
export const MODELE_PAR_DEFAUT = 'deepseek-v4.1-flash-1017'

const URL_SCALEWAY = 'https://api.scaleway.ai/v1/chat/completions'
const DELAI_MS = 300_000

const erreur = (code, cause) => Object.assign(new Error(code, cause ? { cause } : undefined), { code })

/**
 * @param {object} o
 * @param {string} [o.cleAnthropic]
 * @param {string} [o.cleScaleway]
 * @param {string} [o.urlScaleway]
 * @param {typeof fetch} [o.fetch]   pour les essais
 * @param {any} [o.anthropic]        un client Anthropic déjà fait (essais)
 */
export function creerIA({ cleAnthropic = '', cleScaleway = '', urlScaleway = URL_SCALEWAY, fetch: f, anthropic } = {}) {
  const appeler = f ?? globalThis.fetch
  let client = anthropic ?? null
  const clientAnthropic = () => (client ??= new Anthropic({ apiKey: cleAnthropic, timeout: DELAI_MS, maxRetries: 2 }))

  /** Un modèle est-il utilisable ici (connu, et son fournisseur configuré) ? */
  function disponible(modele) {
    const m = MODELES[modele]
    if (!m) return false
    return m.fournisseur === 'anthropic' ? Boolean(cleAnthropic || anthropic) : Boolean(cleScaleway)
  }

  /**
   * Une conversation avec un modèle. `outils` : `[{ nom, description, schema }]`
   * (schéma JSON des paramètres). Chaque tour reçoit soit le texte de la
   * personne (`{ texte }`), soit les résultats des outils demandés au tour
   * précédent (`{ resultats: [{ id, contenu, erreur? }] }`), et rend :
   * `{ texte, appels: [{ id, nom, entree }], arret, jetons: { entree, sortie, cacheLu } }`.
   * Une panne du fournisseur lève une erreur de code `ia-indisponible`.
   */
  function conversation({ modele, consigne, outils = [], signal }) {
    const m = MODELES[modele]
    if (!m || !disponible(modele)) throw erreur('modele-indisponible')
    return m.fournisseur === 'anthropic'
      ? conversationAnthropic(clientAnthropic(), modele, m, consigne, outils, signal)
      : conversationScaleway(appeler, urlScaleway, cleScaleway, modele, m, consigne, outils, signal)
  }

  return { disponible, conversation }
}

function conversationAnthropic(client, modele, m, consigne, outils, signal) {
  const messages = []
  const tools = outils.map((o) => ({ name: o.nom, description: o.description, input_schema: o.schema }))
  return {
    async tour(entree) {
      messages.push({ role: 'user', content: contenuUtilisateurAnthropic(entree) })
      let reponse
      try {
        // En flux : une sortie longue n'atteint pas le délai d'une requête simple.
        reponse = await client.messages
          .stream(
            {
              model: modele,
              max_tokens: m.sortieMax,
              system: consigne,
              // Mise en cache automatique du dernier bloc : la boucle renvoie
              // chaque fois le même début de conversation.
              cache_control: { type: 'ephemeral' },
              output_config: { effort: m.effort },
              ...(tools.length ? { tools } : null),
              messages,
            },
            { signal },
          )
          .finalMessage()
      } catch (cause) {
        messages.pop()
        throw erreur(signal?.aborted ? 'ia-annulee' : 'ia-indisponible', cause)
      }
      // Les blocs rendus (réflexion comprise) repartent tels quels au tour suivant.
      messages.push({ role: 'assistant', content: reponse.content })
      const texte = reponse.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
      const appels = reponse.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, nom: b.name, entree: b.input ?? {} }))
      const u = reponse.usage ?? {}
      return {
        texte,
        appels,
        arret: arretAnthropic(reponse.stop_reason, appels),
        jetons: {
          entree: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
          sortie: u.output_tokens ?? 0,
          cacheLu: u.cache_read_input_tokens ?? 0,
        },
      }
    },
  }
}

function contenuUtilisateurAnthropic(entree) {
  if (typeof entree?.texte === 'string') return [{ type: 'text', text: entree.texte }]
  return (entree?.resultats ?? []).map((r) => ({
    type: 'tool_result',
    tool_use_id: r.id,
    content: String(r.contenu ?? ''),
    ...(r.erreur ? { is_error: true } : null),
  }))
}

function arretAnthropic(raison, appels) {
  if (raison === 'refusal') return 'refus'
  if (raison === 'max_tokens') return 'longueur'
  if (raison === 'tool_use' && appels.length) return 'outils'
  return 'fin'
}

function conversationScaleway(appeler, url, cle, modele, m, consigne, outils, signal) {
  const messages = [{ role: 'system', content: consigne }]
  const tools = outils.map((o) => ({
    type: 'function',
    function: { name: o.nom, description: o.description, parameters: o.schema },
  }))
  return {
    async tour(entree) {
      const ajout =
        typeof entree?.texte === 'string'
          ? [{ role: 'user', content: entree.texte }]
          : (entree?.resultats ?? []).map((r) => ({
              role: 'tool',
              tool_call_id: r.id,
              content: String(r.contenu ?? ''),
            }))
      messages.push(...ajout)
      let r
      try {
        r = await appeler(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cle}` },
          body: JSON.stringify({
            model: modele,
            messages,
            max_tokens: m.sortieMax,
            reasoning_effort: m.reflexion,
            ...(tools.length ? { tools, tool_choice: 'auto' } : null),
          }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)]) : AbortSignal.timeout(DELAI_MS),
        })
      } catch (cause) {
        messages.splice(messages.length - ajout.length)
        throw erreur(signal?.aborted ? 'ia-annulee' : 'ia-indisponible', cause)
      }
      if (!r.ok) {
        messages.splice(messages.length - ajout.length)
        throw erreur('ia-indisponible', new Error(`Scaleway : ${r.status}`))
      }
      const corps = await r.json()
      const choix = corps.choices?.[0] ?? {}
      const message = choix.message ?? {}
      // La réflexion éventuelle (`reasoning_content`) n'est ni lue ni renvoyée.
      const appelsBruts = message.tool_calls ?? []
      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        ...(appelsBruts.length ? { tool_calls: appelsBruts } : null),
      })
      const appels = appelsBruts.map((a) => ({ id: a.id, nom: a.function?.name, entree: lireArguments(a.function) }))
      const u = corps.usage ?? {}
      const cacheLu = u.prompt_tokens_details?.cached_tokens ?? 0
      return {
        texte: message.content ?? '',
        appels,
        arret:
          choix.finish_reason === 'length'
            ? 'longueur'
            : choix.finish_reason === 'content_filter'
              ? 'refus'
              : appels.length
                ? 'outils'
                : 'fin',
        jetons: { entree: (u.prompt_tokens ?? 0) - cacheLu, sortie: u.completion_tokens ?? 0, cacheLu },
      }
    },
  }
}

/** Les arguments d'un appel d'outil ; illisibles, ils valent `{ illisible: true }`
 * (l'outil répondra une erreur, le modèle se reprendra). */
function lireArguments(fonction) {
  try {
    const v = JSON.parse(fonction?.arguments || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : { illisible: true }
  } catch {
    return { illisible: true }
  }
}
