// Margo : le dialogue dans l'éditeur et les suggestions de la barre latérale.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { AIConfigError, AIRequestError, suggestEdit } from '../ai.js'
import { isAdminEmail, readSession } from '../auth.js'
import { DialogueErreur, modeleDialogue, peutDialoguer, porteeDialogue } from '../dialogue.js'
import { capabilities } from '../roles.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

export async function routesIa(req, res, url, ctx) {
  const { pathname } = url
  const { dialogue, metrics, storage, users, suggestionAutorisee, SUGGESTIONS_PAR_HEURE, SUGGESTIONS_PAR_JOUR } = ctx

  // --- Dialogue avec Claude dans l'éditeur (07/10/2026) ---
  // GET dit si la personne y a droit (le client n'affiche la palette que
  // si oui) ; POST mène la conversation et répond en ndjson, une ligne par
  // événement. Rien du texte du document ni des messages n'est journalisé.
  const dialogueMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/dialogue$/)
  if (dialogueMatch) {
    const id = dialogueMatch[1]
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const autorise = peutDialoguer({ admin: isAdminEmail(email), proprietaire: storage.isOwner(id, email), role: storage.roleFor(id, email) })
    if (req.method === 'GET') {
      return sendJson(res, 200, { autorise, portee: porteeDialogue(), modele: autorise ? modeleDialogue() : null })
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'méthode non permise' })
    if (!autorise) return sendJson(res, 403, { error: "le dialogue avec Margo n'est pas ouvert à votre rôle sur ce document" })
    let corps
    try {
      corps = await readJsonBody(req, 300_000)
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.status === 413 ? 'message trop volumineux' : 'requête illisible' })
    }
    const prenom = String(users.nomDe(email) || email.split('@')[0]).trim().split(/\s+/)[0]
    let session
    try {
      session = dialogue.preparer({ email, prenom, docId: id, corps })
    } catch (err) {
      if (err instanceof DialogueErreur) return sendJson(res, err.status, { error: err.message })
      throw err
    }
    let coupe = false
    res.on('close', () => { coupe = true })
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    })
    await dialogue.converser(session, (evt) => { if (!coupe) res.write(JSON.stringify(evt) + '\n') }, () => coupe)
    res.end()
    return
  }

  if (pathname === '/api/ai/suggest' && req.method === 'POST') {
    // Contrôle en deux temps depuis le 15/09/2026 : une session valide
    // (ferme la porte à un usage anonyme de la clé Anthropic du serveur),
    // puis le droit `canUseAI` sur le document concerné — la suggestion
    // consomme la clé de l'instance et écrit dans le document, deux choses
    // qu'un correcteur n'a pas à faire. Le quota par compte (modèle
    // FREE/PRO envisagé) reste à venir ; en attendant, un plafond contre
    // l'abus (voir `suggestionAutorisee`).
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    const docId = String(body.docId || '')
    if (!docId || !storage.getDoc(docId)) return sendJson(res, 400, { error: 'document inconnu' })
    if (!capabilities(storage.roleFor(docId, email)).canUseAI) {
      return sendJson(res, 403, { error: "votre rôle sur ce document ne permet pas d'utiliser l'IA" })
    }
    if (!suggestionAutorisee(email)) {
      return sendJson(res, 429, {
        error: `Limite atteinte : ${SUGGESTIONS_PAR_HEURE} suggestions par heure et ${SUGGESTIONS_PAR_JOUR} par jour. Reprenez un peu plus tard.`,
      })
    }
    // Le flux `ia` porte, depuis le 30/09/2026, la raison d'arrêt et les
    // jetons de réflexion : c'est ce qui aurait montré tout de suite que
    // Sonnet 5 dépensait la moitié du budget à réfléchir.
    const tracer = (usage) =>
      metrics.log('ia', { email, docId, entree: usage.entree, sortie: usage.sortie, reflexion: usage.reflexion, arret: usage.arret })
    try {
      const { suggestion, usage } = await suggestEdit({}, body.text, body.instruction)
      tracer(usage)
      return sendJson(res, 200, { suggestion })
    } catch (err) {
      if (err instanceof AIConfigError) return sendJson(res, 501, { error: err.message })
      if (err instanceof AIRequestError) {
        if (err.usage) tracer(err.usage) // une réponse coupée a coûté quand même
        return sendJson(res, err.status || 502, { error: err.message })
      }
      throw err
    }
  }

  return PAS_TRAITE
}
