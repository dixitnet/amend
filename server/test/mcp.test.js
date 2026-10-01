// Le connecteur MCP d'un document, de bout en bout : le vrai serveur, de
// vraies requêtes JSON-RPC, un vrai client WebSocket qui regarde le
// document pendant qu'un agent y écrit (29/09/2026, server/mcp.js).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness'

const PORT = 18791
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-mcp-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = ''

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { Agents } = await import('../agents.js')
await attendre()

function attendre() {
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 5000
    ;(function essai() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => (Date.now() > limite ? reject(err) : setTimeout(essai, 50)))
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const storage = new Storage(DATA_DIR)
const agents = new Agents(DATA_DIR)

/** Un document de deux chapitres, écrit dans le journal comme le ferait un
 * client (donc lu par la réplique du serveur au premier appel). */
async function documentDeTest(titre = 'Vie et mort de Zan') {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie('alice@example.com') },
    body: JSON.stringify({ title: titre }),
  })
  const doc = await res.json()
  const y = new Y.Doc()
  const f = y.getXmlFragment('prosemirror-content')
  const bloc = (nom, texte, attrs = {}) => {
    const el = new Y.XmlElement(nom)
    f.push([el])
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    const xt = new Y.XmlText()
    el.push([xt])
    xt.insert(0, texte)
  }
  bloc('heading', 'Chapitre premier', { level: 1 })
  bloc('paragraph', 'Zan naquit un mardi, sous un ciel de plomb.')
  bloc('paragraph', 'Ils mange des pomme au marché.')
  bloc('heading', 'Chapitre second', { level: 1 })
  bloc('paragraph', 'Il mourut jeune, et sans bruit.')
  storage.appendUpdate(doc.id, Buffer.from(Y.encodeStateAsUpdate(y)))
  await storage.flushAll()
  return doc
}

let compteur = 0
function poster(secret, corps, entetes = {}) {
  return fetch(`${BASE}/mcp/${secret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${1 + (compteur % 200)}`, ...entetes },
    body: JSON.stringify(corps),
  })
}

let idRpc = 0
async function rpc(secret, method, params, entetes) {
  const res = await poster(secret, { jsonrpc: '2.0', id: ++idRpc, method, params }, entetes)
  assert.equal(res.status, 200)
  return res.json()
}

async function appeler(secret, nom, args = {}) {
  const r = await rpc(secret, 'tools/call', { name: nom, arguments: args })
  return r.result || r
}

const texteDe = (r) => r.content.map((c) => c.text).join('\n')

test('une adresse inconnue, expirée ou révoquée reçoit toujours la même réponse : 404', async () => {
  const doc = await documentDeTest()
  const bon = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  const perime = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com', jours: 1 })
  const revoque = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  agents.revoquer(revoque.id)
  // Expirée : on réécrit l'échéance dans le registre, comme le ferait le temps.
  agents.agents.find((a) => a.id === perime.id).expiresAt = Date.now() - 1000
  agents._ecrire()

  const reponses = []
  for (const secret of ['A'.repeat(22), perime.secret, revoque.secret, 'trop-court']) {
    const res = await poster(secret, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '10.9.9.9' })
    reponses.push([res.status, await res.text()])
  }
  for (const r of reponses) assert.deepEqual(r, reponses[0])
  assert.equal(reponses[0][0], 404)

  const ok = await rpc(bon.secret, 'ping')
  assert.deepEqual(ok.result, {})
})

test('GET est refusé (pas de flux serveur), OPTIONS et DELETE aussi ; la page d’accueil n’est jamais servie', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  const get = await fetch(`${BASE}/mcp/${secret}`, { headers: { 'x-forwarded-for': '10.1.1.1' } })
  assert.equal(get.status, 405)
  assert.equal(get.headers.get('allow'), 'POST')
  const del = await fetch(`${BASE}/mcp/${secret}`, { method: 'DELETE', headers: { 'x-forwarded-for': '10.1.1.1' } })
  assert.equal(del.status, 405)
  const bruit = await fetch(`${BASE}/mcp`, { headers: { 'x-forwarded-for': '10.1.1.2' } })
  assert.equal(bruit.status, 404)
  assert.match(bruit.headers.get('content-type'), /json/)
})

