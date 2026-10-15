import { readJsonBody, origineDe } from './http.js'
import { garde } from './garde-fous.js'

/**
 * `/mcp/<secret>` — le connecteur d'un document (voir server/mcp.js). Toutes
 * les raisons de refuser l'adresse (inconnue, expirée, révoquée, document
 * supprimé, invitant sans droits) donnent **la même réponse**, 404 : rien
 * ne dit à quelqu'un qui devine si une adresse a existé.
 */
export async function traiterMcp(req, res, url, { agents, storage, mcp }) {
  const enTetes = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  const repondre = (status, corps) => {
    const charge = corps === undefined ? '' : JSON.stringify(corps)
    res.writeHead(status, { ...enTetes, 'content-length': Buffer.byteLength(charge) })
    res.end(charge)
  }
  const origine = origineDe(req)
  if (agents.bloque(origine)) return repondre(429, { error: 'trop d’essais' })
  const m = url.pathname.match(/^\/mcp\/([A-Za-z0-9_-]{1,64})$/)
  const acces = m ? agents.acces(m[1], storage) : null
  if (!acces) {
    agents.noterEchec(origine)
    return repondre(404, { error: 'not found' })
  }
  if (req.method !== 'POST') {
    // Pas de flux serveur : le protocole permet de le dire par un 405.
    res.writeHead(405, { ...enTetes, allow: 'POST' })
    return res.end(JSON.stringify({ error: 'method not allowed' }))
  }
  const corps = await readJsonBody(req, garde('corpsMcpOctets'))
  const { status, body } = await mcp.traiter(corps, acces)
  if (body === undefined) {
    res.writeHead(status, { 'cache-control': 'no-store', 'content-length': 0 })
    return res.end()
  }
  repondre(status, body)
}
