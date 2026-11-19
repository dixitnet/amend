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

/** Le plafond des courriers qu'une personne fait partir (invitations, accès donnés, renvois) :
 * `INVITATIONS_MAX` par `FENETRE_INVITATIONS_MS`, pour éviter les abus (Sylvain, 18/11/2026 :
 * « un plafond simple »). Un point de départ, à ajuster sur les journaux réels. */
export const INVITATIONS_MAX = 30
export const FENETRE_INVITATIONS_MS = 60 * 60 * 1000

/** Les comptes d'essai (recette, essais en ligne) : des adresses qui ne reçoivent jamais de courrier. */
export const DOMAINE_ESSAI = 'essai.amend.invalid'
/** Une adresse d'essai ? Un partage vers elle n'envoie rien : il ne compte pas dans le plafond
 * (Sylvain, 19/11/2026 : la recette en ligne butait sur le plafond). */
export const estAdresseDEssai = (courriel) =>
  String(courriel ?? '')
    .toLowerCase()
    .endsWith(`@${DOMAINE_ESSAI}`)

/** Le plafond est-il atteint ? `dates` : les envois récents de la personne (ms). */
export function plafondInvitationsAtteint(dates, maintenant = Date.now()) {
  return dates.filter((d) => maintenant - d < FENETRE_INVITATIONS_MS).length >= INVITATIONS_MAX
}

/** Un extrait pour l'objet d'un courrier : espaces ramenés à une seule (un retour à la
 * ligne n'a rien à faire dans un en-tête), coupé à `max` signes (points de code) avec « … ». */
export function extraitPourObjet(texte, max) {
  const t = String(texte ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const signes = [...t]
  return signes.length > max
    ? signes
        .slice(0, max - 1)
        .join('')
        .trimEnd() + '…'
    : t
}

/** « Nom (adresse) » quand la personne a un nom, sinon l'adresse : un courrier qui dit
 * qui invite, par un nom qu'on reconnaît, se fait moins écarter par un filtre (comme Docs). */
export const nomAvecAdresse = (nom, courriel) => (nom && courriel ? `${nom} (${courriel})` : (courriel ?? nom ?? ''))

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
  // Pas de point en tête ou en fin de la partie locale, ni de points consécutifs
  // (partie locale ou domaine), ni de point en tête de domaine.
  const [local, domaine] = c.split('@')
  if (local.startsWith('.') || local.endsWith('.') || c.includes('..') || domaine.startsWith('.'))
    return { ok: false, code: 'courriel-invalide' }
  // Aucun label du domaine ne commence ni ne finit par un tiret (audit du 16/11/2026).
  if (domaine.split('.').some((l) => l.startsWith('-') || l.endsWith('-')))
    return { ok: false, code: 'courriel-invalide' }
  return { ok: true, courriel: c }
}
