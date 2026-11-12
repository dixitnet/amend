// Adaptateur y/hub (couche 2), sous AGPL-3.0 comme toute la v2 (ADR 0004,
// 0006). y/hub tient le contenu des documents ; il ne décide rien : à chaque
// connexion, il demande à l'application qui est la personne (`identifier`) et
// ce qu'elle peut faire (`droits`), comme l'adaptateur de Docs.
import {
  createYHub,
  createAuthPlugin,
  createAuthorize,
  createDocumentPermissions,
  createApiEndpoint,
  apiError,
} from '@y/hub'
import { timingSafeEqual } from 'node:crypto'
import { BRANCHES, AGENTS } from '../../domaine/index.js'

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

/** La route qui sort un document de la corbeille : y/hub sait le faire
 * (\`restoreDoc\`) mais ne l'expose pas ; Docs ajoute la même route
 * (\`src/yhub-server/src/api.ts\`, \`restore-ydoc\`), réservée à son serveur. */
const RESTAURER = 'restore-ydoc'
const restaurer = createApiEndpoint(RESTAURER, {
  post: {
    handler: async (req) => {
      if (req.org !== ORGANISATION || !OUVERTES.has(req.branch)) throw apiError(400, 'document inconnu')
      // Lire la pierre tombale d'abord (comme Docs) : un document jamais
      // supprimé n'a rien à restaurer, un document effacé ne revient pas.
      const tombe = await req.yhub.persistence.retrieveTombstone(req.docRef)
      if (tombe == null) return { restaure: false }
      if (tombe.hard || tombe.purgedAt != null) throw apiError(409, 'contenu effacé')
      await req.yhub.restoreDoc(req.docRef)
      return { restaure: true }
    },
  },
})

/** L'identité de notre serveur auprès de y/hub (jeton interne) : il lit et
 * écrit le texte principal, pour poser l'ancre d'un commentaire de correcteur
 * (étape 5) et remplir une copie (11/11/2026) ; il met un document à la
 * corbeille, l'en sort ou l'efface (étape 6a, corbeille du 11/11/2026). */
const SERVEUR = 'amend-serveur'

/**
 * Les droits ont changé (accès donné, retiré, rôle changé) : chaque connexion
 * ouverte du document les redemande (`recheckAuth`) et se ferme (code 4401)
 * s'ils ne sont plus les mêmes ; le navigateur relit alors ses droits. Le
 * montage de Docs (`src/yhub-server/src/api.ts`, `reset-connections`), réservé
 * à notre serveur (aucun droit du navigateur ne nomme cette route).
 */
const REVOIR_ACCES = 'reset-connections'
const revoirAcces = createApiEndpoint(REVOIR_ACCES, {
  post: {
    handler: async (req) => {
      const personne = typeof req.query?.personne === 'string' && req.query.personne ? req.query.personne : null
      await req.yhub.recheckAuth(req.docRef, { users: personne ? [personne] : null })
      return { ok: true }
    },
  },
})
const PERMISSIONS_SERVEUR = createDocumentPermissions({
  ydoc: '-ru-',
  delete: ['soft', 'hard'],
  endpoint: { ydoc: '-rud', [RESTAURER]: 'c---', [REVOIR_ACCES]: 'c---' },
})
// Sur la branche des suggestions : corbeille, restauration et effacement, et
// faire revoir les droits des connexions ouvertes.
const PERMISSIONS_SERVEUR_SUGGESTIONS = createDocumentPermissions({
  delete: ['soft', 'hard'],
  endpoint: { ydoc: '---d', [RESTAURER]: 'c---', [REVOIR_ACCES]: 'c---' },
})

/** Margo, l'IA (étape 8) : notre serveur, au nom de Margo (jeton interne et
 * en-tête `x-amend-agent: margo`). Elle lit le texte et écrit dans les
 * suggestions seulement, comme un correcteur : ses propositions y sont
 * attribuées à « margo ». Ses commentaires s'ancrent par l'identité du serveur. */
const PERMISSIONS_MARGO_TEXTE = createDocumentPermissions({ ydoc: '-r--', endpoint: { ydoc: '-r--' } })
const PERMISSIONS_MARGO_SUGGESTIONS = createDocumentPermissions({ ydoc: '-ru-', endpoint: { ydoc: '-ru-' } })

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
 * @param {number} [o.connexionsPostgres] connexions de y/hub à PostgreSQL (6 par
 *   défaut : la base en accepte un nombre limité, que l'application se partage)
 * @param {number} [o.delaiPersistance] ms avant qu'une modification soit écrite dans PostgreSQL
 * @param {string} [o.jetonInterne] le jeton de notre serveur ; vide : il n'a pas d'accès
 * @param {(docId: string) => void} [o.surModification] appelée quand le contenu
 *   d'un document a changé (compactage de y/hub ; comme \`content-updated\` de Docs)
 */
export async function demarrerCollaboration({
  port,
  redis,
  postgres,
  origines,
  identifier,
  droits,
  connexionsPostgres = 6,
  delaiPersistance = 2000,
  jetonInterne = '',
  surModification = () => {},
}) {
  const auth = createAuthPlugin({
    authenticate(req) {
      // Les en-têtes de la requête se lisent avant toute attente (uWebSockets).
      const cookie = req.getHeader('cookie') || ''
      if (jetonValide(jetonInterne, req.getHeader('x-amend-interne')))
        return Promise.resolve(
          // Un agent (Margo, Claude par le connecteur) écrit en suggestions, sous son nom.
          AGENTS.includes(req.getHeader('x-amend-agent'))
            ? { userid: req.getHeader('x-amend-agent'), interne: true, agent: true }
            : { userid: SERVEUR, interne: true },
        )
      return identifier(cookie).then((personne) => {
        if (typeof personne?.id !== 'string' || !personne.id) throw apiError(401, 'session absente')
        return { userid: personne.id }
      })
    },
    authorize: createAuthorize({
      document: async (docRef, personne) => {
        if (!personne || docRef.org !== ORGANISATION || !OUVERTES.has(docRef.branch)) return null
        if (personne.interne === true && personne.agent === true)
          return docRef.branch === 'main' ? PERMISSIONS_MARGO_TEXTE : PERMISSIONS_MARGO_SUGGESTIONS
        if (personne.interne === true)
          return docRef.branch === 'main' ? PERMISSIONS_SERVEUR : PERMISSIONS_SERVEUR_SUGGESTIONS
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
    postgresOptions: { max: connexionsPostgres },
    persistence: [],
    // Comme Docs (\`docUpdate\`, \`src/yhub-server/src/server.ts\`) : un compactage
    // qui trouve du neuf prévient le serveur, sans l'attendre. Écart : la branche
    // des suggestions compte aussi (une relecture fait avancer le document).
    worker: {
      taskConcurrency: 2,
      events: {
        docUpdate: ({ docRef }) => {
          if (docRef.org === ORGANISATION && OUVERTES.has(docRef.branch)) surModification(docRef.docid)
        },
      },
    },
    server: {
      port,
      auth,
      apiPrefix: 'collaboration',
      api: [restaurer, revoirAcces],
      cors: origines.length ? { origin: origines, credentials: true } : null,
    },
  })
  return {
    /** Chemin WebSocket d'un document : `${base}/${docId}`. */
    cheminWebSocket: `/collaboration/ws/v1/${ORGANISATION}`,
    fermer: () => yhub.destroy({ drainMs: 2000 }),
  }
}