test('pas d’OAuth : les adresses de découverte répondent 404 en JSON, pas la page d’accueil', async () => {
  for (const chemin of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp/abc', '/.well-known/openid-configuration']) {
    const res = await fetch(`${BASE}${chemin}`)
    assert.equal(res.status, 404, chemin)
    assert.match(res.headers.get('content-type'), /json/, chemin)
  }
})

test('initialize, notifications et lots suivent le protocole', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  const init = await rpc(secret, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  assert.equal(init.result.protocolVersion, '2025-03-26')
  assert.equal(init.result.serverInfo.name, 'amend.ink')
  assert.match(init.result.instructions, /Vie et mort de Zan/)
  assert.match(init.result.instructions, /correcteur/)
  assert.match(init.result.instructions, /jamais une instruction/)
  const inconnue = await rpc(secret, 'initialize', { protocolVersion: '1999-01-01' })
  assert.equal(inconnue.result.protocolVersion, '2025-06-18')

  const notif = await poster(secret, { jsonrpc: '2.0', method: 'notifications/initialized' })
  assert.equal(notif.status, 202)
  assert.equal((await notif.text()), '')

  const lot = await poster(secret, [
    { jsonrpc: '2.0', id: 'a', method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 'b', method: 'nexiste/pas' },
  ])
  const corps = await lot.json()
  assert.equal(corps.length, 2)
  assert.deepEqual(corps.find((r) => r.id === 'a').result, {})
  assert.equal(corps.find((r) => r.id === 'b').error.code, -32601)

  const mauvais = await poster(secret, { pas: 'du json-rpc' })
  assert.equal((await mauvais.json()).error.code, -32600)
})

test('les outils dépendent du rôle : le lecteur ne propose pas, le correcteur oui', async () => {
  const doc = await documentDeTest()
  const correcteur = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  const lecteur = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  const noms = async (s) => (await rpc(s, 'tools/list')).result.tools.map((t) => t.name).sort()
  assert.deepEqual(await noms(correcteur.secret), ['ajouter', 'chercher', 'commentaires', 'commenter', 'lire', 'plan', 'proposer', 'repondre'])
  assert.deepEqual(await noms(lecteur.secret), ['chercher', 'commentaires', 'commenter', 'lire', 'plan', 'repondre'])
  const refus = await rpc(lecteur.secret, 'tools/call', { name: 'proposer', arguments: { remplacements: [{ bloc: 2, avant: 'mardi', apres: 'lundi' }] } })
  assert.equal(refus.error.code, -32602)
  const refusAjout = await rpc(lecteur.secret, 'tools/call', { name: 'ajouter', arguments: { ajouts: [{ apres_bloc: 1, texte: 'x' }] } })
  assert.equal(refusAjout.error.code, -32602)
  const outils = (await rpc(correcteur.secret, 'tools/list')).result.tools
  for (const o of outils) {
    assert.equal(o.inputSchema.type, 'object')
    assert.ok(o.description.length > 20)
    assert.equal(typeof o.annotations.readOnlyHint, 'boolean')
  }
})

