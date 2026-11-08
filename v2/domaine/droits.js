// Les droits d'amend.ink (couche domaine) : les rôles et ce qu'ils permettent,
// en codes. Seul endroit où se décide ce qu'un rôle peut faire
// (docs/v2-etape-2-plan.md, arbitrage du 08/11/2026). Le domaine dit ce
// qu'un rôle peut faire ; l'adaptateur y/hub le traduit en permissions, et y/hub
// l'applique. Aucun libellé ici : les noms affichés passent par v2/i18n/.

/** Les rôles, du plus faible au plus fort ; chacun a les capacités du précédent. */
export const ROLES = Object.freeze(['lecteur', 'correcteur', 'editeur', 'proprietaire'])

/** Ce que chaque rôle ajoute au précédent.
 * - `commenter`, `suggerer` : branchées à l'étape 5 (commentaires, suggestions) ;
 *   d'ici là un correcteur ne fait que lire. Le lecteur et les commentaires :
 *   à trancher à l'étape 5.
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

/** Ce que la collaboration doit autoriser sur le texte : `ecriture`,
 * `lecture`, ou `null` (aucun accès). */
export function acces(caps) {
  if (caps.includes('ecrire')) return 'ecriture'
  if (caps.includes('lire')) return 'lecture'
  return null
}
