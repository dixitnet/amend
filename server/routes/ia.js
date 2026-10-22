// Corrections IA (la barre latérale) et Margo (le dialogue flottant).
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026).
// Refonte du 13/10/2026 : modèle, limites et accès de chaque fonction viennent
// des réglages d'instance (server/reglagesIa.js), la vérification est commune
// (server/quotasIa.js), et les signes se comptent par personne (server/usageIa.js).

import { AIConfigError, AIRequestError, suggestEdit } from '../ai.js'
import { cleDe, variableDe } from '../fournisseurs.js'
import { isAdminEmail, readSession } from '../auth.js'
import { DialogueErreur } from '../dialogue.js'
import { CORPS_JSON_OCTETS_MAX, corpsMaxOctets, garde } from '../garde-fous.js'
import { ErreurHttp } from '../erreurs.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'
import { cleDeConsigne } from '../../shared/consignesIa.js'

// Aucun seuil dans ce fichier : le nombre de paragraphes envoyés en même temps,
// la taille des corps de requête et les autres garde-fous sont dans
// server/garde-fous.js. La seule limite d'une demande est son nombre de signes
// (réglage d'instance, server/quotasIa.js).

/** `Promise.allSettled` avec au plus `max` appels en cours ; l'ordre est gardé. */
async function enParallele(elements, max, fn) {
  const sorties = new Array(elements.length)
  let suivant = 0
  const ouvrier = async () => {
    while (suivant < elements.length) {
      const i = suivant++
      try {
        sorties[i] = { status: 'fulfilled', value: await fn(elements[i]) }
      } catch (reason) {
        sorties[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(max, elements.length) }, ouvrier))
  return sorties
}

/** Ce que le client a besoin de savoir d'une fonction pour une personne et un document. */
function etatPour(quotas, fonction, { email, admin, role }) {
  const autorise = quotas.acces(fonction, { admin, role })
  return autorise ? { autorise, ...quotas.etat(fonction, email) } : { autorise }
}

export async function routesIa(req, res, url, ctx) {
  const { pathname } = url
  const { dialogue, metrics, quotas, storage, users, usageIa } = ctx

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
      corps = await readJsonBody(req, CORPS_JSON_OCTETS_MAX)
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
    // Le corps peut porter jusqu'à la limite de signes par demande (réglage d'instance) :
    // 4 octets par signe au plus, plus l'enveloppe. Au-delà, la limite en signes
    // répond avec son message ; la limite d'octets ne fait que protéger la mémoire.
    const limiteCorps = corpsMaxOctets(quotas.reglages.de('corrections').signesParDemande)
    const body = await readJsonBody(req, limiteCorps)
    const docId = String(body.docId || '')
    if (!docId || !storage.getDoc(docId)) return sendJson(res, 400, { error: 'document inconnu' })
    if (!quotas.acces('corrections', { admin: isAdminEmail(email), role: storage.roleFor(docId, email) })) {
      return sendJson(res, 403, { error: "Corrections IA n'est pas ouverte à votre rôle sur ce document." })
    }
    const lot = Array.isArray(body.textes)
    const textes = lot ? body.textes : [body.text]
    if (!textes.length || textes.some((t) => typeof t !== 'string' || !t.trim())) {
      return sendJson(res, 400, { error: 'Aucun texte sélectionné.' })
    }
    const instruction = body.instruction == null ? '' : String(body.instruction)
    const modeleRegle = quotas.reglages.de('corrections').modele
    if (!cleDe(modeleRegle)) {
      return sendJson(res, 501, {
        error: `Aucune clé API configurée. Définis ${variableDe(modeleRegle)} dans le fichier .env du serveur.`,
      })
    }
    // Le clic est compté ici, une fois, quel que soit le nombre de paragraphes :
    // c'est l'unité de tout le reste (place dans l'heure, demande du mois,
    // événement du journal). Le bouton cliqué est un simple cumul pour l'analyse.
    usageIa.compterBouton(cleDeConsigne(body.action))
    const taille = textes.reduce((n, t) => n + t.length, 0)
    const reglages = quotas.verifier({ fonction: 'corrections', email, taille })
    const modele = reglages.modele

    // **Un seul événement du journal `ia` par clic** (13/10/2026) : il y en avait
    // un par paragraphe, si bien que « appels » et « suggestions » du back-office
    // comptaient les paragraphes, pas les demandes. Les jetons de tous les
    // paragraphes (réussis ou coupés : l'API les a facturés) s'y additionnent.
    const somme = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 }
    let reflexion = 0
    let arret = null
    let vuUsage = false
    const tracer = (usage) => {
      if (!usage) return
      vuUsage = true
      somme.entree += usage.entree || 0
      somme.sortie += usage.sortie || 0
      reflexion += usage.reflexion || 0
      if (usage.arret && (!arret || arret === 'end_turn')) arret = usage.arret
    }
    const resultats = await enParallele(textes, garde('correctionsEnParallele'), (t) =>
      suggestEdit({ model: modele }, t, instruction)
    )
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
    if (vuUsage) {
      metrics.log('ia', {
        email,
        docId,
        modele,
        entree: somme.entree,
        sortie: somme.sortie,
        reflexion,
        arret,
        passages: textes.length,
        signes: taille,
        action: cleDeConsigne(body.action),
        succes: !echec,
      })
    }
    // Les signes ne comptent que pour une demande **réussie** en entier.
    quotas.enregistrer({
      email,
      fonction: 'corrections',
      modele,
      succes: !echec,
      signes: taille,
      passages: textes.length,
      jetons: somme,
    })
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
