// Les règles du partage (couche domaine), sur le modèle de Docs et selon
// l'arbitrage de l'étape 6a (Sylvain, 09/11/2026) : qui donne quel rôle, qui
// retire qui, plusieurs propriétaires mais jamais aucun, invitations de
// 7 jours, accès par lien, connexion réservée (service fermé). Des codes,
// jamais des phrases.
import { ROLES } from './droits.js'

export const DUREE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000
export const DUREE_LIEN_CONNEXION_MS = 15 * 60 * 1000
export const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000

/** Les rôles qu'un lien de partage peut donner (comme Docs : lecteur, commentateur, éditeur). */
const ROLES_DU_LIEN = Object.freeze(['lecteur', 'correcteur', 'editeur'])

/** Les rôles qu'une personne peut donner : qui invite donne lecteur,
 * correcteur, éditeur ; seul un propriétaire nomme un propriétaire. Un
 * document d'équipe appartient à l'équipe : on n'y nomme pas de
 * propriétaire (étape 6d). */
export function rolesDonnables(caps, { dansEquipe = false } = {}) {
  if (!caps.includes('inviter')) return []
  return caps.includes('transferer') && !dansEquipe ? [...ROLES] : ROLES.filter((r) => r !== 'proprietaire')
}

/**
 * Peut-on changer (ou retirer : `nouveau === null`) l'accès `actuel` d'une
 * personne ? Rend `null` si oui, sinon un code.
 * @param {readonly string[]} caps  celles de qui agit
 * @param {string | null} actuel  le rôle de la cible sur ce document (null : aucun)
 * @param {string | null} nouveau  le rôle donné (null : retirer)
 * @param {number} proprietaires  le nombre de propriétaires du document
 */
export function refusAcces(caps, actuel, nouveau, proprietaires) {
  if (!caps.includes('inviter')) return 'droit-insuffisant'
  if (nouveau !== null && !ROLES.includes(nouveau)) return 'role-invalide'
  const toucheProprietaire = actuel === 'proprietaire' || nouveau === 'proprietaire'
  if (toucheProprietaire && !caps.includes('transferer')) return 'droit-insuffisant'
  if (actuel === 'proprietaire' && nouveau !== 'proprietaire' && proprietaires <= 1) return 'dernier-proprietaire'
  return null
}

/** Une invitation est-elle encore valable ? */
export const invitationValable = (creeLe, maintenant = Date.now()) =>
  Number.isFinite(creeLe) && maintenant - creeLe < DUREE_INVITATION_MS && creeLe <= maintenant

/** Le rôle d'un lien de partage : un des rôles permis, ou `null` (aucun lien). */
export const roleDuLienValide = (role) => role === null || ROLES_DU_LIEN.includes(role)

/**
 * Le service est fermé (arbitrage 1a) : reçoit un lien de connexion une
 * adresse déjà connue, invitée (invitation valable), ou arrivée par le lien
 * de partage d'un document ouvert (accès par lien, arbitrage 6b).
 */
export const peutRecevoirLienDeConnexion = ({ compte, invitation, lienDeDocument }) =>
  compte === true || invitation === true || lienDeDocument === true

const LONGUEUR_MAX_COURRIEL = 254

/** Une adresse de courriel normalisée (NFC, minuscules, sans espaces autour). */
export function adresseCourriel(brut) {
  const c = String(brut ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
  if (!c) return { ok: false, code: 'courriel-vide' }
  if (c.length > LONGUEUR_MAX_COURRIEL) return { ok: false, code: 'courriel-trop-long' }
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/u.test(c))
    return { ok: false, code: 'courriel-invalide' }
  return { ok: true, courriel: c }
}
