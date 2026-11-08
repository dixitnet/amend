// Adaptateur y/hub (couche 2), sous AGPL-3.0 comme toute la v2 (ADR 0004,
// 0006). y/hub tient le contenu des documents ; il ne décide rien : à chaque
// connexion, il demande à l'application qui est la personne (`identifier`) et
// ce qu'elle peut faire (`droits`), comme l'adaptateur de Docs.
import { createYHub, createAuthPlugin, createAuthorize, createDocumentPermissions, apiError } from '@y/hub'

/** Les branches ouvertes : le texte et les suggestions ; toute autre est refusée. */
const BRANCHES = new Set(['main', 'suggestions'])

/**
 * Ce que le domaine accorde sur une branche, traduit en permissions de y/hub
 * (montage de Docs, `src/yhub-server/src/permissions.ts`) : écrire ou lire le
 * texte ; publier sa présence ou seulement voir celle des autres ; l'historique
 * en entier pour tous ; nommer une version et y revenir pour qui peut restaurer.
 * Les routes de y/hub se lisent toutes ; les droits fins sont dans `history`.
 * @param {{ texte: 'ecriture' | 'lecture', presence: boolean, restaurer: boolean }} a
 */
function permissions(a) {
  const ecrire = a.texte === 'ecriture'
  return createDocumentPermissions({
    ydoc: ecrire ? '-ru-' : '-r--',
    awareness: a.presence ? '-ru-' : '-r--',
    history: a.restaurer ? { from: 0, rollback: true, version: 'crud' } : { from: 0, version: '-r--' },
    endpoint: {
      '*': '-r--',
      ws: ecrire ? '-ru-' : '-r--',
      ...(a.restaurer ? { rollback: 'c---', version: 'crud' } : null),
    },
  })
}

const ORGANISATION = 'amend'

/**
 * @param {object} o
 * @param {number} o.port
 * @param {string} o.redis      url Redis ou Valkey
 * @param {string} o.postgres   url PostgreSQL
 * @param {string[]} o.origines origines autorisées des navigateurs
 * @param {(cookie: string) => Promise<{ id: string } | null>} o.identifier
 * @param {(docId: string, idPersonne: string, branche: string) => Promise<{ texte: 'ecriture' | 'lecture', presence: boolean, restaurer: boolean } | null>} o.droits
 *   ce que le domaine accorde à la personne sur cette branche du document
 * @param {number} [o.delaiPersistance] ms avant qu'une modification soit écrite dans PostgreSQL
 */
export async function demarrerCollaboration({
  port,
  redis,
  postgres,
  origines,
  identifier,
  droits,
  delaiPersistance = 2000,
}) {
  const auth = createAuthPlugin({
    authenticate(req) {
      // Les en-têtes de la requête se lisent avant toute attente (uWebSockets).
      const cookie = req.getHeader('cookie') || ''
      return identifier(cookie).then((personne) => {
        if (typeof personne?.id !== 'string' || !personne.id) throw apiError(401, 'session absente')
        return { userid: personne.id }
      })
    },
    authorize: createAuthorize({
      document: async (docRef, personne) => {
        if (!personne || docRef.org !== ORGANISATION || !BRANCHES.has(docRef.branch)) return null
        // Une demande de droits qui échoue (serveur lent ou absent) vaut refus.
        const accorde = await droits(docRef.docid, personne.userid, docRef.branch).catch(() => null)
        return accorde ? permissions(accorde) : null
      },
    }),
  })
  const yhub = await createYHub({
    redis: { url: redis, prefix: 'amend-v2', taskDebounce: delaiPersistance, minMessageLifetime: 60000 },
    postgres,
    persistence: [],
    worker: { taskConcurrency: 2 },
    server: {
      port,
      auth,
      apiPrefix: 'collaboration',
      cors: origines.length ? { origin: origines, credentials: true } : null,
    },
  })
  return {
    /** Chemin WebSocket d'un document : `${base}/${docId}`. */
    cheminWebSocket: `/collaboration/ws/v1/${ORGANISATION}`,
    /** L'état encodé d'un document (lecture côté serveur). */
    async lireEtat(docId) {
      const d = await yhub.getDoc({ org: ORGANISATION, docid: docId, branch: 'main' }, { gc: true })
      return d.gcDoc
    },
    fermer: () => yhub.destroy({ drainMs: 2000 }),
  }
}
