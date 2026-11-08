// Adaptateur y/hub (couche 2), sous AGPL-3.0 comme toute la v2 (ADR 0004,
// 0006). y/hub tient le contenu des documents ; il ne décide rien : à chaque
// connexion, il demande à l'application qui est la personne (`identifier`) et
// ce qu'elle peut faire (`droits`), comme l'adaptateur de Docs.
import { createYHub, createAuthPlugin, createAuthorize, createDocumentPermissions, apiError } from '@y/hub'

/** Les droits d'amend.ink, traduits en permissions de y/hub. */
const PERMISSIONS = {
  ecriture: createDocumentPermissions({
    ydoc: '-ru-',
    awareness: '-ru-',
    history: { from: 0 },
    endpoint: { ws: '-ru-', ydoc: '-r--' },
  }),
  lecture: createDocumentPermissions({
    ydoc: '-r--',
    awareness: '-r--',
    history: { from: 0 },
    endpoint: { ws: '-r--', ydoc: '-r--' },
  }),
}

const ORGANISATION = 'amend'

/**
 * @param {object} o
 * @param {number} o.port
 * @param {string} o.redis      url Redis ou Valkey
 * @param {string} o.postgres   url PostgreSQL
 * @param {string[]} o.origines origines autorisées des navigateurs
 * @param {(cookie: string) => Promise<{ id: string } | null>} o.identifier
 * @param {(docId: string, idPersonne: string) => Promise<'ecriture' | 'lecture' | null>} o.droits
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
        if (!personne || docRef.org !== ORGANISATION || docRef.branch !== 'main') return null
        // Une demande de droits qui échoue (serveur lent ou absent) vaut refus.
        const droit = await droits(docRef.docid, personne.userid).catch(() => null)
        return PERMISSIONS[droit] || null
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
