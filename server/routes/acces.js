// Invitations nominatives et gestion des accès d'un document.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { isSecureRequest, normalizeEmail, readSession, sessionCookieHeader } from '../auth.js'
import { courrierAvecBouton, sendMail } from '../mailgun.js'
import { capabilities, isValidRole } from '../roles.js'
import { sendJson, readJsonBody, decoderSegment, PAS_TRAITE } from '../http.js'

/** Un extrait pour un objet de courriel : espaces ramenés à un seul (un
 * retour à la ligne n'a rien à faire dans un en-tête), coupé à `max`. */
function abrege(texte, max) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

export async function routesAcces(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, rooms, storage, APP_BASE_URL, invitationAutorisee } = ctx

  const acceptMatch = pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]+)$/)
  if (acceptMatch && req.method === 'POST') {
    const found = storage.findInvitation(acceptMatch[1])
    if (!found) return sendJson(res, 404, { error: 'invitation inconnue' })
    if (found.expired) return sendJson(res, 410, { error: 'invitation expirée' })
    const accepted = storage.acceptInvitation(found.id, found.email)
    if (!accepted) return sendJson(res, 404, { error: 'invitation inconnue' })
    res.setHeader('set-cookie', sessionCookieHeader(found.email, { secure: isSecureRequest(req) }))
    return sendJson(res, 200, { docId: found.id, email: found.email, role: accepted.role })
  }

  // --- Gestion des accès d'un document (éditeurs seulement). ---

  const accessMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access$/)
  if (accessMatch && req.method === 'GET') {
    const id = accessMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    return sendJson(res, 200, { access: storage.getAccess(id) })
  }

  // Inviter une adresse précise (éditeurs seulement) : crée l'accès « en
  // attente » et envoie le mail. Si l'envoi échoue, l'invitation créée est
  // annulée — mieux vaut pas d'invitation du tout qu'une entrée « en
  // attente » dont personne n'a jamais reçu le lien.
  const inviteMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/invitations$/)
  if (inviteMatch && req.method === 'POST') {
    const id = inviteMatch[1]
    const doc = storage.getDoc(id)
    if (!doc) return sendJson(res, 404, { error: 'document introuvable' })
    const inviter = readSession(req)
    if (!capabilities(storage.roleFor(id, inviter)).canManageAccess) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'adresse email invalide' })
    const role = String(body.role || '')
    if (!isValidRole(role)) return sendJson(res, 400, { error: 'rôle inconnu' })
    const existant = storage.getAccess(id).find((a) => a.email === email)
    if (existant && existant.status === 'actif') {
      return sendJson(res, 409, { error: 'cette personne a déjà accès au document' })
    }
    if (!invitationAutorisee(inviter, email)) {
      return sendJson(res, 429, { error: 'trop d’invitations envoyées pour le moment : réessayez plus tard' })
    }
    const { token, nouvelleEntree } = storage.inviteEmail(id, email, role, inviter)
    const lien = `${APP_BASE_URL}/#/invite/${token}`
    try {
      await sendMail({
        to: email,
        // Le titre est de la personne qui invite, jusqu'à 200 caractères : un
        // objet de courriel n'en porte qu'un extrait (S10).
        subject: `Invitation à collaborer sur « ${abrege(doc.title, 60)} »`,
        ...courrierAvecBouton({
          titre: `Invitation à collaborer sur « ${doc.title} »`,
          intro:
            `${inviter} vous invite à collaborer sur « ${doc.title} » dans amend.ink, ` +
            `comme ${capabilities(role).label.toLowerCase()}. Ce lien ouvre le document directement, ` +
            `sans mot de passe ni inscription. Il reste valable 14 jours.`,
          libelleBouton: 'Ouvrir le document',
          lien,
          apres: "Si vous n'attendiez pas cette invitation, ignorez ce message.",
        }),
      })
      metrics.log('mail', { type: 'invitation', ok: true })
    } catch (err) {
      console.error("Échec d'envoi de l'invitation :", err.message)
      metrics.log('mail', { type: 'invitation', ok: false, erreur: err.message })
      if (nouvelleEntree) storage.revokeAccess(id, email)
      return sendJson(res, 502, { error: "l'invitation n'a pas pu être envoyée" })
    }
    return sendJson(res, 200, { email, role, status: 'invite' })
  }

  // « Quitter » — retirer son propre accès (17/09/2026). Volontairement
  // distinct de la révocation : celle-ci est un acte d'éditeur sur
  // quelqu'un d'autre, celle-là ne demande aucun droit, seulement d'être
  // concerné. Jusqu'ici personne ne pouvait sortir d'un document où il
  // avait été invité.
  const quitterMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access\/moi$/)
  if (quitterMatch && req.method === 'DELETE') {
    const email = readSession(req)
    if (!email) return sendJson(res, 401, { error: 'connexion requise' })
    const r = storage.leaveDoc(quitterMatch[1], email)
    if (r.error) return sendJson(res, r.error === 'document introuvable' ? 404 : 403, { error: r.error })
    rooms.expulser(quitterMatch[1], email)
    return sendJson(res, 200, { ok: true })
  }

  // Transférer la propriété — droit exclusif du propriétaire, avec
  // `supprimer`. La cible doit déjà avoir accepté son accès (voir
  // storage.transferOwnership).
  const ownerMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/owner$/)
  if (ownerMatch && req.method === 'POST') {
    const id = ownerMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    if (!storage.isOwner(id, email)) {
      return sendJson(res, 403, { error: 'seul le propriétaire peut transférer ce document' })
    }
    const body = await readJsonBody(req)
    const cible = normalizeEmail(body.email)
    if (!cible) return sendJson(res, 400, { error: 'adresse email invalide' })
    const r = storage.transferOwnership(id, cible)
    if (r.error) return sendJson(res, 400, { error: r.error })
    return sendJson(res, 200, { owner: r.owner })
  }

  const revokeMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/access\/([^/]+)$/)
  if (revokeMatch && req.method === 'DELETE') {
    const id = revokeMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const role = storage.roleFor(id, readSession(req))
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    const cible = decoderSegment(revokeMatch[2])
    if (storage.isOwner(id, cible)) {
      return sendJson(res, 403, { error: 'le propriétaire ne peut pas être retiré du document' })
    }
    storage.revokeAccess(id, cible)
    rooms.expulser(id, cible)
    return sendJson(res, 200, { ok: true })
  }

  return PAS_TRAITE
}
