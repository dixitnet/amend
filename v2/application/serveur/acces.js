// La table des accès, provisoire et en mémoire (étape 2) : qui a quel rôle sur
// quel document. Elle sera remplacée à l'étape 6 par le stockage (et son ADR),
// sans changer ce que le serveur offre à y/hub. Elle ne décide rien : ce qu'un
// rôle permet est dans le domaine (domaine/droits.js).
export function creerTableAcces() {
  /** @type {Map<string, Map<string, string>>} document → (personne → rôle) */
  const documents = new Map()
  return {
    existe: (docId) => documents.has(docId),
    /** Crée un document ; la personne qui le crée en est propriétaire. */
    creer(docId, idPersonne) {
      if (documents.has(docId)) return false
      documents.set(docId, new Map([[idPersonne, 'proprietaire']]))
      return true
    },
    /** Les rôles d'une personne sur un document (une liste : demain, ceux de
     * ses équipes et des dossiers s'y ajouteront). */
    rolesDe: (docId, idPersonne) => {
      const role = documents.get(docId)?.get(idPersonne)
      return role ? [role] : []
    },
    donner: (docId, idPersonne, role) => void documents.get(docId)?.set(idPersonne, role),
    retirer: (docId, idPersonne) => void documents.get(docId)?.delete(idPersonne),
  }
}
