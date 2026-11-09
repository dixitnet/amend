// Les droits d'amend.ink (couche domaine) : les rôles et ce qu'ils permettent,
// en codes. Seul endroit où se décide ce qu'un rôle peut faire
// (docs/v2-etape-2-plan.md, arbitrage du 08/11/2026). Le domaine dit ce
// qu'un rôle peut faire ; l'adaptateur y/hub le traduit en permissions, et y/hub
// l'applique. Aucun libellé ici : les noms affichés passent par v2/i18n/.

/** Les rôles, du plus faible au plus fort ; chacun a les capacités du précédent. */
export const ROLES = Object.freeze(['lecteur', 'correcteur', 'editeur', 'proprietaire'])

/** Ce que chaque rôle ajoute au précédent.
 * - `commenter`, `suggerer` : commenter et proposer des suggestions (étape 5) ;
 *   le lecteur ne commente pas (Sylvain, 08/11/2026).
 * - `arbitrer` : accepter ou rejeter une suggestion ; `restaurer` : revenir à
 *   une version ; `inviter` : donner un rôle (sauf propriétaire), changer ou
 *   retirer un accès (sauf celui du propriétaire).
 * - `supprimer` (et restaurer de la corbeille), `transferer` la propriété :
 *   la vie et la mort du document, au propriétaire seul. */
const AJOUTS = {
  lecteur: ['lire'],
  correcteur: ['commenter', 'suggerer'],
  editeur: ['ecrire', 'arbitrer', 'restaurer', 'inviter'],
  proprietaire: ['supprimer', 'transferer'],
}

const CAPACITES = Object.fromEntries(
  ROLES.map((role, i) => [role, Object.freeze(ROLES.slice(0, i + 1).flatMap((r) => AJOUTS[r]))]),
)
const AUCUNE = Object.freeze([])
const PLUS_RESTRICTIF = ROLES[0]

/** Un rôle est une chaîne de la liste, et rien d'autre : ni « __proto__ » ou
 * « toString » (hérités d'un objet), ni `['editeur']` (converti en chaîne). */
const estRole = (role) => typeof role === 'string' && ROLES.includes(role)
const rang = (role) => (estRole(role) ? ROLES.indexOf(role) : 0)

/** Le rôle effectif d'une personne : le plus fort de ceux qui s'appliquent à
 * elle (aujourd'hui un seul ; demain le sien, celui de son équipe, celui hérité
 * d'un dossier). Un rôle inconnu vaut le plus restrictif ; aucun rôle, `null`. */
export function roleEffectif(roles) {
  const presents = (Array.isArray(roles) ? roles : [roles]).filter((r) => r !== null && r !== undefined)
  if (!presents.length) return null
  return ROLES[Math.max(...presents.map(rang))] ?? PLUS_RESTRICTIF
}

/** Les capacités d'un rôle ; rôle inconnu → celles du plus restrictif ;
 * aucun rôle → aucune. */
export function capacites(role) {
  if (role === null || role === undefined) return AUCUNE
  return estRole(role) ? CAPACITES[role] : CAPACITES[PLUS_RESTRICTIF]
}

/** Les branches d'un document dans la collaboration : le texte (`main`) et
 * les suggestions des correcteurs (`suggestions`, étape 5). */
export const BRANCHES = Object.freeze(['main', 'suggestions'])

/**
 * Ce que la collaboration doit autoriser à une personne sur une branche du
 * document, selon ses capacités (montage de Docs, étape 5) ; `null` : aucun
 * accès.
 * - `texte` : `ecriture` ou `lecture` ;
 * - `presence` : publier sa présence (curseur, « personnes sur ce document ») :
 *   le correcteur se montre comme l'éditeur, le lecteur reste invisible
 *   (Sylvain, 09/11/2026 ; Docs ne montre que qui peut modifier le texte) ;
 * - `restaurer` : nommer une version et revenir à une version.
 * Le correcteur lit le texte et écrit dans les suggestions ; l'éditeur écrit
 * dans les deux (il accepte et refuse) ; le lecteur lit le texte seul, sans
 * les suggestions. Tout le monde voit tout l'historique (Sylvain, 08/11/2026).
 * @returns {{ texte: 'ecriture' | 'lecture', presence: boolean, restaurer: boolean } | null}
 */
export function accesBranche(caps, branche) {
  if (branche === 'main') {
    if (caps.includes('ecrire')) return { texte: 'ecriture', presence: true, restaurer: caps.includes('restaurer') }
    if (caps.includes('lire')) return { texte: 'lecture', presence: caps.includes('commenter'), restaurer: false }
    return null
  }
  if (branche === 'suggestions' && caps.includes('suggerer'))
    return { texte: 'ecriture', presence: false, restaurer: false }
  return null
}

/**
 * Les droits sur les fils de commentaires (montage de Docs : `Thread` et
 * `Comment`, `get_abilities`). Commenter demande la capacité `commenter`
 * (correcteur et au-dessus ; le lecteur ne commente pas) ; modérer, c'est-à-
 * dire supprimer le commentaire d'un autre ou résoudre son fil, demande
 * `arbitrer` (éditeur et propriétaire).
 * @param {readonly string[]} caps
 * @param {string} idPersonne
 * @param {'voir' | 'creer' | 'repondre' | 'reagir' | 'modifier' | 'supprimer' | 'resoudre'} action
 * @param {{ auteur?: string } | null} [objet] le commentaire (modifier, supprimer) ou le fil (résoudre)
 */
export function peutCommenter(caps, idPersonne, action, objet = null) {
  if (!caps.includes('commenter')) return false
  const sien = typeof objet?.auteur === 'string' && objet.auteur === idPersonne
  switch (action) {
    case 'voir':
    case 'creer':
    case 'repondre':
    case 'reagir':
      return true
    case 'modifier':
      return sien
    case 'supprimer':
    case 'resoudre':
      return sien || caps.includes('arbitrer')
    default:
      return false
  }
}
