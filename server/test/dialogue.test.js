// Le dialogue avec Claude dans l'éditeur, de bout en bout : le vrai serveur,
// de vraies requêtes HTTP, et un faux « api.anthropic.com » qui joue un
// scénario (07/10/2026, server/dialogue.js). Aucune vraie clé n'est utilisée.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'

const PORT = 18793
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-dialogue-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = 'cle-factice-de-test'
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'
process.env.CLAUDE_DIALOGUE = 'admins'

const BASE = `http://localhost:${PORT}`

// Le faux Anthropic : une file de réponses (ou de fonctions), et la trace
// des requêtes reçues.
const vraiFetch = globalThis.fetch
const requetes = []
let scenario = []
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    const corps = JSON.parse(init.body)
    requetes.push({ url: String(url), headers: init.headers, corps })
    const suivant = scenario.shift()
    if (!suivant) return new Response(JSON.stringify({ error: { message: 'appel non prévu par le scénario' } }), { status: 500 })
    const rep = typeof suivant === 'function' ? await suivant(corps) : suivant
    return new Response(JSON.stringify(rep.corps), { status: rep.status || 200, headers: { 'content-type': 'application/json' } })
  }
  return vraiFetch(url, init)
}

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
await attendre()

function attendre() {
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 5000
    ;(function essai() {
      vraiFetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => (Date.now() > limite ? reject(err) : setTimeout(essai, 50)))
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const storage = new Storage(DATA_DIR)

async function documentDeTest(proprietaire = 'admin@example.com') {
  const res = await vraiFetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie(proprietaire) },
    body: JSON.stringify({ title: 'Vie et mort de Zan' }),
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
  storage.appendUpdate(doc.id, Buffer.from(Y.encodeStateAsUpdate(y)))
  await storage.flushAll()
  return doc
}

const texte = (t) => ({ corps: { stop_reason: 'end_turn', content: [{ type: 'text', text: t }], usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 500 } } })
const outil = (id, name, input, avant = '') => ({
  corps: {
    stop_reason: 'tool_use',
    content: [...(avant ? [{ type: 'text', text: avant }] : []), { type: 'tool_use', id, name, input }],
    usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 },
  },
})

