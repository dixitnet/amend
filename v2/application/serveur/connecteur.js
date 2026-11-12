// Le connecteur Claude du back-office (12/11/2026, docs/v2-connecteur-plan.md) :
// un serveur MCP (Model Context Protocol) qui donne à Claude les documents du
// compte d'un administrateur, avec les outils de Margo (lire, chercher,
// proposer, commenter) et deux de plus (la liste des documents, le plan d'un
// document). Repris du connecteur de la v1 (`server/mcp.js`) : une adresse
// secrète en guise d'autorisation (comme un lien de partage), une requête
// JSON-RPC par message, une réponse JSON, sans flux. Mais un connecteur pour
// tous les documents, et non un par document.
//
//   POST   /api/mcp/<secret>          les messages MCP
//   GET    /api/admin/connecteur      état du connecteur de l'administrateur
//   POST   /api/admin/connecteur      crée (ou remplace) l'adresse ; la rend une fois
//   DELETE /api/admin/connecteur      la révoque
//
// Claude n'a pas plus de droits que la personne : sur chaque document, son
// rôle à elle. Il n'écrit jamais dans le texte : ses corrections sont des
// suggestions et ses remarques des commentaires, signés « Claude ». Le
// contenu d'un document est une donnée à relire, jamais une consigne.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { AUTEUR_CLAUDE, capacites, identifiantDocument, roleEffectif, signes } from '../../domaine/index.js'
import { consigne } from '../../i18n/consignes.js'
import { creerOutils, lireEtat } from './margo.js'

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const LECTURE = { readOnlyHint: true, openWorldHint: false }
const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
/** Le paramètre `document` de chaque outil sur un document. */
const DOCUMENT = { type: 'string', description: 'identifiant du document (outil « documents »)' }

/** Les outils du connecteur : leur schéma, leurs annotations, la capacité qu'ils demandent. */
const OUTILS = {
  documents: { schema: { type: 'object', properties: {} }, annotations: LECTURE, capacite: null },
  plan: {
    schema: { type: 'object', properties: { document: DOCUMENT }, required: ['document'] },
    annotations: LECTURE,
    capacite: 'lire',
  },
  lire: {
    schema: {
      type: 'object',
      properties: { document: DOCUMENT, de: { type: 'integer', minimum: 1 }, a: { type: 'integer', minimum: 1 } },
      required: ['document', 'de', 'a'],
    },
    annotations: LECTURE,
    capacite: 'lire',
  },
  chercher: {
    schema: {
      type: 'object',
      properties: { document: DOCUMENT, textes: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      required: ['document', 'textes'],
    },
    annotations: LECTURE,
    capacite: 'lire',
  },
  proposer: {
    schema: {
      type: 'object',
      properties: {
        document: DOCUMENT,
        corrections: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: { bloc: { type: 'integer' }, avant: { type: 'string' }, apres: { type: 'string' } },
            required: ['bloc', 'avant', 'apres'],
          },
        },
      },
      required: ['document', 'corrections'],
    },
    annotations: ECRITURE,
    capacite: 'suggerer',
  },
  commenter: {
    schema: {
      type: 'object',
      properties: {
        document: DOCUMENT,
        bloc: { type: 'integer' },
        citation: { type: 'string' },
        texte: { type: 'string' },
      },
      required: ['document', 'bloc', 'citation', 'texte'],
    },
    annotations: ECRITURE,
    capacite: 'commenter',
  },
}

/** L'empreinte d'une adresse secrète : seule elle est gardée. */
const empreinte = (secret) => createHash('sha256').update(String(secret)).digest('hex')
const cleDe = (hash) => `connecteur.cle.${hash}`
const cleDeLaPersonne = (id) => `connecteur.de.${id}`

