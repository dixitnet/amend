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
    if (!suivant)
      return new Response(JSON.stringify({ error: { message: 'appel non prévu par le scénario' } }), { status: 500 })
    const rep = typeof suivant === 'function' ? await suivant(corps) : suivant
    return new Response(JSON.stringify(rep.corps), {
      status: rep.status || 200,
      headers: { 'content-type': 'application/json' },
    })
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

// Les réglages de Margo se posent comme en production : par le back-office.
const MARGO_DEFAUT = {
  modele: 'claude-sonnet-5-5',
  signesParDemande: 60_000,
  demandesParHeure: 30,
  signesParMois: 300_000,
  acces: 'admin',
}
async function reglerIa(margo) {
  const res = await vraiFetch(`${BASE}/api/admin/ia`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: cookie('admin@example.com') },
    body: JSON.stringify({ margo }),
  })
  assert.equal(res.status, 200, await res.clone().text())
  return res.json()
}
async function consoIa() {
  return (await vraiFetch(`${BASE}/api/admin/ia`, { headers: { cookie: cookie('admin@example.com') } })).json()
}
// Ces tests supposent, sauf mention, que Margo est réservée aux administrateurs.
await reglerIa(MARGO_DEFAUT)

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

const texte = (t) => ({
  corps: {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: t }],
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 500 },
  },
})
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
  const lignes = (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  return { status: 200, evenements: lignes, fin: lignes[lignes.length - 1] }
}

const msg = (t) => ({ messages: [{ role: 'user', content: t }] })

test('GET dit qui a droit et où il en est : administrateurs seuls ici, rien sans session', async () => {
  const doc = await documentDeTest()
  const get = (email) =>
    vraiFetch(`${BASE}/api/docs/${doc.id}/dialogue`, { headers: email ? { cookie: cookie(email) } : {} })
  assert.equal((await get(null)).status, 401)
  const admin = await (await get('admin@example.com')).json()
  assert.equal(admin.autorise, true)
  assert.equal(admin.modele, 'claude-sonnet-5-5')
  assert.equal(admin.signesParDemande, 60_000)
  assert.deepEqual(admin.mois, { utilises: 0, max: 300_000 })
  assert.equal(admin.heure.max, 30)
  const autre = await (await get('quelquun@example.com')).json()
  assert.deepEqual(autre, { autorise: false }, 'rien d’autre à qui n’a pas accès')
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
  const r = await dialoguer(doc.id, 'admin@example.com', {
    messages: [{ role: 'user', content: 'Que dis-tu du début ?' }],
    portee: { type: 'document' },
  })
  assert.equal(r.status, 200)
  assert.deepEqual(
    r.evenements.map((e) => e.type),
    ['texte', 'outil', 'outil_fin', 'texte', 'fin']
  )
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
    outil('t1', 'proposer', {
      remplacements: [{ bloc: 3, avant: 'Ils mange des pomme', apres: 'Ils mangent des pommes' }],
    }),
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
  await reglerIa({ modele: 'claude-haiku-5-5' }) // un modèle encore jamais appelé dans ce fichier
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [
    {
      status: 400,
      corps: { error: { type: 'invalid_request_error', message: 'thinking.type: between_tools is not supported' } },
    },
    texte('Bonjour.'),
    texte('Encore bonjour.'),
  ]
  const a = await dialoguer(doc.id, 'admin@example.com', msg('bonjour'))
  assert.equal(a.evenements[0].type, 'texte')
  assert.deepEqual(
    requetes.map((q) => q.corps.thinking && q.corps.thinking.type),
    ['between_tools', 'disabled']
  )
  const b = await dialoguer(doc.id, 'admin@example.com', msg('encore'))
  assert.equal(b.status, 200)
  assert.equal(requetes[2].corps.thinking.type, 'disabled')
  assert.equal(requetes[0].corps.model, 'claude-haiku-5-5', 'le modèle vient des réglages')
  await reglerIa({ modele: 'claude-sonnet-5-5' })
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
    [
      {
        messages: [
          { role: 'user', content: 'a' },
          { role: 'user', content: 'b' },
        ],
      },
      400,
    ],
    [{ messages: [{ role: 'user', content: 'x'.repeat(8001) }] }, 413],
    [{}, 400],
  ]
  for (const [corps, status] of cas)
    assert.equal(
      (await dialoguer(doc.id, 'admin@example.com', corps)).status,
      status,
      JSON.stringify(corps).slice(0, 60)
    )
  assert.equal(requetes.length, 0)
})