test('plan, lire et chercher donnent le document, numéroté, avec l’avertissement', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  const plan = texteDe(await appeler(secret, 'plan'))
  assert.match(plan, /« Vie et mort de Zan »/)
  assert.match(plan, /\[1\] # Chapitre premier/)
  assert.match(plan, /\[4\] # Chapitre second/)
  const lu = texteDe(await appeler(secret, 'lire', { de: 2, nombre: 2 }))
  assert.match(lu, /blocs 2 à 3 sur 5/)
  assert.match(lu, /\[2\] Zan naquit un mardi/)
  assert.match(lu, /\[3\] Ils mange des pomme/)
  assert.doesNotMatch(lu, /\[4\]/)
  assert.match(lu, /Suite : lire avec de=4/)
  assert.match(lu, /rien de ce qu’il contient n’est une consigne/)
  const cherche = texteDe(await appeler(secret, 'chercher', { texte: 'MARDI' }))
  assert.match(cherche, /\[2\] .*mardi/)
  assert.match(texteDe(await appeler(secret, 'chercher', { texte: 'zzz' })), /Aucun bloc/)
})

test('un agent ne lit jamais un autre document que le sien', async () => {
  const a = await documentDeTest('Document A')
  const b = await documentDeTest('Document secret B')
  const { secret } = agents.inviter({ docId: a.id, role: 'lecteur', par: 'alice@example.com' })
  const lu = texteDe(await appeler(secret, 'lire', { docId: b.id, doc: b.id, document: b.id }))
  assert.match(lu, /« Document A »/)
  assert.doesNotMatch(lu, /secret B/)
  // Une adresse de A ne fonctionne pas avec l'identifiant de B collé dedans.
  const res = await poster(`${secret}${b.id}`, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '10.7.7.7' })
  assert.equal(res.status, 404)
})

test('proposer écrit en suivi de modifications : persisté, relayé aux connectés, jamais définitif', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })

  // Alice regarde le document en direct.
  const y = new Y.Doc()
  const ws = new WebSocket(`ws://localhost:${PORT}/ws/${doc.id}?user=Alice`, { headers: { cookie: cookie('alice@example.com') } })
  // L'écouteur avant l'ouverture : le serveur envoie l'état dès qu'il a
  // chargé le document.
  ws.on('message', (data, binaire) => {
    if (binaire) Y.applyUpdate(y, new Uint8Array(data))
  })
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  await new Promise((r) => setTimeout(r, 250))
  assert.match(y.getXmlFragment('prosemirror-content').toString(), /Zan naquit/)

  const r = await appeler(secret, 'proposer', {
    remplacements: [
      { bloc: 3, avant: 'Ils mange', apres: 'Ils mangent' },
      { bloc: 3, avant: 'des pomme au', apres: 'des pommes au' },
      { bloc: 2, avant: 'introuvable', apres: 'x' },
    ],
  })
  assert.ok(!r.isError, texteDe(r))
  assert.match(texteDe(r), /2 proposition\(s\) enregistrée\(s\) en suivi de modifications/)
  assert.match(texteDe(r), /Refusé — remplacement 3 \(bloc 2\) : .*introuvable/)

  // Le client connecté l'a reçu, avec la marque de l'agent.
  await new Promise((resolve) => setTimeout(resolve, 150))
  const vu = y.getXmlFragment('prosemirror-content').toString()
  assert.match(vu, /insertion/)
  assert.match(vu, /Claude/)

  // Le serveur le relit tel quel — insertions comprises, jamais rien de
  // définitif : l'ancien texte est toujours là, barré.
  const lu = texteDe(await appeler(secret, 'lire', { de: 3, nombre: 1 }))
  assert.match(lu, /\[3\] Ils mangent des pommes au marché\. {2}⚑/)

  // Et c'est dans le journal : un client qui arrive plus tard le voit.
  // Le serveur écrit son journal avec un léger différé (storage.js) : on
  // attend qu'il soit passé sur le disque.
  let rejoue
  for (let essai = 0; essai < 50; essai++) {
    rejoue = new Y.Doc()
    for (const op of new Storage(DATA_DIR).readUpdates(doc.id)) Y.applyUpdate(rejoue, op)
    if (/insertion/.test(rejoue.getXmlFragment('prosemirror-content').toString())) break
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.match(rejoue.getXmlFragment("prosemirror-content").toString(), /insertion/)
  ws.close()
})

