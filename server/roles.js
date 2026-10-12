// Table des rôles et des droits associés — le seul endroit à modifier pour
// en ajouter un, ou pour changer ce qu'un rôle peut faire (voir
// claude/conception-gestion-utilisateurs.md et claude/etude-roles-serveur.md
// dans le projet Amend). Le rôle lui-même est toujours stocké comme une
// chaîne (jamais un booléen isEditeur/isCorrecteur) — storage.js, server.js.
// Depuis le 28/09/2026, le client reçoit les capacités (`myCapabilities`)
// avec les métadonnées du document et ne teste plus jamais un nom de rôle.

export const ROLES = {
  editeur: {
    label: 'Éditeur',
    canInvite: true,
    canManageAccess: true,
    canReviewChanges: true, // accepter/rejeter les modifications proposées
    canToggleTrackChanges: true, // peut sortir du suivi des modifications
    canManageDocument: true, // renommer, étoiler, supprimer le document
    // Les deux capacités ajoutées le 28/09/2026 (phase 0 de
    // claude/etude-roles-serveur.md) : c'est **elles** que le client lit,
    // jamais le nom du rôle. L'accès à l'IA n'est plus une capacité de rôle
    // depuis le 13/10/2026 : il se règle par fonction dans le back-office
    // (server/reglagesIa.js, niveau minimal admin / éditeur / correcteur).
    canEditFreely: true, // modifier le texte hors suivi, et sa structure (tableaux, images, sommaire)
    canProposeChanges: true, // modifier le texte en suivi de modifications
    canComment: true,
  },
  correcteur: {
    label: 'Correcteur',
    canInvite: false,
    canManageAccess: false,
    canReviewChanges: false,
    canToggleTrackChanges: false,
    canManageDocument: false,
    canEditFreely: false,
    canProposeChanges: true, // toujours en suivi de modifications : c'est son rôle même
    canComment: true,
  },
  // Le lecteur (28/09/2026) : il lit et commente, il ne touche pas au
  // texte. Tenu par l'interface seulement, comme le correcteur, tant que
  // le serveur ne lit pas les modifications (étude, phases 1 et 2).
  lecteur: {
    label: 'Lecteur',
    canInvite: false,
    canManageAccess: false,
    canReviewChanges: false,
    canToggleTrackChanges: false,
    canManageDocument: false,
    canEditFreely: false,
    canProposeChanges: false,
    canComment: true,
  },
}

/** Ce que peut quelqu'un qui n'a **aucun** rôle : rien. Sert au client
 * quand les métadonnées n'en portent pas (ne devrait pas arriver). */
export const AUCUN_DROIT = Object.freeze(
  Object.fromEntries(Object.entries(ROLES.lecteur).map(([k, v]) => [k, typeof v === 'boolean' ? false : v]))
)

export function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLES, role)
}

/** Droits d'un rôle — un rôle inconnu (donnée corrompue, ancien rôle
 * retiré...) est traité au plus restrictif plutôt que de planter. Depuis
 * le 28/09/2026, le plus restrictif est le lecteur ; et `null` (aucun
 * accès) ne donne rien du tout. */
export function capabilities(role) {
  if (role === null || role === undefined) return AUCUN_DROIT
  return ROLES[role] || ROLES.lecteur
}
