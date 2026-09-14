// Table des rôles et des droits associés — un seul endroit à modifier pour
// en ajouter un plus tard (2 rôles seulement pour l'instant, architecture
// prévue pour en accueillir d'autres : voir
// claude/conception-gestion-utilisateurs.md dans le projet Amend). Le rôle
// lui-même est toujours stocké comme une chaîne (jamais un booléen
// isEditeur/isCorrecteur) — storage.js, server.js.

export const ROLES = {
  editeur: {
    label: 'Éditeur',
    canInvite: true,
    canManageAccess: true,
    canReviewChanges: true, // accepter/rejeter les modifications proposées
    canToggleTrackChanges: true, // peut sortir du suivi des modifications
    canManageDocument: true, // renommer, étoiler, supprimer le document
  },
  correcteur: {
    label: 'Correcteur',
    canInvite: false,
    canManageAccess: false,
    canReviewChanges: false,
    canToggleTrackChanges: false,
    canManageDocument: false,
  },
}

export function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLES, role)
}

/** Droits d'un rôle — un rôle inconnu (donnée corrompue, ancien rôle
 * retiré...) est traité au plus restrictif plutôt que de planter. */
export function capabilities(role) {
  return ROLES[role] || ROLES.correcteur
}
