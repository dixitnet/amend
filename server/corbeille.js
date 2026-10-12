// La corbeille (12/10/2026, claude/conception-dossiers-corbeille.md §6).
//
// Deux gestes, qu'on ne confond plus :
//   - `mettreALaCorbeille` : le document disparaît pour tout le monde, mais
//     rien n'est effacé du disque. Réversible.
//   - `supprimerDefinitivement` : ce que « Supprimer » faisait jusqu'ici.
//     Irréversible, et possible seulement depuis la corbeille.
//
// Aucune purge automatique pour l'instant (décision de Sylvain, 12/10) :
// `storage.enCorbeilleDepuis(ms)` dit ce qui y est depuis longtemps, et
// `supprimerDefinitivement` sait tout nettoyer — il ne manque qu'un
// minuteur le jour où on le décidera.

/** Ce qui doit cesser de fonctionner dès qu'un document n'est plus
 * accessible : connexions ouvertes, invitations de Claude, page publiée. */
function retirerDuMonde(ctx, id, email, raison) {
  const { agents, metrics, presenceAgents, publications, rooms } = ctx
  // Les connexions encore ouvertes ne doivent pas écrire dans un document
  // qui n'est plus là (elles en recréeraient le journal).
  rooms.expulser(id, null, raison)
  // Les adresses des agents invités ne mènent plus nulle part : on les
  // révoque plutôt que d'attendre qu'elles expirent.
  for (const a of agents.lister(id)) presenceAgents.retirer(a.id)
  agents.revoquerDocument(id)
  // La page publiée est une copie du document : elle ne lui survit pas
  // (décision du 10/10/2026), et ne reste pas en ligne pour un document jeté.
  if (publications.depublier(id)) {
    metrics.log('publication', { email, docId: id, retiree: true, avecDocument: true })
  }
}

export function mettreALaCorbeille(ctx, id, email) {
  const doc = ctx.storage.mettreALaCorbeille(id, email)
  if (!doc) return null
  retirerDuMonde(ctx, id, email, 'document placé dans la corbeille')
  ctx.metrics.log('corbeille', { email, docId: id, geste: 'mettre' })
  return doc
}

export function supprimerDefinitivement(ctx, id, email) {
  const { metrics, storage, uploads, versions } = ctx
  retirerDuMonde(ctx, id, email, 'document supprimé')
  const ok = storage.deleteDoc(id)
  // Sans ça, les images d'un document supprimé resteraient sur le disque
  // pour toujours — et resteraient lisibles par leur URL si l'identifiant
  // venait à être réattribué.
  uploads.supprimerDocument(id)
  versions.supprimerDocument(id)
  metrics.log('corbeille', { email, docId: id, geste: 'supprimer' })
  return ok
}
