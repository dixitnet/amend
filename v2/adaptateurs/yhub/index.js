// Adaptateur y/hub (couche 2), sous AGPL-3.0 comme toute la v2 (ADR 0004,
// 0006). y/hub tient le contenu des documents ; il ne décide rien : à chaque
// connexion, il demande à l'application qui est la personne (`identifier`) et
// ce qu'elle peut faire (`droits`), comme l'adaptateur de Docs.
import { createYHub, createAuthPlugin, createAuthorize, createDocumentPermissions, apiError } from '@y/hub'
import { timingSafeEqual } from 'node:crypto'
import { BRANCHES } from '../../domaine/index.js'

/** Les branches ouvertes (domaine) : le texte et les suggestions ; toute autre est refusée. */
const OUVERTES = new Set(BRANCHES)

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

/** L'identité de notre serveur auprès de y/hub (jeton interne) : il ne fait
 * que lire et écrire le texte principal, pour poser l'ancre d'un commentaire
 * de correcteur (étape 5). */
const SERVEUR = 'amend-serveur'
const PERMISSIONS_SERVEUR = createDocumentPermissions({ ydoc: '-ru-', endpoint: { ydoc: '-ru-' } })

function jetonValide(attendu, recu) {
  const a = Buffer.from(String(attendu || ''))
  const b = Buffer.from(String(recu || ''))
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

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
 * @param {string} [o.jetonInterne] le jeton de notre serveur ; vide : il n'a pas d'accès
 */
export async function demarrerCollaboration({
  port,
  redis,
  postgres,
  origines,
  identifier,
  droits,
  delaiPersistance = 2000,
  jetonInterne = '',
}) {
  const auth = createAuthPlugin({
    authenticate(req) {
      // Les en-têtes de la requête se lisent avant toute attente (uWebSockets).
      const cookie = req.getHeader('cookie') || ''
      if (jetonValide(jetonInterne, req.getHeader('x-amend-interne')))
        return Promise.resolve({ userid: SERVEUR, interne: true })
      return identifier(cookie).then((personne) => {
        if (typeof personne?.id !== 'string' || !personne.id) throw apiError(401, 'session absente')
        return { userid: personne.id }
      })
    },
    authorize: createAuthorize({
      document: async (docRef, personne) => {
        if (!personne || docRef.org !== ORGANISATION || !OUVERTES.has(docRef.branch)) return null
        if (personne.interne === true) return docRef.branch === 'main' ? PERMISSIONS_SERVEUR : null
        // Une demande de droits qui échoue (serveur lent ou absent) vaut refus.
        const accorde = await droits(docRef.docid, personne.userid, docRef.branch).catch(() => null)
        return accorde ? permissions(accorde) : null
      },
    }),
  })
  const yhub = await createYHub({
    // Réponses de l'API gardées 1 s (5 par défaut) : les navigateurs redemandent
    // les auteurs des suggestions après chaque changement (étape 5).
    redis: { url: redis, prefix: 'amend-v2', taskDebounce: delaiPersistance, minMessageLifetime: 60000, cacheTtl: 1 },
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