async function dialoguer(docId, email, corps) {
  const res = await vraiFetch(`${BASE}/api/docs/${docId}/dialogue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(email ? { cookie: cookie(email) } : {}) },
    body: JSON.stringify(corps),
  })
  if (res.status !== 200) return { status: res.status, erreur: (await res.json()).error }
  const lignes = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l))
  return { status: 200, evenements: lignes, fin: lignes[lignes.length - 1] }
}

const msg = (t) => ({ messages: [{ role: 'user', content: t }] })

test('GET dit qui a droit : administrateurs seuls par défaut, rien sans session', async () => {
  const doc = await documentDeTest()
  const get = (email) => vraiFetch(`${BASE}/api/docs/${doc.id}/dialogue`, { headers: email ? { cookie: cookie(email) } : {} })
  assert.equal((await get(null)).status, 401)
  const admin = await (await get('admin@example.com')).json()
  assert.equal(admin.autorise, true)
  assert.equal(admin.portee, 'admins')
  assert.equal(admin.modele, 'claude-sonnet-5-5')
  const autre = await (await get('quelquun@example.com')).json()
  assert.equal(autre.autorise, false)
  assert.equal(autre.modele, null)
})

test('POST refusé sans droit (403), sans session (401), sur un document inconnu (404)', async () => {
  const doc = await documentDeTest('alice@example.com')
  requetes.length = 0
  scenario = []
  assert.equal((await dialoguer(doc.id, null, msg('bonjour'))).status, 401)
  assert.equal((await dialoguer(doc.id, 'alice@example.com', msg('bonjour'))).status, 403) // propriétaire, mais portée « admins »
  assert.equal((await dialoguer('inconnu', 'admin@example.com', msg('bonjour'))).status, 404)
  assert.equal(requetes.length, 0, 'aucun appel payant avant les contrôles')
})

test('une question : la réponse arrive en flux, le document n’est pas touché, le journal est sans contenu', async () => {
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [outil('t1', 'plan', {}, 'Je regarde le plan.'), texte('Le chapitre premier est court [2].')]
  const r = await dialoguer(doc.id, 'admin@example.com', { messages: [{ role: 'user', content: 'Que dis-tu du début ?' }], portee: { type: 'document' } })
  assert.equal(r.status, 200)
  assert.deepEqual(r.evenements.map((e) => e.type), ['texte', 'outil', 'outil_fin', 'texte', 'fin'])
  assert.equal(r.evenements[1].nom, 'plan')
  assert.equal(r.evenements[2].ok, true)
  assert.match(r.evenements[3].texte, /\[2\]/)
  assert.equal(r.fin.modifications, 0)
  assert.equal(r.fin.usage.tours, 2)
  assert.equal(r.fin.usage.cacheLu, 500)
  assert.equal(r.fin.usage.cacheEcrit, 500)

  // Ce qui part vers l'API : la clé en en-tête, les outils du connecteur,
  // des points de cache, la consigne avec le titre.
  assert.equal(requetes.length, 2)
  const premiere = requetes[0]
  assert.equal(premiere.headers['x-api-key'], 'cle-factice-de-test')
  assert.equal(premiere.corps.model, 'claude-sonnet-5-5')
  const noms = premiere.corps.tools.map((t) => t.name)
  assert.ok(noms.includes('plan') && noms.includes('proposer') && noms.includes('lire'))
  assert.ok(premiere.corps.tools[premiere.corps.tools.length - 1].cache_control)
  assert.match(premiere.corps.system[0].text, /Vie et mort de Zan/)
  assert.ok(premiere.corps.system[0].cache_control)
  const dernier = premiere.corps.messages[premiere.corps.messages.length - 1]
  assert.ok(dernier.content[dernier.content.length - 1].cache_control)
  const seconde = requetes[1].corps.messages
  assert.equal(seconde[seconde.length - 1].content[0].type, 'tool_result')
  assert.match(seconde[seconde.length - 1].content[0].content, /Chapitre premier/)

  // Journal : ni message ni texte du document.
  const fichier = join(DATA_DIR, 'events-dialogue.jsonl')
  assert.ok(existsSync(fichier))
  const journal = readFileSync(fichier, 'utf8')
  assert.ok(journal.includes('"outils"'))
  assert.ok(!journal.includes('Que dis-tu'))
  assert.ok(!journal.includes('plomb'))
  assert.ok(!journal.includes('cle-factice'))
})

test('une demande de correction écrit en suivi de modifications au nom de « Margo (IA) », jamais en direct', async () => {
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [
    outil('t1', 'proposer', { remplacements: [{ bloc: 3, avant: 'Ils mange des pomme', apres: 'Ils mangent des pommes' }] }),
    texte('Une correction proposée au bloc [3].'),
  ]
  const r = await dialoguer(doc.id, 'admin@example.com', msg('Corrige le paragraphe 3'))
  assert.equal(r.status, 200)
  assert.equal(r.fin.modifications, 1)
  assert.equal(r.fin.refus, 0)

  // Relu depuis le journal : une insertion en suivi, l'ancien texte toujours là.
  let xml = ''
  for (let essai = 0; essai < 50; essai++) {
    const y = new Y.Doc()
    for (const op of new Storage(DATA_DIR).readUpdates(doc.id)) Y.applyUpdate(y, op)
    xml = y.getXmlFragment('prosemirror-content').toString()
    if (/insertion/.test(xml)) break
    await new Promise((res) => setTimeout(res, 100))
  }
  assert.match(xml, /insertion/)
  // Le diff est minimal : « nt » et « s » insérés, le reste du texte intact.
  assert.match(xml, /Ils mange<authorColor[^>]*><insertion[^>]*>nt<\/insertion>/)
  assert.match(xml, /des pomme<authorColor[^>]*><insertion[^>]*>s<\/insertion>/)
  assert.ok(!/<deletion/.test(xml))
  assert.match(xml, /Margo \(IA\)/)
})

test('le réglage de réflexion est retenu : refusé une fois, jamais redemandé', async () => {
  process.env.DIALOGUE_MODEL = 'claude-modele-de-test'
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [{ status: 400, corps: { error: { type: 'invalid_request_error', message: 'thinking.type: between_tools is not supported' } } }, texte('Bonjour.'), texte('Encore bonjour.')]
  const a = await dialoguer(doc.id, 'admin@example.com', msg('bonjour'))
  assert.equal(a.evenements[0].type, 'texte')
  assert.deepEqual(requetes.map((q) => q.corps.thinking && q.corps.thinking.type), ['between_tools', 'disabled'])
  const b = await dialoguer(doc.id, 'admin@example.com', msg('encore'))
  assert.equal(b.status, 200)
  assert.equal(requetes[2].corps.thinking.type, 'disabled')
  delete process.env.DIALOGUE_MODEL
})

test('une erreur de l’API devient un événement « erreur » lisible, sans fuite de clé', async () => {
  const doc = await documentDeTest()
  scenario = [{ status: 401, corps: { error: { message: 'invalid x-api-key' } } }]
  const r = await dialoguer(doc.id, 'admin@example.com', msg('bonjour'))
  assert.equal(r.status, 200)
  assert.ok(r.evenements.some((x) => x.type === 'erreur'))
  assert.ok(!JSON.stringify(r.evenements).includes('cle-factice-de-test'))
  assert.equal(r.fin.type, 'fin')
})

test('les entrées invalides sont refusées avant tout appel payant', async () => {
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = []
  const cas = [
    [{ messages: [] }, 400],
    [{ messages: [{ role: 'assistant', content: 'x' }] }, 400],
    [{ messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }] }, 400],
    [{ messages: [{ role: 'user', content: 'x'.repeat(8001) }] }, 413],
    [{}, 400],
  ]
  for (const [corps, status] of cas) assert.equal((await dialoguer(doc.id, 'admin@example.com', corps)).status, status, JSON.stringify(corps).slice(0, 60))
  assert.equal(requetes.length, 0)
})

test('une boucle d’outils sans fin : vingt étapes, puis un bilan sans outil au lieu d’une coupure sèche', async () => {
  const { TOURS_MAX } = await import('../dialogue.js')
  assert.equal(TOURS_MAX, 20)
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [...Array.from({ length: TOURS_MAX }, (_, i) => outil(`t${i}`, 'plan', {})), texte('J’ai relu la moitié ; il reste la fin du chapitre. Relancez sur un passage plus court.')]
  const r = await dialoguer(doc.id, 'admin@example.com', msg('boucle'))
  assert.equal(r.status, 200)
  assert.equal(requetes.length, TOURS_MAX + 1)
  // Les vingt premiers appels ont des outils à disposition ; le dernier n'en a plus le droit.
  assert.ok(requetes.slice(0, TOURS_MAX).every((q) => !q.corps.tool_choice))
  const dernier = requetes[TOURS_MAX].corps
  assert.deepEqual(dernier.tool_choice, { type: 'none' })
  assert.ok(Array.isArray(dernier.tools) && dernier.tools.length > 0, 'les outils restent déclarés : l’historique en contient')
  const derniereEntree = dernier.messages[dernier.messages.length - 1].content
  assert.match(JSON.stringify(derniereEntree), /nombre maximal d’étapes/)
  // La personne reçoit le bilan de Margo, pas une erreur.
  assert.ok(r.evenements.some((e) => e.type === 'texte' && /il reste la fin du chapitre/.test(e.texte)))
  assert.ok(!r.evenements.some((e) => e.type === 'erreur'))
  assert.equal(r.fin.usage.tours, TOURS_MAX + 1)
  scenario = []
})

test('si le bilan final est vide, l’erreur d’avant reste, avec la mention des modifications déjà posées', async () => {
  const { TOURS_MAX } = await import('../dialogue.js')
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [...Array.from({ length: TOURS_MAX }, (_, i) => outil(`v${i}`, 'plan', {})), { corps: { stop_reason: 'end_turn', content: [], usage: { input_tokens: 10, output_tokens: 0 } } }]
  const r = await dialoguer(doc.id, 'admin@example.com', msg('boucle'))
  assert.equal(requetes.length, TOURS_MAX + 1)
  const erreur = r.evenements.find((e) => e.type === 'erreur')
  assert.ok(erreur)
  assert.match(erreur.message, /déjà posées/)
  scenario = []
})

test('la consigne dit combien d’étapes il y a, et de lire large, de grouper et de paralléliser', async () => {
  const { consigne, TOURS_MAX } = await import('../dialogue.js')
  const c = consigne({ prenom: 'Sylvain', titre: 'Test', portee: { type: 'document' } })
  assert.match(c, new RegExp(`au plus ${TOURS_MAX} étapes`))
  assert.match(c, /en accepte jusqu’à 200/)
  assert.match(c, /jusqu’à 30 remplacements/)
  assert.match(c, /dans la même étape/)
})

test('une réponse déjà en cours pour la même personne et le même document : 429', async () => {
  const doc = await documentDeTest()
  let liberer
  const porte = new Promise((r) => (liberer = r))
  scenario = [async () => { await porte; return texte('fini') }]
  const premiere = dialoguer(doc.id, 'admin@example.com', msg('un'))
  await new Promise((r) => setTimeout(r, 200))
  const seconde = await dialoguer(doc.id, 'admin@example.com', msg('deux'))
  assert.equal(seconde.status, 429)
  liberer()
  assert.equal((await premiere).status, 200)
})

test('la portée « editeurs » ouvre le dialogue aux éditeurs, jamais aux lecteurs ni aux correcteurs', async () => {
  process.env.CLAUDE_DIALOGUE = 'editeurs'
  const doc = await documentDeTest('alice@example.com')
  storage.inviteEmail(doc.id, 'lect@example.com', 'lecteur', 'alice@example.com')
  storage.inviteEmail(doc.id, 'corr@example.com', 'correcteur', 'alice@example.com')
  scenario = [texte('Bonjour.')]
  assert.equal((await dialoguer(doc.id, 'alice@example.com', msg('bonjour'))).status, 200)
  assert.equal((await dialoguer(doc.id, 'lect@example.com', msg('bonjour'))).status, 403)
  assert.equal((await dialoguer(doc.id, 'corr@example.com', msg('bonjour'))).status, 403)
  process.env.CLAUDE_DIALOGUE = 'admins'
})
