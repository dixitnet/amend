// L'authentification : lien magique, session, nom du compte.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { canRequestReconnectLink, clearSessionCookieHeader, consumeReconnectToken, createReconnectToken, isAdminEmail, isLoginAllowed, isSecureRequest, normalizeEmail, readSession, sessionCookieHeader } from '../auth.js'
import { courrierAvecBouton, sendMail } from '../mailgun.js'
import { raisonDeRefus } from '../users.js'
import { sendJson, readJsonBody, origineDe, PAS_TRAITE } from '../http.js'

export async function routesAuth(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, rooms, sessionsRevoquees, storage, users, APP_BASE_URL, liensParOrigine, LIENS_PAR_ORIGINE_HEURE } = ctx

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const email = readSession(req)
    const compte = users.get(email)
    return sendJson(res, 200, {
      email,
      admin: isAdminEmail(email),
      nom: compte ? compte.nom : null,
      couleur: compte ? compte.couleur : null,
    })
  }

  // Le nom que la personne se donne à sa première ouverture de document — et
  // qu'elle peut changer ensuite (10/10/2026, menu du compte). Une session
  // valide suffit : on n'enregistre un nom que sur l'adresse de
  // la session elle-même, jamais sur une adresse passée en paramètre.
  if (pathname === '/api/auth/name' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const body = await readJsonBody(req)
    const raison = raisonDeRefus(body.nom)
    if (raison) return sendJson(res, 400, { error: raison })
    const compte = users.definirNom(email, body.nom)
    if (!compte) return sendJson(res, 400, { error: 'nom refusé' })
    return sendJson(res, 200, { nom: compte.nom, couleur: compte.couleur })
  }

  if (pathname === '/api/auth/request-link' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    // Réponse volontairement identique dans tous les cas (email inconnu,
    // pas autorisé, limite de débit dépassée...) : on ne veut pas laisser
    // deviner depuis l'extérieur quels emails ont un accès. Seule une
    // adresse qui a déjà un accès quelque part, ou une administratrice,
    // reçoit réellement un lien — tout le monde d'autre n'entre que par
    // une invitation à un document précis (voir isLoginAllowed, auth.js).
    //
    // Le **temps** de réponse ne doit pas non plus trahir l'adresse (audit
    // du 10/10/2026, S11) : l'envoi du courriel prend des centaines de
    // millisecondes que les autres cas n'ont pas. On répond donc tout de
    // suite et l'envoi se poursuit en arrière-plan.
    const origineOk = liensParOrigine.noter(origineDe(req)) <= LIENS_PAR_ORIGINE_HEURE
    if (origineOk && isLoginAllowed(email, storage) && canRequestReconnectLink(email)) {
      const token = createReconnectToken(email)
      const link = `${APP_BASE_URL}/#/login/verify/${token}`
      void (async () => {
        try {
          await sendMail({
            to: email,
            subject: 'Votre lien de connexion à amend.ink',
            ...courrierAvecBouton({
              titre: 'Connexion à amend.ink',
              intro: 'Voici votre lien de connexion. Il est valable 20 minutes et ne sert qu’une fois.',
              libelleBouton: 'Se connecter',
              lien: link,
              apres: "Si vous n'avez rien demandé, ignorez ce message : sans clic, rien ne se passe.",
            }),
          })
          metrics.log('mail', { type: 'connexion', ok: true })
        } catch (err) {
          console.error("Échec d'envoi d'email de reconnexion :", err.message)
          metrics.log('mail', { type: 'connexion', ok: false, erreur: err.message })
        }
      })()
    }
    return sendJson(res, 200, { ok: true })
  }

  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    const body = await readJsonBody(req)
    const email = consumeReconnectToken(String(body.token || ''))
    if (!email) return sendJson(res, 400, { error: 'lien invalide ou expiré' })
    res.setHeader('set-cookie', sessionCookieHeader(email, { secure: isSecureRequest(req) }))
    return sendJson(res, 200, { email })
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', clearSessionCookieHeader({ secure: isSecureRequest(req) }))
    return sendJson(res, 200, { ok: true })
  }

  // Se déconnecter partout (audit S8, 10/10/2026) : toutes les sessions de
  // l'adresse émises jusqu'ici cessent de valoir — ordinateur prêté, cookie
  // volé, téléphone perdu — et ses connexions ouvertes sont coupées. Celle-ci
  // comprise : le cookie est effacé dans la réponse.
  if (pathname === '/api/auth/logout-all' && req.method === 'POST') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    sessionsRevoquees.revoquer(email)
    rooms.expulserPartout(email)
    res.setHeader('set-cookie', clearSessionCookieHeader({ secure: isSecureRequest(req) }))
    return sendJson(res, 200, { ok: true })
  }

  // --- Invitation nominative (remplace les liens partagés par rôle,
  // retirés le 15/09/2026) : l'éditeur saisit une adresse, la personne
  // reçoit un mail nommant le document, et son lien ouvre directement une
  // session à son nom. C'est désormais la réception du mail qui prouve
  // l'identité, là où le lien partagé se contentait d'une adresse
  // auto-déclarée. ---

  return PAS_TRAITE
}