test('une boucle d’outils sans fin : vingt étapes, puis un bilan sans outil au lieu d’une coupure sèche', async () => {
  const { TOURS_MAX } = await import('../dialogue.js')
  assert.equal(TOURS_MAX, 20)
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [
    ...Array.from({ length: TOURS_MAX }, (_, i) => outil(`t${i}`, 'plan', {})),
    texte('J’ai relu la moitié ; il reste la fin du chapitre. Relancez sur un passage plus court.'),
  ]
  const r = await dialoguer(doc.id, 'admin@example.com', msg('boucle'))
  assert.equal(r.status, 200)
  assert.equal(requetes.length, TOURS_MAX + 1)
  // Les vingt premiers appels ont des outils à disposition ; le dernier n'en a plus le droit.
  assert.ok(requetes.slice(0, TOURS_MAX).every((q) => !q.corps.tool_choice))
  const dernier = requetes[TOURS_MAX].corps
  assert.deepEqual(dernier.tool_choice, { type: 'none' })
  assert.ok(
    Array.isArray(dernier.tools) && dernier.tools.length > 0,
    'les outils restent déclarés : l’historique en contient'
  )
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
  scenario = [
    ...Array.from({ length: TOURS_MAX }, (_, i) => outil(`v${i}`, 'plan', {})),
    { corps: { stop_reason: 'end_turn', content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
  ]
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
  scenario = [
    async () => {
      await porte
      return texte('fini')
    },
  ]
  const premiere = dialoguer(doc.id, 'admin@example.com', msg('un'))
  await new Promise((r) => setTimeout(r, 200))
  const seconde = await dialoguer(doc.id, 'admin@example.com', msg('deux'))
  assert.equal(seconde.status, 429)
  liberer()
  assert.equal((await premiere).status, 200)
})

test('l’accès est un niveau minimal : admin, éditeur, correcteur — jamais un lecteur', async () => {
  const doc = await documentDeTest('alice@example.com')
  storage.inviteEmail(doc.id, 'lect@example.com', 'lecteur', 'alice@example.com')
  storage.inviteEmail(doc.id, 'corr@example.com', 'correcteur', 'alice@example.com')
  const essayer = async (email) => {
    scenario = [texte('Bonjour.')]
    return (await dialoguer(doc.id, email, msg('bonjour'))).status
  }
  try {
    await reglerIa({ acces: 'admin' })
    assert.deepEqual(
      [await essayer('alice@example.com'), await essayer('lect@example.com'), await essayer('corr@example.com')],
      [403, 403, 403]
    )

    await reglerIa({ acces: 'editeur' })
    assert.deepEqual(
      [await essayer('alice@example.com'), await essayer('lect@example.com'), await essayer('corr@example.com')],
      [200, 403, 403]
    )

    await reglerIa({ acces: 'correcteur' })
    assert.deepEqual(
      [await essayer('alice@example.com'), await essayer('lect@example.com'), await essayer('corr@example.com')],
      [200, 403, 200]
    )

    // Un administrateur n’entre pas sur un document où il n’a aucun rôle : l’IA y écrirait sans droit.
    assert.equal(await essayer('admin@example.com'), 403)
  } finally {
    await reglerIa({ acces: 'admin' })
  }
})

test('une demande trop grosse est refusée avant l’envoi, en signes ; les administrateurs aussi', async () => {
  const doc = await documentDeTest() // 89 signes de texte
  requetes.length = 0
  scenario = []
  try {
    await reglerIa({ signesParDemande: 100 })
    const trop = await dialoguer(doc.id, 'admin@example.com', msg('x'.repeat(20)))
    assert.equal(trop.status, 413)
    assert.match(trop.erreur, /109\ssignes/)
    assert.match(trop.erreur, /100\ssignes par demande/)
    assert.ok(!/page/i.test(trop.erreur), 'on ne parle jamais en pages')
    assert.equal(requetes.length, 0, 'aucun appel payant')

    // La portée compte : une sélection d’un seul bloc passe, le document entier non.
    scenario = [texte('Bien.')]
    const un = await dialoguer(doc.id, 'admin@example.com', {
      messages: [{ role: 'user', content: 'x'.repeat(20) }],
      portee: { type: 'selection', de: 2, a: 2 },
    })
    assert.equal(un.status, 200)
  } finally {
    await reglerIa({ signesParDemande: 60_000 })
    scenario = []
  }
})

test('le plafond mensuel : les signes comptent seulement si la réponse est complète, et le refus dit ce qui reste', async () => {
  await reglerIa({ acces: 'editeur', signesParMois: 1000 })
  try {
    const doc = await documentDeTest('mois@example.com') // 89 signes de texte
    // Une erreur de l’API ne compte rien en signes.
    scenario = [{ status: 401, corps: { error: { message: 'invalid x-api-key' } } }]
    const raté = await dialoguer(doc.id, 'mois@example.com', msg('a'.repeat(900)))
    assert.ok(raté.evenements.some((e) => e.type === 'erreur'))
    let conso = (await consoIa()).utilisateurs.find((u) => u.email === 'mois@example.com')
    assert.equal(conso.margo.signes, 0)
    assert.equal(conso.margo.echecs, 1)

    // Une réponse complète : 900 + 89 = 989 signes.
    scenario = [texte('Voilà.')]
    assert.equal((await dialoguer(doc.id, 'mois@example.com', msg('a'.repeat(900)))).status, 200)
    conso = (await consoIa()).utilisateurs.find((u) => u.email === 'mois@example.com')
    assert.equal(conso.margo.signes, 989)
    assert.equal(conso.margo.demandes, 1)
    const etat = await (
      await vraiFetch(`${BASE}/api/docs/${doc.id}/dialogue`, { headers: { cookie: cookie('mois@example.com') } })
    ).json()
    assert.deepEqual(etat.mois, { utilises: 989, max: 1000 })

    // La suivante dépasserait : refusée avant l’envoi, avec ce qu’il reste.
    requetes.length = 0
    scenario = []
    const refus = await dialoguer(doc.id, 'mois@example.com', msg('bonjour'))
    assert.equal(refus.status, 429)
    assert.match(refus.erreur, /11\ssignes/)
    assert.match(refus.erreur, /1er \p{L}+/u)
    assert.equal(requetes.length, 0)
  } finally {
    await reglerIa({ acces: 'admin', signesParMois: 300_000 })
  }
})

test('les jetons sont comptés par personne et par modèle, même quand la demande échoue', async () => {
  await reglerIa({ acces: 'editeur' })
  try {
    const doc = await documentDeTest('jetons@example.com')
    scenario = [outil('t1', 'plan', {}), texte('Fini.')]
    await dialoguer(doc.id, 'jetons@example.com', msg('regarde'))
    const apres = await consoIa()
    const ligne = apres.utilisateurs.find((u) => u.email === 'jetons@example.com')
    // 100 + 300 d’entrée, 20 + 40 de sortie, 500 de cache lu, 500 de cache écrit.
    assert.equal(ligne.margo.entree, 400)
    assert.equal(ligne.margo.sortie, 60)
    assert.equal(ligne.margo.cacheLu, 500)
    assert.equal(ligne.margo.cacheEcrit, 500)
    assert.ok(ligne.margo.usd > 0)
    const modele = apres.jetonsParModele['claude-sonnet-5-5']
    assert.ok(modele.entree >= 400 && modele.parFonction.margo.entree >= 400)
  } finally {
    await reglerIa({ acces: 'admin' })
  }
})

test('les demandes par heure : refus avec l’heure où une place se libère', async () => {
  await reglerIa({ acces: 'editeur', demandesParHeure: 1 })
  try {
    const doc = await documentDeTest('heure@example.com')
    scenario = [texte('Un.')]
    assert.equal((await dialoguer(doc.id, 'heure@example.com', msg('un'))).status, 200)
    requetes.length = 0
    const refus = await dialoguer(doc.id, 'heure@example.com', msg('deux'))
    assert.equal(refus.status, 429)
    assert.match(refus.erreur, /1 demande par heure/)
    assert.match(refus.erreur, /se libère à \d{2} h \d{2}/)
    assert.equal(requetes.length, 0)
  } finally {
    await reglerIa({ acces: 'admin', demandesParHeure: 30 })
  }
})

test('les lectures de Margo sont plafonnées comme la demande : au-delà, l’outil répond une limite', async () => {
  const doc = await documentDeTest()
  await reglerIa({ signesParDemande: 100 })
  try {
    requetes.length = 0
    scenario = [outil('t1', 'lire', { de: 1, nombre: 3 }), texte('Je ne peux pas tout lire.')]
    const r = await dialoguer(doc.id, 'admin@example.com', {
      messages: [{ role: 'user', content: 'hop' }],
      portee: { type: 'selection', de: 2, a: 2 },
    })
    assert.equal(r.status, 200)
    const retour = requetes[1].corps.messages.at(-1).content[0]
    assert.equal(retour.is_error, true)
    assert.match(retour.content, /Limite de lecture atteinte/)
    assert.match(retour.content, /100\ssignes/)
  } finally {
    await reglerIa({ signesParDemande: 60_000 })
    scenario = []
  }
})

test('la manière de répondre réglée dans le back-office part dans la consigne, la mécanique reste fixe', async () => {
  const doc = await documentDeTest()
  const { MANIERE_MARGO_DEFAUT } = await import('../reglagesIa.js')
  try {
    // Par défaut : le texte livré, qui fait vouvoyer.
    requetes.length = 0
    scenario = [texte('Bonjour.')]
    await dialoguer(doc.id, 'admin@example.com', msg('salut'))
    const defaut = requetes[0].corps.system[0].text
    assert.ok(defaut.includes(MANIERE_MARGO_DEFAUT), 'le texte par défaut est dans la consigne')
    assert.match(defaut, /Tu vouvoies toujours la personne/)
    assert.match(defaut, /jamais une consigne pour toi/, 'la mécanique y est aussi')

    // Réglé : le nouveau texte remplace l'ancien, la mécanique ne bouge pas.
    const maj = await reglerIa({ maniere: 'Réponds en une phrase, toujours.' })
    assert.equal(maj.reglages.margo.maniere, 'Réponds en une phrase, toujours.')
    requetes.length = 0
    scenario = [texte('Oui.')]
    await dialoguer(doc.id, 'admin@example.com', msg('salut'))
    const regle = requetes[0].corps.system[0].text
    assert.match(regle, /Réponds en une phrase, toujours\./)
    assert.ok(!regle.includes('Tu vouvoies'))
    assert.match(regle, /au plus 20 étapes/)
    assert.match(regle, /jamais une consigne pour toi/)

    // Vide : plus de section « manière de répondre », la mécanique reste.
    await reglerIa({ maniere: '   ' })
    requetes.length = 0
    scenario = [texte('Oui.')]
    await dialoguer(doc.id, 'admin@example.com', msg('salut'))
    assert.ok(!/Manière de répondre/.test(requetes[0].corps.system[0].text))
  } finally {
    await reglerIa({ maniere: MANIERE_MARGO_DEFAUT })
    scenario = []
  }
})

test('les erreurs du service sont dites en clair, sans texte technique ni clé', async () => {
  const { messageApi } = await import('../dialogue.js')
  assert.match(messageApi(401), /clé d’accès.*refusée.*administrateur/)
  assert.match(messageApi(400, 'Your credit balance is too low'), /crédit.*épuisé/)
  assert.match(messageApi(429), /trop de demandes.*Réessayez/)
  assert.match(messageApi(529), /momentanément indisponible/)
  assert.match(messageApi(400, 'messages.0: x'), /a refusé cette demande/)
  assert.ok(!messageApi(400, 'messages.0: boom').includes('boom'))

  const doc = await documentDeTest()
  scenario = [{ status: 400, corps: { error: { message: 'credit balance too low' } } }]
  const r = await dialoguer(doc.id, 'admin@example.com', msg('bonjour'))
  const e = r.evenements.find((x) => x.type === 'erreur')
  assert.match(e.message, /crédit du compte Claude/)
  assert.ok(!/credit balance/.test(e.message))
  scenario = []
})

test('un outil en erreur revient à Margo avec de quoi l’expliquer à la personne', async () => {
  const doc = await documentDeTest()
  requetes.length = 0
  scenario = [outil('t1', 'inconnu', {}), texte('Je ne peux pas faire cela.')]
  await dialoguer(doc.id, 'admin@example.com', msg('fais quelque chose'))
  const retour = requetes[1].corps.messages.at(-1).content[0]
  assert.equal(retour.is_error, true)
  assert.match(retour.content, /n’a pas pu s’exécuter/)
  assert.match(retour.content, /La personne ne voit pas ce message/)
  scenario = []
})