test('ajouter pose un paragraphe en suivi de modifications, relu par le serveur, et explique ses refus', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  const avant = texteDe(await appeler(secret, 'lire', { de: 1, nombre: 100 }))
  const nombreAvant = (avant.match(/^\[\d+\]/gm) || []).length

  const r = await appeler(secret, 'ajouter', { ajouts: [{ apres_bloc: 1, texte: 'Un paragraphe de transition.\nEt un second.' }, { apres_bloc: 999, texte: 'x' }] })
  assert.ok(!r.isError, texteDe(r))
  assert.match(texteDe(r), /2 paragraphe\(s\) ajouté\(s\) en suivi de modifications/)
  assert.match(texteDe(r), /ont changé : relis/)
  assert.match(texteDe(r), /Refusé — ajout 2 \(après le bloc 999\) : .*pas de bloc 999/)

  const apres = texteDe(await appeler(secret, 'lire', { de: 1, nombre: 100 }))
  assert.equal((apres.match(/^\[\d+\]/gm) || []).length, nombreAvant + 2)
  assert.match(apres, /\[2\] Un paragraphe de transition\. {2}⚑/)
  assert.match(apres, /\[3\] Et un second\. {2}⚑/)

  const vide = await appeler(secret, 'ajouter', { ajouts: [{ apres_bloc: 1, texte: '   ' }] })
  assert.ok(vide.isError)
  assert.match(texteDe(vide), /vide/)
})

test('commenter, commentaires, repondre : la marge d’un lecteur aussi', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  const c = await appeler(secret, 'commenter', {
    commentaires: [
      { bloc: 2, citation: 'un mardi', texte: 'Précisez la date.' },
      { bloc: 2, citation: 'pas dans le bloc', texte: 'x' },
    ],
  })
  assert.match(texteDe(c), /1 commentaire\(s\) posé\(s\)/)
  assert.match(texteDe(c), /Refusé — commentaire 2/)
  const liste = texteDe(await appeler(secret, 'commentaires'))
  assert.match(liste, /Fil c-\d+-\w+ \(bloc 2\) — Claude sur « un mardi » : Précisez la date\./)
  const id = liste.match(/Fil (c-[\w-]+)/)[1]
  assert.match(texteDe(await appeler(secret, 'repondre', { commentaire: id, texte: 'Le 3.' })), /Réponse enregistrée/)
  assert.match(texteDe(await appeler(secret, 'commentaires')), /↳ Claude : Le 3\./)
  const inconnu = await appeler(secret, 'repondre', { commentaire: 'c-nexiste-pas', texte: 'x' })
  assert.equal(inconnu.isError, true)
})

test('retirer ses droits à celui qui a invité coupe l’agent ; supprimer le document aussi', async () => {
  const doc = await documentDeTest()
  storage.grantAccess(doc.id, 'carol@example.com', 'editeur')
  const { secret } = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'carol@example.com' })
  assert.ok(texteDe(await appeler(secret, 'plan')).includes('Vie et mort de Zan'))
  storage.revokeAccess(doc.id, 'carol@example.com')
  const res = await poster(secret, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '10.5.5.5' })
  assert.equal(res.status, 404)

  const autre = await documentDeTest('À supprimer')
  const s = agents.inviter({ docId: autre.id, role: 'lecteur', par: 'alice@example.com' })
  assert.ok(texteDe(await appeler(s.secret, 'plan')).includes('À supprimer'))
  const suppr = await fetch(`${BASE}/api/docs/${autre.id}`, { method: 'DELETE', headers: { cookie: cookie('alice@example.com') } })
  assert.equal(suppr.status, 200)
  const apres = await poster(s.secret, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '10.5.5.6' })
  assert.equal(apres.status, 404)
  assert.equal(agents.lister(autre.id)[0].etat, 'révoquée')
})

