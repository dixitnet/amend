// La palette de contact et la liste d'attente publique.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { adminEmails, normalizeEmail, readSession } from '../auth.js'
import { sendMail } from '../mailgun.js'
import { sendJson, readJsonBody, origineDe, PAS_TRAITE } from '../http.js'

export async function routesContact(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, storage, APP_BASE_URL, inscriptionAutorisee, supportAutorise } = ctx

  // --- Palette de contact (17/09/2026) : question, idée, signalement de
  // bug. Trois partis pris, tous les trois délibérés.
  //
  // 1. **Un signalement sans contexte ne sert à rien.** Le client joint
  //    automatiquement le document, le rôle, le navigateur, la version de
  //    l'application et les dernières erreurs de console.
  // 2. **Jamais de contenu de document.** Seuls les champs listés ici sont
  //    lus ; tout le reste du corps est ignoré. Ce que la personne écrit
  //    elle-même lui appartient, mais rien n'est prélevé dans le texte.
  // 3. **Ne pas dépendre du courrier seul.** Mailgun est l'unique porte
  //    d'entrée de l'application ; s'il tombe, un signalement envoyé se
  //    perdrait sans laisser de trace. On écrit donc d'abord dans
  //    `data/events-support.jsonl`, on envoie ensuite. Le courrier
  //    notifie, le fichier se souvient.
  if (pathname === '/api/support' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)

    // `avis` (10/10/2026) : le formulaire n'a plus qu'un champ, sans choix de
    // nature. Les trois autres restent acceptés (retours déjà reçus, anciens clients).
    const INTENTIONS = { avis: 'Avis', question: 'Question', idee: 'Idée', bug: 'Bug' }
    const intention = INTENTIONS[String(body.intention || '')] ? String(body.intention) : null
    if (!intention) return sendJson(res, 400, { error: 'intention inconnue' })
    const message = String(body.message || '')
      .trim()
      .slice(0, 4000)
    if (!message) return sendJson(res, 400, { error: 'message vide' })

    const c = body.contexte && typeof body.contexte === 'object' ? body.contexte : {}
    const texte = (v, max) => (v == null ? null : String(v).slice(0, max))
    const contexte = {
      docId: /^[A-Za-z0-9_-]{1,40}$/.test(String(c.docId || '')) ? String(c.docId) : null,
      role: texte(c.role, 20),
      navigateur: texte(c.navigateur, 300),
      ecran: texte(c.ecran, 30),
      version: texte(c.version, 40),
      erreurs: Array.isArray(c.erreurs) ? c.erreurs.slice(-5).map((e) => texte(e, 500)) : [],
    }

    if (!supportAutorise(email)) {
      return sendJson(res, 429, { error: 'trop de messages envoyés — réessayez dans une heure' })
    }

    // Un identifiant propre depuis le 22/09/2026 : c'est lui que vise le
    // bouton « Traiter » du back-office. Les retours reçus avant n'en ont
    // pas, et sont désignés par leur horodatage (voir cleDuRetour).
    const idRetour = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    metrics.log('support', { id: idRetour, email, intention, message, ...contexte })

    const titres = { avis: 'Aide / avis', question: 'Question', idee: 'Proposition', bug: 'Signalement de bug' }
    const lignes = [
      `De : ${email}`,
      contexte.docId ? `Document : ${APP_BASE_URL}/#/doc/${contexte.docId} (${contexte.role || 'rôle inconnu'})` : null,
      contexte.navigateur ? `Navigateur : ${contexte.navigateur}` : null,
      contexte.ecran ? `Écran : ${contexte.ecran}` : null,
      contexte.version ? `Version : ${contexte.version}` : null,
      contexte.erreurs.length ? `Erreurs console :\n  ${contexte.erreurs.join('\n  ')}` : null,
    ].filter(Boolean)

    let mailEnvoye = false
    const destinataires = adminEmails()
    if (destinataires.length) {
      try {
        await sendMail({
          to: destinataires.join(','),
          replyTo: email,
          subject: `[amend.ink] ${titres[intention]} — ${email}`,
          text: `${message}\n\n---\n${lignes.join('\n')}`,
        })
        mailEnvoye = true
        metrics.log('mail', { type: 'support', ok: true })
      } catch (err) {
        console.error("Échec d'envoi d'un message de contact :", err.message)
        metrics.log('mail', { type: 'support', ok: false, erreur: err.message })
      }
    }
    // 200 dans tous les cas : le message est enregistré, donc il n'est pas
    // perdu, même si le courrier n'est pas parti.
    return sendJson(res, 200, { ok: true, mail: mailEnvoye })
  }

  if (pathname === '/api/waitlist' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    // Cinq inscriptions par heure et par origine, cent par heure en tout
    // (audit du 10/10/2026, S4) : le formulaire est public et chaque appel
    // réécrit le fichier.
    if (!inscriptionAutorisee(origineDe(req)))
      return sendJson(res, 429, { error: 'trop de demandes, réessayez plus tard' })
    storage.addToWaitlist(email)
    return sendJson(res, 200, { ok: true })
  }

  // Rien d'autre ici : le 404 de repli est répondu une seule fois, par handleApi.
  return PAS_TRAITE
}
