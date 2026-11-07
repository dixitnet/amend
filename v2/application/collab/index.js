// Le processus de collaboration (couche application) : y/hub, branché sur
// notre serveur pour l'identité et les droits, comme Docs le branche sur son
// backend. Un processus à part (ADR 0004).
import { demarrerCollaboration } from '../../adaptateurs/yhub/index.js'

const CONF = {
  port: Number(process.env.V2_COLLAB_PORT || 4400),
  redis: process.env.V2_REDIS || 'redis://127.0.0.1:6379',
  postgres: process.env.V2_POSTGRES || 'postgres://amendv2:amendv2-dev@127.0.0.1:5432/amendv2_yhub',
  serveur: process.env.V2_SERVEUR || 'http://127.0.0.1:4300',
  jetonInterne: process.env.V2_JETON_INTERNE || '',
  origines: (process.env.V2_ORIGINES || 'http://127.0.0.1:4300').split(',').filter(Boolean),
  delaiPersistance: Number(process.env.V2_DELAI_PERSISTANCE || 2000),
}

async function identifier(cookie) {
  if (!cookie) return null
  const r = await fetch(`${CONF.serveur}/api/moi`, { headers: { cookie } })
  return r.ok ? r.json() : null
}

async function droits(docId, idPersonne) {
  const url = `${CONF.serveur}/api/interne/droits?document=${encodeURIComponent(docId)}&personne=${encodeURIComponent(idPersonne)}`
  const r = await fetch(url, { headers: { 'x-amend-interne': CONF.jetonInterne } })
  return r.ok ? (await r.json()).droit : null
}

const collab = await demarrerCollaboration({ ...CONF, identifier, droits })
console.log(`[collab] ws://127.0.0.1:${CONF.port}${collab.cheminWebSocket}/<document>`)

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await collab.fermer()
    process.exit(0)
  })