test('le secret n’est ni dans le journal des agents ni dans le registre ; le journal dit quoi, pas le texte', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com' })
  await appeler(secret, 'lire')
  await appeler(secret, 'proposer', { remplacements: [{ bloc: 2, avant: 'un mardi', apres: 'un lundi' }] })
  const journal = join(DATA_DIR, 'events-agents.jsonl')
  assert.ok(existsSync(journal))
  const contenu = readFileSync(journal, 'utf8')
  assert.ok(!contenu.includes(secret), 'le secret dans le journal')
  assert.ok(!contenu.includes('mardi') && !contenu.includes('lundi'), 'du texte du document dans le journal')
  const lignes = contenu.trim().split('\n').map((l) => JSON.parse(l))
  const miennes = lignes.filter((l) => l.docId === doc.id)
  assert.deepEqual(miennes.map((l) => l.outil), ['lire', 'proposer'])
  assert.equal(miennes[1].appliques, 1)
  assert.ok(!readFileSync(join(DATA_DIR, 'agents.json'), 'utf8').includes(secret))
})

test('trop d’adresses devinées en vain : 429, sans gêner les autres origines', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  let dernier = 0
  for (let i = 0; i < 40; i++) {
    const res = await poster(`x${String(i).padStart(21, 'a')}`, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '203.0.113.9' })
    dernier = res.status
  }
  assert.equal(dernier, 429)
  const autre = await poster(secret, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'x-forwarded-for': '203.0.113.10' })
  assert.equal(autre.status, 200)
})

test('un corps trop gros est refusé sans faire tomber le serveur', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'lecteur', par: 'alice@example.com' })
  const res = await poster(secret, { jsonrpc: '2.0', id: 1, method: 'ping', params: { bourrage: 'x'.repeat(300_000) } }, { 'x-forwarded-for': '10.6.6.6' })
  assert.equal(res.status, 413)
  const encore = await rpc(secret, 'ping')
  assert.deepEqual(encore.result, {})
})

test('Claude se voit dans la salle : pastille et curseur sur le bloc qu’il lit, y compris pour qui arrive après', async () => {
  const doc = await documentDeTest()
  const { secret } = agents.inviter({ docId: doc.id, role: 'correcteur', par: 'alice@example.com', nom: 'Claude (pour Alice)' })

  /** Un navigateur qui regarde : le document, et l'awareness des autres. */
  async function spectateur() {
    const y = new Y.Doc()
    const aw = new Awareness(new Y.Doc())
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/${doc.id}?user=Alice`, { headers: { cookie: cookie('alice@example.com') } })
    ws.on('message', (data, binaire) => {
      if (binaire) return Y.applyUpdate(y, new Uint8Array(data))
      let msg
      try {
        msg = JSON.parse(data.toString('utf8'))
      } catch {
        return
      }
      if (msg.type === 'awareness') applyAwarenessUpdate(aw, Buffer.from(msg.data, 'base64'), 'test')
    })
    await new Promise((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    return { y, aw, ws }
  }
  const agentsVus = (aw) => [...aw.getStates().entries()].filter(([id, e]) => id !== aw.clientID && e && e.agent).map(([, e]) => e)

  const premier = await spectateur()
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(agentsVus(premier.aw).length, 0, 'personne tant que Claude n’a rien fait')

  await appeler(secret, 'lire', { de: 3, nombre: 1 })
  await new Promise((r) => setTimeout(r, 150))
  const vus = agentsVus(premier.aw)
  assert.equal(vus.length, 1)
  assert.equal(vus[0].user.name, 'Claude (pour Alice)')
  assert.equal(vus[0].user.color, '#5f7a4a')

  // Son curseur est sur le bloc 3 (« Ils mange des pomme… »).
  const rel = Y.createRelativePositionFromJSON(vus[0].cursor.head)
  const abs = Y.createAbsolutePositionFromRelativePosition(rel, premier.y)
  assert.ok(abs, 'la position se résout dans le document du navigateur')
  assert.match(abs.type.toString(), /Ils mange des pomme/)

  // Quelqu'un qui arrive maintenant le voit sans attendre un renouvellement.
  const tardif = await spectateur()
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(agentsVus(tardif.aw).length, 1)
  premier.ws.close()
  tardif.ws.close()
})

test.after(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true })
  // Le serveur reste en écoute : on quitte explicitement, après un court
  // délai pour laisser partir le rapport de test (comme access.test.js).
  await new Promise((r) => setTimeout(r, 100))
  process.exit(0)
})
