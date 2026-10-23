// Invitations nominatives et gestion des accès d'un document.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { isSecureRequest, normalizeEmail, readSession, sessionCookieHeader } from '../auth.js'
import { etatDuCourrierEnMemoire, sendMail } from '../mailgun.js'
import { courrierInvitation, quiInvite } from '../courriersInvitation.js'
import { capabilities, isValidRole } from '../roles.js'
import { sendJson, readJsonBody, decoderSegment, PAS_TRAITE } from '../http.js'

export async function routesAcces(req, res, url, ctx) {
  const { pathname } = url
  const { metrics, rooms, storage, users, APP_BASE_URL, invitationAutorisee } = ctx

  const acceptMatch = pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]+)$/)
  if (acceptMatch && req.method === 'POST') {
    const found = storage.findInvitation(acceptMatch[1])
    if (!found) return sendJson(res, 404, { error: 'invitation inconnue' })
    // Un lien déjà utilisé reste un signet (23/10/2026) : la personne garde le
    // courrier pour revenir au document. Pendant l'heure qui suit la première
    // ouverture, il se comporte comme la première fois, session comprise
    // (téléphone puis ordinateur, ou un filtre de messagerie qui a ouvert le
    // lien avant la personne : S5). Ensuite il ne redonne **aucune session** :
    // il ne fait que montrer le document (son identifiant seul, inutilisable
    // sans accès), et la page décide — le document si la personne est connectée
    // et y a accès, « Mes documents » sinon.
    if (found.utilisee && found.expired) return sendJson(res, 200, { dejaUtilisee: true, docId: found.id })
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
    // Pour chaque invitation en attente : où en est son courrier (voir
    // etatDuCourrier). Au plus vingt, en parallèle, sans jamais faire échouer
    // la liste.
    const access = storage.getAccess(id)
    await Promise.all(
      access
        .filter((a) => a.status === 'invite' && a.invitedAt)
        .slice(0, 20)
        .map(async (a) => {
          a.courrier = await etatDuCourrierEnMemoire(a.email, a.invitedAt)
        })
    )
    return sendJson(res, 200, { access })
  }

  // Un nouveau lien pour une invitation en attente, sans courrier
  // (éditeurs seulement). Seule réponse de l'API qui porte un jeton : l'éditeur
  // le transmet lui-même quand le courrier n'arrive pas. Le lien reçu
  // auparavant par courrier cesse de marcher.
  const lienMatch = pathname.match(/^\/api\/docs\/([A-Za-z0-9_-]+)\/invitations\/lien$/)
  if (lienMatch && req.method === 'POST') {
    const id = lienMatch[1]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    if (!capabilities(storage.roleFor(id, readSession(req))).canManageAccess) {
      return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    }
    const body = await readJsonBody(req)
    const email = normalizeEmail(body.email)
    const nouveau = email && storage.renouvelerLien(id, email)
    if (!nouveau) return sendJson(res, 404, { error: 'aucune invitation en attente pour cette adresse' })
    res.setHeader('cache-control', 'no-store')
    return sendJson(res, 200, { lien: `${APP_BASE_URL}/#/invite/${nouveau.token}` })
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
        ...courrierInvitation({
          qui: quiInvite(inviter, users && users.nomDe(inviter)),
          titre: doc.title,
          role,
          lien,
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
