// Inviter Claude (connecteur MCP) sur un document.
// Extrait de server.js (point 43 de la feuille de route, 11/10/2026) : l'ordre des
// routes et leur comportement sont inchangés.

import { ROLES_AGENT, peutInviterAgent, porteeAgent } from '../agents.js'
import { isAdminEmail, readSession } from '../auth.js'
import { capabilities } from '../roles.js'
import { sendJson, readJsonBody, PAS_TRAITE } from '../http.js'

export async function routesAgents(req, res, url, ctx) {
  const { pathname } = url
  const { agents, metrics, presenceAgents, storage, users, APP_BASE_URL } = ctx

  // --- Inviter Claude sur un document (30/09/2026, server/agents.js) ---
  //
  // Le panneau des accès montre les invitations à tous ceux qui gèrent les
  // accès, et n'en laisse créer, prolonger ou régénérer qu'à ceux que
  // `CLAUDE_AGENT` autorise (les admins pendant la phase de test).
  // **Révoquer** reste ouvert à tous ceux qui gèrent les accès : couper un
  // accès ne demande pas plus de droits que de le voir. L'adresse du
  // connecteur n'est rendue qu'à la création et à la régénération, avec
  // `no-store` ; ni la liste ni les journaux ne la portent jamais.
  const agentsMatch = pathname.match(
    /^\/api\/docs\/([A-Za-z0-9_-]+)\/agents(?:\/(ag-[0-9a-f]{8})(?:\/(prolonger|regenerer))?)?$/
  )
  if (agentsMatch) {
    const id = agentsMatch[1]
    const agentId = agentsMatch[2]
    const action = agentsMatch[3]
    if (!storage.getDoc(id)) return sendJson(res, 404, { error: 'document introuvable' })
    const email = readSession(req)
    const role = storage.roleFor(id, email)
    if (!capabilities(role).canManageAccess) return sendJson(res, 403, { error: 'réservé aux éditeurs' })
    const autorise = peutInviterAgent({ admin: isAdminEmail(email), proprietaire: storage.isOwner(id, email), role })
    const secretEnvoye = (status, corps) => {
      const payload = JSON.stringify(corps)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(payload),
        'cache-control': 'no-store',
      })
      res.end(payload)
    }
    const trace = (outil, agent) => metrics.log('agents', { agent, docId: id, outil, ok: true, par: email })
    const adresseDe = (secret) => `${APP_BASE_URL}/mcp/${secret}`
    const vivante = agentId ? agents.pourDocument(id).find((a) => a.id === agentId) : null
    if (agentId && !vivante) return sendJson(res, 404, { error: 'invitation introuvable' })

    if (!agentId && req.method === 'GET') {
      return sendJson(res, 200, {
        autorise,
        portee: porteeAgent(),
        roles: ROLES_AGENT,
        agents: agents.pourDocument(id),
      })
    }

    if (!agentId && req.method === 'POST') {
      if (!autorise) return sendJson(res, 403, { error: "vous n'avez pas le droit d'inviter Claude sur ce document" })
      const body = await readJsonBody(req)
      const prenom = String(users.nomDe(email) || email.split('@')[0])
        .trim()
        .split(/\s+/)[0]
      const r = agents.inviter({
        docId: id,
        role: String(body.role || ''),
        jours: body.jours == null ? undefined : Number(body.jours),
        par: email,
        nom: `Claude (pour ${prenom})`,
      })
      if (!r.ok) return sendJson(res, 400, { error: r.raison })
      trace('invitation', r.id)
      return secretEnvoye(200, { id: r.id, adresse: adresseDe(r.secret), expiresAt: r.expiresAt })
    }

    if (agentId && !action && req.method === 'DELETE') {
      agents.revoquer(agentId)
      presenceAgents.retirer(agentId)
      trace('revocation', agentId)
      return sendJson(res, 200, { ok: true })
    }

    if (agentId && action === 'prolonger' && req.method === 'POST') {
      if (!autorise) return sendJson(res, 403, { error: "vous n'avez pas le droit d'inviter Claude sur ce document" })
      const body = await readJsonBody(req)
      const fin = agents.prolonger(agentId, body.jours == null ? undefined : Number(body.jours))
      if (!fin) return sendJson(res, 400, { error: 'durée invalide' })
      trace('prolongation', agentId)
      return sendJson(res, 200, { expiresAt: fin })
    }

    if (agentId && action === 'regenerer' && req.method === 'POST') {
      if (!autorise) return sendJson(res, 403, { error: "vous n'avez pas le droit d'inviter Claude sur ce document" })
      const body = await readJsonBody(req)
      const r = agents.regenerer(agentId, { par: email, jours: body.jours == null ? undefined : Number(body.jours) })
      if (!r.ok) return sendJson(res, 400, { error: r.raison })
      presenceAgents.retirer(agentId)
      trace('regeneration', r.id)
      return secretEnvoye(200, { id: r.id, adresse: adresseDe(r.secret), expiresAt: r.expiresAt, remplace: r.remplace })
    }

    return sendJson(res, 405, { error: 'méthode non permise' })
  }

  return PAS_TRAITE
}
