// Le banc d'essai de Margo (03/11/2026, server/banc.js) : le texte collé devient
// un document en mémoire, chaque colonne y travaille avec la vraie boucle de
// Margo, et rien n'est enregistré ni compté. Le vrai serveur, de vraies requêtes
// HTTP et un faux « api.anthropic.com » qui répond selon le modèle demandé.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18834
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-banc-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = 'cle-factice-de-test'
process.env.MISTRAL_API_KEY = 'cle-mistral-factice'
process.env.SCALEWAY_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'

const BASE = `http://localhost:${PORT}`

// Le faux Anthropic : une file de réponses par modèle (les colonnes tournent
// en même temps), et la trace des requêtes reçues.
const vraiFetch = globalThis.fetch
const requetes = []
const scenarios = {}
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    const corps = JSON.parse(init.body)
    requetes.push(corps)
    const suivant = (scenarios[corps.model] || []).shift()
    if (!suivant)
      return new Response(JSON.stringify({ error: { message: 'appel non prévu par le scénario' } }), { status: 500 })
    // Un peu d'attente : les deux colonnes s'entrelacent vraiment.
    await new Promise((r) => setTimeout(r, 5))
    return new Response(JSON.stringify(suivant), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (String(url).startsWith('https://api.eu.mistral.ai/')) {
    const corps = JSON.parse(init.body)
    requetesMistral.push(corps)
    const suivant = (scenarios[corps.model] || []).shift()
    if (!suivant) return new Response(JSON.stringify({ message: 'appel non prévu par le scénario' }), { status: 500 })
    return new Response(JSON.stringify(suivant), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return vraiFetch(url, init)
}
const requetesMistral = []
const mistralTexte = (t) => ({
  id: 'x',
  choices: [{ message: { role: 'assistant', content: t }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
})

const { blocsDeTexte, documentDeTexte, resultatDe, morceauxEnLigne } = await import('../banc.js')
const { proposer, commenter, blocsDuDocument } = await import('../agentTexte.js')
await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
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
const ADMIN = 'admin@example.com'

const texte = (t) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: t }],
  usage: { input_tokens: 100, output_tokens: 20 },
})
const outil = (id, name, input) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
  usage: { input_tokens: 300, output_tokens: 40 },
})

const TEXTE = [
  '# Chapitre premier',
  '',
  'Zan naquit un mardi, sous un ciel de plomb.',
  'Ils mange des pomme au **marché**.',
  '- une puce',
  '- une autre',
].join('\n')

