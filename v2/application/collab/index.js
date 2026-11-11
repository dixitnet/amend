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
  delaiServeur: 5000,
}

/** Une question au serveur : réponse en JSON, ou `null` (refus) s'il ne répond
 * pas dans le délai ou répond une erreur. */
async function demander(url, entetes) {
  try {
    const r = await fetch(url, { headers: entetes, signal: AbortSignal.timeout(CONF.delaiServeur) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

const identifier = async (cookie) => (cookie ? demander(`${CONF.serveur}/api/moi`, { cookie }) : null)

async function droits(docId, idPersonne, branche) {
  const q = new URLSearchParams({ document: docId, personne: idPersonne, branche })
  return (
    (await demander(`${CONF.serveur}/api/interne/droits?${q}`, { 'x-amend-interne': CONF.jetonInterne }))?.acces ?? null
  )
}

/** Le contenu d'un document a changé : le serveur note la date (comme
 * \`touchDocument\` de Docs : sans attendre, au mieux ; une notification perdue
 * ne retarde la date que jusqu'à la modification suivante). */
function surModification(docId) {
  fetch(`${CONF.serveur}/api/interne/modifie?${new URLSearchParams({ document: docId })}`, {
    method: 'POST',
    headers: { 'x-amend-interne': CONF.jetonInterne },
    signal: AbortSignal.timeout(CONF.delaiServeur),
  }).catch(() => {})
}

const collab = await demarrerCollaboration({
  ...CONF,
  identifier,
  droits,
  surModification,
  jetonInterne: CONF.jetonInterne,
})
console.log(`[collab] ws://127.0.0.1:${CONF.port}${collab.cheminWebSocket}/<document>`)

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    try {
      await collab.fermer()
      process.exit(0)
    } catch (err) {
      // Un arrêt qui n'a pas pu finir proprement doit se voir (code non nul, journal).
      console.error('[collab] arrêt incomplet :', err)
      process.exit(1)
    }
  })