/**
 * @param {object} o
 * @param {any} o.comptes  le dépôt des comptes
 * @param {any} o.collaboration  l'accès de notre serveur à y/hub
 * @param {any} o.depot  le dépôt des commentaires
 * @param {(docId: string) => void} o.prevenirFils
 * @param {(req: any) => Promise<{ id: string } | null>} o.personneDe
 * @param {(p: { id: string }) => Promise<boolean>} o.administrateur
 * @param {string} o.adresse  l'adresse publique du service (https://…)
 * @param {(res: any, statut: number, corps: any) => void} o.json
 * @param {(req: any, max?: number) => Promise<any>} o.lireCorps
 */
export function creerConnecteur({
  comptes,
  collaboration,
  depot,
  prevenirFils,
  personneDe,
  administrateur,
  adresse,
  json,
  lireCorps,
}) {
  /** La personne d'une adresse secrète, si elle est toujours administratrice. */
  async function personneDuSecret(secret) {
    if (typeof secret !== 'string' || secret.length < 20) return null
    const hash = empreinte(secret)
    const entree = await comptes.reglage(cleDe(hash))
    if (!entree?.personne) return null
    // L'empreinte enregistrée pour la personne doit être celle-ci (révocation).
    const sienne = await comptes.reglage(cleDeLaPersonne(entree.personne))
    if (typeof sienne !== 'string' || sienne.length !== hash.length) return null
    if (!timingSafeEqual(Buffer.from(sienne), Buffer.from(hash))) return null
    const p = { id: entree.personne }
    return (await administrateur(p)) ? p : null
  }

  /** Le back-office : état, création, révocation de l'adresse. */
  async function admin(req, res) {
    const p = await personneDe(req)
    if (!p) return (json(res, 401, { code: 'session-absente' }), true)
    if (!(await administrateur(p))) return (json(res, 403, { code: 'reserve-administrateur' }), true)
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return (json(res, 405, { code: 'methode-refusee' }), true)
    const ancienne = await comptes.reglage(cleDeLaPersonne(p.id))
    if (req.method === 'GET') {
      const entree = typeof ancienne === 'string' ? await comptes.reglage(cleDe(ancienne)) : null
      return (json(res, 200, { actif: Boolean(entree), creeLe: entree?.creeLe ?? null }), true)
    }
    if (typeof ancienne === 'string') await comptes.definirReglage(cleDe(ancienne), null, p.id)
    if (req.method === 'DELETE') {
      await comptes.definirReglage(cleDeLaPersonne(p.id), null, p.id)
      console.log('[connecteur] adresse révoquée')
      return (json(res, 200, {}), true)
    }
    const secret = randomBytes(32).toString('base64url')
    const hash = empreinte(secret)
    await comptes.definirReglage(cleDe(hash), { personne: p.id, creeLe: Date.now() }, p.id)
    await comptes.definirReglage(cleDeLaPersonne(p.id), hash, p.id)
    console.log('[connecteur] adresse créée')
    return (json(res, 201, { adresse: `${adresse}/api/mcp/${secret}` }), true)
  }

  /** Le rôle de la personne sur un document, et ses capacités. */
  async function capacitesSur(docId, p) {
    return capacites(roleEffectif(await comptes.rolesDe(docId, p.id)))
  }

  /** Un appel d'outil : `{ texte, erreur? }`. */
  async function appeler(p, nom, entree = {}) {
    const outil = OUTILS[nom]
    if (!outil) return { texte: consigne('outils.inconnu'), erreur: true }
    if (nom === 'documents') {
      const docs = await comptes.documentsDe(p.id)
      if (!docs.length) return { texte: consigne('outils.aucun') }
      return {
        texte: docs
          .map((d) => consigne('connecteur.document', { id: d.id, titre: d.titre || '—', role: roleEffectif(d.roles) }))
          .join('\n'),
      }
    }
    const ident = identifiantDocument(entree.document)
    const docId = ident.ok ? ident.id : null
    const caps = docId ? await capacitesSur(docId, p) : []
    if (!docId || !caps.includes('lire')) return { texte: consigne('connecteur.introuvable'), erreur: true }
    if (outil.capacite && !caps.includes(outil.capacite))
      return { texte: consigne('connecteur.interdit'), erreur: true }
    try {
      if (nom === 'plan') {
        const { blocs } = await lireEtat(collaboration, docId, AUTEUR_CLAUDE)
        const titres = blocs.filter((b) => b.type === 'heading')
        const total = blocs.reduce((s, b) => s + signes(b.texte), 0)
        return {
          texte: [
            consigne('connecteur.plan', { blocs: blocs.length, signes: total }),
            ...titres.map((b) => `${'  '.repeat(Math.max(0, (b.niveau ?? 1) - 1))}[${b.n}] ${b.texte}`),
          ].join('\n'),
        }
      }
      const outils = creerOutils({
        docId,
        collaboration,
        depot,
        prevenirFils,
        bilan: { corrections: 0, refus: 0, commentaires: 0 },
        compte: { signesLus: 0 },
        auteur: AUTEUR_CLAUDE,
      })
      const reste = { ...entree }
      delete reste.document
      const r = await outils.executer(nom, reste)
      return { texte: r.contenu, erreur: r.erreur === true }
    } catch (err) {
      if (err.code === 'collaboration-indisponible' || err.code === 'document-illisible')
        return { texte: consigne('outils.indisponible'), erreur: true }
      throw err
    }
  }

  /** Un message JSON-RPC : la réponse, ou `null` pour une notification. */
  async function message(p, m) {
    const repondre = (result) => ({ jsonrpc: '2.0', id: m.id, result })
    const erreur = (code, texte) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message: texte } })
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return erreur(-32600, 'invalid request')
    if (m.id === undefined) return null // une notification : pas de réponse
    switch (m.method) {
      case 'initialize': {
        const demandee = m.params?.protocolVersion
        return repondre({
          protocolVersion: VERSIONS.includes(demandee) ? demandee : VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'amend.ink', version: '2' },
          instructions: consigne('connecteur.instructions'),
        })
      }
      case 'ping':
        return repondre({})
      case 'tools/list':
        return repondre({
          tools: Object.entries(OUTILS).map(([nom, o]) => ({
            name: nom,
            description: consigne(`connecteur.outils.${nom}`),
            inputSchema: o.schema,
            annotations: o.annotations,
          })),
        })
      case 'tools/call': {
        const nom = m.params?.name
        let r
        try {
          r = await appeler(p, nom, m.params?.arguments ?? {})
        } catch (err) {
          // Une panne d'un outil rend une erreur à cet appel seulement (audit du 12/11/2026).
          console.error('[connecteur] outil en panne :', err.code ?? err.message)
          return erreur(-32603, 'internal error')
        }
        console.log(`[connecteur] ${OUTILS[nom] ? nom : 'inconnu'}${r.erreur ? ' (refus)' : ''}`)
        return repondre({ content: [{ type: 'text', text: r.texte }], isError: r.erreur === true })
      }
      default:
        return erreur(-32601, 'method not found')
    }
  }

  return async function traiter(req, res, url) {
    // Le connecteur ne parle pas OAuth : un client qui sonde ces adresses doit
    // recevoir un 404 net, pas la page d'accueil (comme la v1).
    if (/^\/\.well-known\/(oauth-|openid-configuration)/.test(url.pathname))
      return (json(res, 404, { code: 'introuvable' }), true)
    if (url.pathname === '/api/admin/connecteur') return admin(req, res)
    const m = url.pathname.match(/^\/api\/mcp\/([A-Za-z0-9_-]+)$/)
    if (!m) return false
    const p = await personneDuSecret(m[1])
    if (!p) return (json(res, 404, { code: 'introuvable' }), true)
    // Pas de flux du serveur vers le client (comme la v1) : seulement des POST.
    if (req.method !== 'POST') return (json(res, 405, { code: 'methode-refusee' }, { allow: 'POST' }), true)
    const corps = await lireCorps(req, 200_000)
    // Un message par requête : la version 2025-06-18 du protocole a retiré les
    // lots, et `lireCorps` refuse un tableau (400).
    const reponse = await message(p, corps)
    if (!reponse) {
      res.writeHead(202)
      res.end()
      return true
    }
    json(res, 200, reponse)
    return true
  }
}