async function banc(email, corps) {
  const res = await vraiFetch(`${BASE}/api/admin/banc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(email ? { cookie: cookie(email) } : {}) },
    body: JSON.stringify(corps),
  })
  if (res.status !== 200) return { status: res.status, erreur: (await res.json()).error }
  const evenements = (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  return { status: 200, evenements }
}

// ------------------------------------------------------------------ le texte

test('le texte collé : un bloc par ligne non vide, titres, listes, citations, gras et italique', () => {
  assert.deepEqual(blocsDeTexte('# Titre\n\nUn.\nDeux.\n\n- a\n- b\n1. c\n> cité\n### Sous'), [
    { type: 'heading', niveau: 1, texte: 'Titre' },
    { type: 'paragraph', texte: 'Un.' },
    { type: 'paragraph', texte: 'Deux.' },
    { type: 'bullet_list', items: ['a', 'b'] },
    { type: 'ordered_list', items: ['c'] },
    { type: 'blockquote', texte: 'cité' },
    { type: 'heading', niveau: 3, texte: 'Sous' },
  ])
  assert.deepEqual(morceauxEnLigne('Un **gras** et *ital* et _aussi_ ; snake_case_ici reste.'), [
    ['Un ', {}],
    ['gras', { strong: {} }],
    [' et ', {}],
    ['ital', { em: {} }],
    [' et ', {}],
    ['aussi', { em: {} }],
    [' ; snake_case_ici reste.', {}],
  ])
  // Les accents décomposés sont recomposés (NFC), comme partout ailleurs.
  assert.equal(blocsDeTexte('été')[0].texte, 'été')
})

test('le document en mémoire se lit comme un vrai : blocs numérotés, listes comprises', () => {
  const ydoc = documentDeTexte(TEXTE)
  const blocs = blocsDuDocument(ydoc)
  assert.deepEqual(
    blocs.map((b) => [b.n, b.nom, b.texte]),
    [
      [1, 'heading', 'Chapitre premier'],
      [2, 'paragraph', 'Zan naquit un mardi, sous un ciel de plomb.'],
      [3, 'paragraph', 'Ils mange des pomme au marché.'],
      [4, 'paragraph', 'une puce'],
      [5, 'paragraph', 'une autre'],
    ]
  )
  assert.deepEqual(blocs[3].contexte, ['bullet_list', 'list_item'])
})

test('le résultat : blocs modifiés en morceaux égal / supprimé / ajouté, commentaires avec leur passage', () => {
  const ydoc = documentDeTexte(TEXTE)
  const auteur = { name: 'Margo (IA)', color: '#000' }
  const v = proposer(ydoc, [{ bloc: 3, avant: 'Ils mange des pomme', apres: 'Ils dévorent des pommes' }], auteur)
  assert.equal(v.appliques.length, 1)
  assert.equal(commenter(ydoc, { bloc: 2, citation: 'ciel de plomb', texte: 'Image convenue.' }, auteur).ok, true)
  const r = resultatDe(ydoc)
  assert.equal(r.modifications.length, 1)
  const m = r.modifications[0]
  assert.equal(m.bloc, 3)
  assert.equal(m.ajoute, false)
  const lu = (type) =>
    m.morceaux
      .filter((x) => x.type === type)
      .map((x) => x.t)
      .join('|')
  assert.equal(lu('del'), 'mange')
  assert.equal(lu('ins'), 'dévorent|s')
  assert.match(lu('egal'), /au marché\./)
  assert.deepEqual(r.commentaires, [{ bloc: 2, passage: 'ciel de plomb', texte: 'Image convenue.', reponses: [] }])
})

// ----------------------------------------------------------------- la route

test('réservé aux administrateurs : 401/403 sans appel au fournisseur', async () => {
  requetes.length = 0
  const get = (email) => vraiFetch(`${BASE}/api/admin/banc`, { headers: email ? { cookie: cookie(email) } : {} })
  assert.equal((await get(null)).status, 403)
  assert.equal((await get('alice@example.com')).status, 403)
  const corps = { texte: TEXTE, consigne: 'Corrige.', colonnes: [{ modele: 'claude-sonnet-5-5' }] }
  assert.equal((await banc('alice@example.com', corps)).status, 403)
  assert.equal((await banc(null, corps)).status, 403)
  assert.equal(requetes.length, 0)
})

test('GET : les modèles avec l’état de leur clé, la manière de répondre et la limite de production', async () => {
  const d = await (await vraiFetch(`${BASE}/api/admin/banc`, { headers: { cookie: cookie(ADMIN) } })).json()
  assert.equal(d.colonnesMax, 3)
  assert.equal(typeof d.maniere, 'string')
  assert.ok(d.maniere.length > 0)
  assert.ok(Number.isInteger(d.signesParDemande))
  const sonnet = d.modeles.find((m) => m.id === 'claude-sonnet-5-5')
  const mistral = d.modeles.find((m) => m.id === 'mistral-large-4-0')
  const qwen = d.modeles.find((m) => m.id === 'qwen3.5-397b-a17b')
  assert.equal(sonnet.cle, true)
  assert.equal(mistral.cle, true)
  assert.equal(qwen.cle, false)
  assert.deepEqual(sonnet.reflexion, { niveaux: ['aucune', 'low', 'medium', 'high'], defaut: 'aucune' })
  assert.deepEqual(mistral.reflexion, { niveaux: ['low', 'medium', 'high'], defaut: 'low' })
  assert.equal(d.enCours, false)
})

test('demandes invalides : 400 avec un message clair, sans appel au fournisseur', async () => {
  requetes.length = 0
  const col = [{ modele: 'claude-sonnet-5-5' }]
  const cas = [
    [{ texte: '  ', consigne: 'x', colonnes: col }, /texte/],
    [{ texte: TEXTE, consigne: '', colonnes: col }, /consigne/],
    [{ texte: TEXTE, consigne: 'x', colonnes: [] }, /au moins un modèle/],
    [{ texte: TEXTE, consigne: 'x', colonnes: [...col, ...col, ...col, ...col] }, /3 colonnes au plus/],
    [{ texte: TEXTE, consigne: 'x', colonnes: [{ modele: 'gpt-5' }] }, /modèle inconnu/],
    [{ texte: TEXTE, consigne: 'x', colonnes: [{ modele: 'qwen3.5-397b-a17b' }] }, /clé d’accès à Scaleway/],
    [
      { texte: TEXTE, consigne: 'x', colonnes: [{ modele: 'mistral-large-4-0', reflexion: 'aucune' }] },
      /réflexion non accepté/,
    ],
    [
      { texte: TEXTE, consigne: 'x', colonnes: [{ modele: 'claude-haiku-5-5', reflexion: 'max' }] },
      /réflexion non accepté/,
    ],
  ]
  for (const [corps, motif] of cas) {
    const r = await banc(ADMIN, corps)
    assert.equal(r.status, 400, JSON.stringify(corps).slice(0, 80))
    assert.match(r.erreur, motif)
  }
  assert.equal(requetes.length, 0)
})

test('deux colonnes en même temps, chacune sur sa copie ; rien n’est enregistré ni compté', async () => {
  requetes.length = 0
  const docsAvant = existsSync(join(DATA_DIR, 'docs')) ? readdirSync(join(DATA_DIR, 'docs')).length : 0
  scenarios['claude-sonnet-5-5'] = [
    outil('s1', 'lire', {}),
    outil('s2', 'proposer', {
      remplacements: [{ bloc: 3, avant: 'Ils mange des pomme', apres: 'Ils mangent des pommes' }],
    }),
    texte('Une correction au bloc [3].'),
  ]
  scenarios['claude-haiku-5-5'] = [
    outil('h1', 'lire', {}),
    outil('h2', 'commenter', { commentaires: [{ bloc: 2, citation: 'ciel de plomb', texte: 'Cliché ?' }] }),
    texte('Un commentaire.'),
  ]
  const r = await banc(ADMIN, {
    titre: 'Zan',
    texte: TEXTE,
    consigne: 'Relis ce texte.',
    colonnes: [{ modele: 'claude-sonnet-5-5' }, { modele: 'claude-haiku-5-5', maniere: 'Réponds en une phrase.' }],
  })
  assert.equal(r.status, 200)
  const [debut] = r.evenements
  assert.equal(debut.type, 'debut')
  assert.deepEqual(
    debut.colonnes.map((c) => [c.modele, c.maniereModifiee]),
    [
      ['claude-sonnet-5-5', false],
      ['claude-haiku-5-5', true],
    ]
  )
  assert.equal(debut.signes, 'Chapitre premier'.length + 43 + 30 + 8 + 9)
  assert.equal(r.evenements[r.evenements.length - 1].type, 'termine')

  const de = (col, type) => r.evenements.filter((e) => e.col === col && e.type === type)
  // Colonne 1 (Sonnet) : la correction, aucun commentaire.
  const r0 = de(0, 'resultat')[0]
  assert.equal(r0.modifications.length, 1)
  assert.equal(r0.modifications[0].bloc, 3)
  assert.equal(r0.commentaires.length, 0)
  assert.match(de(0, 'texte')[0].texte, /\[3\]/)
  assert.equal(de(0, 'fin')[0].modifications, 1)
  assert.ok(de(0, 'fin')[0].lus > 0, 'les signes lus sont donnés')
  // Colonne 2 (Haiku) : le commentaire, aucune modification — l'autre copie n'a rien vu.
  const r1 = de(1, 'resultat')[0]
  assert.equal(r1.modifications.length, 0)
  // (le moteur typographie le commentaire : espace fine insécable avant « ? »)
  assert.deepEqual(r1.commentaires, [{ bloc: 2, passage: 'ciel de plomb', texte: 'Cliché\u202f?', reponses: [] }])

  // Ce qui est parti : le titre et la manière de répondre propres à chaque colonne.
  const systeme = (modele) => requetes.find((q) => q.model === modele).system[0].text
  assert.match(systeme('claude-sonnet-5-5'), /« Zan »/)
  assert.match(systeme('claude-haiku-5-5'), /Réponds en une phrase\./)
  assert.doesNotMatch(systeme('claude-sonnet-5-5'), /Réponds en une phrase\./)
  assert.equal(requetes.length, 6)

  // Rien d'enregistré : aucun document, aucune consommation, aucun journal de dialogue.
  const docsApres = existsSync(join(DATA_DIR, 'docs')) ? readdirSync(join(DATA_DIR, 'docs')).length : 0
  assert.equal(docsApres, docsAvant)
  const ia = await (await vraiFetch(`${BASE}/api/admin/ia`, { headers: { cookie: cookie(ADMIN) } })).json()
  assert.deepEqual(ia.utilisateurs, [])
  for (const f of readdirSync(DATA_DIR).filter((f) => f.startsWith('events-'))) {
    const contenu = readFileSync(join(DATA_DIR, f), 'utf8')
    assert.doesNotMatch(contenu, /"dialogue"|banc-/, f)
    assert.doesNotMatch(contenu, /ciel de plomb/, f)
  }
})

test('le texte n’est pas limité par la taille de demande de la production, mais la page en est avertie', async () => {
  const reglage = await vraiFetch(`${BASE}/api/admin/ia`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: cookie(ADMIN) },
    body: JSON.stringify({ margo: { signesParDemande: 100 } }),
  })
  assert.equal(reglage.status, 200, await reglage.clone().text())
  const long = Array.from({ length: 40 }, (_, i) => `Phrase numéro ${i + 1}, assez longue pour compter.`).join('\n')
  scenarios['claude-sonnet-5-5'] = [outil('l1', 'lire', { de: 1, nombre: 40 }), texte('Lu.')]
  requetes.length = 0
  const r = await banc(ADMIN, { texte: long, consigne: 'Lis tout.', colonnes: [{ modele: 'claude-sonnet-5-5' }] })
  assert.equal(r.status, 200)
  assert.equal(r.evenements[0].refuseeEnProduction, true)
  assert.equal(r.evenements[0].signesParDemande, 100)
  // La lecture n'a pas été coupée par la limite de production.
  const resultatLire = requetes[1].messages.at(-1).content.find((c) => c.type === 'tool_result')
  assert.ok(!resultatLire.is_error, resultatLire.content.slice(0, 200))
  assert.match(resultatLire.content, /Phrase numéro 40/)
})

test('Y.Doc détruit après l’essai : le banc ne garde aucune copie', async () => {
  const { Banc } = await import('../banc.js')
  const b = new Banc({ fetch: async () => new Response(JSON.stringify(texte('Rien.')), { status: 200 }) })
  const evts = []
  await b.lancer(
    { texte: 'Un.', consigne: 'x', titre: 't', colonnes: [{ modele: 'claude-haiku-5-5', nom: 'Haiku', maniere: '' }] },
    { email: ADMIN, prenom: 'Ad', signesParDemande: 1000 },
    (e) => evts.push(e)
  )
  assert.equal(b.docs.size, 0)
  assert.equal(b.enCours, false)
  assert.deepEqual(
    evts.map((e) => e.type),
    ['debut', 'texte', 'fin', 'resultat']
  )
})

test('niveau de réflexion par colonne : effort chez Anthropic, reasoning_effort chez Mistral, défaut = production', async () => {
  requetes.length = 0
  requetesMistral.length = 0
  scenarios['claude-sonnet-5-5'] = [texte('Moyen.')]
  scenarios['claude-haiku-5-5'] = [texte('Sans.')]
  scenarios['mistral-large-4-0'] = [mistralTexte('Haut.'), mistralTexte('Bas.')]
  const r = await banc(ADMIN, {
    texte: TEXTE,
    consigne: 'Un avis ?',
    colonnes: [
      { modele: 'claude-sonnet-5-5', reflexion: 'medium' },
      { modele: 'claude-haiku-5-5' },
      { modele: 'mistral-large-4-0', reflexion: 'high' },
    ],
  })
  assert.equal(r.status, 200)
  assert.deepEqual(
    r.evenements[0].colonnes.map((c) => c.reflexion),
    ['medium', 'aucune', 'high']
  )
  const sonnet = requetes.find((q) => q.model === 'claude-sonnet-5-5')
  assert.deepEqual(sonnet.thinking, { type: 'adaptive' })
  assert.deepEqual(sonnet.output_config, { effort: 'medium' })
  const haiku = requetes.find((q) => q.model === 'claude-haiku-5-5')
  assert.equal(haiku.output_config, undefined, 'réflexion coupée, comme en production')
  assert.notEqual(haiku.thinking && haiku.thinking.type, 'adaptive')
  assert.equal(requetesMistral[0].reasoning_effort, 'high')

  // Sans niveau demandé, Large 4 reçoit celui de la production : `low` (Mistral refuse `none`).
  requetesMistral.length = 0
  const r2 = await banc(ADMIN, { texte: TEXTE, consigne: 'Un avis ?', colonnes: [{ modele: 'mistral-large-4-0' }] })
  assert.equal(r2.status, 200)
  assert.equal(requetesMistral[0].reasoning_effort, 'low')
})
