// Corrections IA (la barre latérale) et Margo (le dialogue flottant).
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026).
// Refonte du 13/10/2026 : modèle, limites et accès de chaque fonction viennent
// des réglages d'instance (server/reglagesIa.js), la vérification est commune
// (server/quotasIa.js), et les signes se comptent par personne (server/usageIa.js).

import { AIConfigError, AIRequestError, suggestEdit } from '../ai.js'
import { isAdminEmail, readSession } from '../auth.js'
import { DialogueErreur } from '../dialogue.js'
import { ErreurHttp } from '../erreurs.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

const TEXTES_MAX = 200
const INSTRUCTION_MAX = 2000

/** Ce que le client a besoin de savoir d'une fonction pour une personne et un document. */
function etatPour(quotas, fonction, { email, admin, role }) {
  const autorise = quotas.acces(fonction, { admin, role })
  return autorise ? { autorise, ...quotas.etat(fonction, email) } : { autorise }
}

export async function routesIa(req, res, url, ctx) {
  const { pathname } = url
  const { dialogue, metrics, quotas, storage, users } = ctx

  // Où en est la personne, pour les deux fonctions, sur ce document : le client
  // ne montre que ce qui lui est ouvert, et affiche « N / M signes ».
  const etatMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/ia$/)
  if (etatMatch && req.method === 'GET') {
    const id = etatMatch[1]
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const personne = { email, admin: isAdminEmail(email), role: storage.roleFor(id, email) }
    return sendJson(res, 200, {
      corrections: etatPour(quotas, 'corrections', personne),
      margo: etatPour(quotas, 'margo', personne),
    })
  }

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
    const personne = { email, admin: isAdminEmail(email), role: storage.roleFor(id, email) }
    const autorise = quotas.acces('margo', personne)
    if (req.method === 'GET') return sendJson(res, 200, etatPour(quotas, 'margo', personne))
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'méthode non permise' })
    if (!autorise) return sendJson(res, 403, { error: "Margo n'est pas ouverte à votre rôle sur ce document." })
    let corps
    try {
      corps = await readJsonBody(req, 300_000)
    } catch (err) {
      return sendJson(res, err.status || 400, {
        error: err.status === 413 ? 'message trop volumineux' : 'requête illisible',
      })
    }
    const prenom = String(users.nomDe(email) || email.split('@')[0])
      .trim()
      .split(/\s+/)[0]
    let session
    try {
      session = await dialogue.preparer({ email, prenom, docId: id, corps })
    } catch (err) {
      if (err instanceof DialogueErreur) return sendJson(res, err.status, { error: err.message })
      throw err
    }
    let coupe = false
    res.on('close', () => {
      coupe = true
    })
    res.writeHead(200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    })
    await dialogue.converser(
      session,
      (evt) => {
        if (!coupe) res.write(JSON.stringify(evt) + '\n')
      },
      () => coupe
    )
    res.end()
    return
  }

  if (pathname === '/api/ai/suggest' && req.method === 'POST') {
    // Contrôle en quatre temps : une session valide (ferme la porte à un usage
    // anonyme de la clé Anthropic), le niveau d'accès réglé pour Corrections
    // IA sur ce document, puis la taille de la demande, le plafond mensuel et
    // le plafond horaire (server/quotasIa.js). Une sélection de plusieurs
    // paragraphes arrive en **une seule demande** (`textes`) : elle compte
    // pour une, et sa taille est celle de la sélection entière.
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    const docId = String(body.docId || '')
    if (!docId || !storage.getDoc(docId)) return sendJson(res, 400, { error: 'document inconnu' })
    if (!quotas.acces('corrections', { admin: isAdminEmail(email), role: storage.roleFor(docId, email) })) {
      return sendJson(res, 403, { error: "Corrections IA n'est pas ouverte à votre rôle sur ce document." })
    }
    const lot = Array.isArray(body.textes)
    const textes = lot ? body.textes : [body.text]
    if (!textes.length || textes.length > TEXTES_MAX || textes.some((t) => typeof t !== 'string' || !t.trim())) {
      return sendJson(res, 400, { error: 'Aucun texte sélectionné.' })
    }
    const instruction = body.instruction == null ? '' : String(body.instruction)
    if (instruction.length > INSTRUCTION_MAX) {
      return sendJson(res, 413, { error: `La consigne est trop longue (${INSTRUCTION_MAX} signes au plus).` })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return sendJson(res, 501, {
        error: 'Aucune clé API configurée. Définis ANTHROPIC_API_KEY dans le fichier .env du serveur.',
      })
    }
    const taille = textes.reduce((n, t) => n + t.length, 0)
    const reglages = quotas.verifier({ fonction: 'corrections', email, taille })
    const modele = reglages.modele

    // Le flux `ia` porte la raison d'arrêt et les jetons de réflexion (30/09/2026).
    const somme = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 }
    const tracer = (usage) => {
      if (!usage) return
      somme.entree += usage.entree || 0
      somme.sortie += usage.sortie || 0
      metrics.log('ia', {
        email,
        docId,
        modele,
        entree: usage.entree,
        sortie: usage.sortie,
        reflexion: usage.reflexion,
        arret: usage.arret,
      })
    }
    const resultats = await Promise.allSettled(textes.map((t) => suggestEdit({ model: modele }, t, instruction)))
    let echec = null
    const suggestions = []
    for (const r of resultats) {
      if (r.status === 'fulfilled') {
        tracer(r.value.usage)
        suggestions.push(r.value.suggestion)
      } else {
        if (r.reason && r.reason.usage) tracer(r.reason.usage) // une réponse coupée a coûté quand même
        echec = echec || r.reason
      }
    }
    // Les signes ne comptent que pour une demande **réussie** en entier.
    quotas.enregistrer({ email, fonction: 'corrections', modele, succes: !echec, signes: taille, jetons: somme })
    if (echec) {
      if (echec instanceof AIConfigError) return sendJson(res, 501, { error: echec.message })
      if (echec instanceof AIRequestError || echec instanceof ErreurHttp)
        return sendJson(res, echec.status || 502, { error: echec.message })
      throw echec
    }
    return sendJson(res, 200, lot ? { suggestions } : { suggestion: suggestions[0] })
  }

  return PAS_TRAITE
}
