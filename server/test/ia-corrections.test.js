// Corrections IA (la barre latérale) et les réglages d'IA du back-office, de
// bout en bout : le vrai serveur, de vraies requêtes HTTP et un faux
// « api.anthropic.com » (13/10/2026). Tout se compte en signes, espaces compris.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18830
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-corrections-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = 'cle-factice-de-test'
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'
const BASE = `http://localhost:${PORT}`

const vraiFetch = globalThis.fetch
const requetes = []
const requetesMistral = []
let reponse = null // une fonction (corps de requête) → { status?, corps }
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    const corps = JSON.parse(init.body)
    requetes.push(corps)
    const rep = reponse ? await reponse(corps) : succes('Texte corrigé.')
    return new Response(JSON.stringify(rep.corps), {
      status: rep.status || 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  if (String(url).startsWith('https://api.eu.mistral.ai/')) {
    requetesMistral.push({ url: String(url), headers: init.headers, corps: JSON.parse(init.body) })
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'Texte corrigé par Mistral.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 80, completion_tokens: 6 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  return vraiFetch(url, init)
}
const succes = (texte, usage = { input_tokens: 50, output_tokens: 10 }) => ({
  corps: { stop_reason: 'end_turn', content: [{ type: 'text', text: texte }], usage },
})

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
for (let i = 0; i < 100; i++) {
  try {
    await vraiFetch(`${BASE}/api/docs`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 50))
  }
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const json = { 'content-type': 'application/json' }
const storage = new Storage(DATA_DIR)

async function document(proprietaire) {
  const res = await vraiFetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { ...json, cookie: cookie(proprietaire) },
    body: JSON.stringify({ title: 'Doc' }),
  })
  return (await res.json()).id
}
async function regler(patch, email = 'admin@example.com') {
  return vraiFetch(`${BASE}/api/admin/ia`, {
    method: 'PUT',
    headers: { ...json, cookie: cookie(email) },
    body: JSON.stringify(patch),
  })
}
async function conso() {
  return (await vraiFetch(`${BASE}/api/admin/ia`, { headers: { cookie: cookie('admin@example.com') } })).json()
}
const ligneDe = async (email) => (await conso()).utilisateurs.find((u) => u.email === email)
const demander = (docId, email, corps) =>
  vraiFetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { ...json, cookie: cookie(email) },
    body: JSON.stringify({ docId, instruction: 'Corrige.', ...corps }),
  })
const RAZ = {
  modele: 'claude-haiku-5-5',
  signesParDemande: 30_000,
  demandesParHeure: 100,
  signesParMois: 500_000,
  acces: 'editeur',
}
const remettre = () => regler({ corrections: RAZ })

test('les réglages : réservés aux administrateurs, bornés, avec des messages clairs', async () => {
  const lecture = await vraiFetch(`${BASE}/api/admin/ia`, { headers: { cookie: cookie('simple@example.com') } })
  assert.equal(lecture.status, 403)
  assert.equal((await regler({ corrections: { signesParDemande: 500 } }, 'simple@example.com')).status, 403)

  const etat = await conso()
  assert.deepEqual(
    etat.modeles.map((m) => m.id),
    ['claude-haiku-5-5', 'claude-sonnet-5-5', 'mistral-large-4-0'],
    'Haiku, Sonnet et Mistral Large 4 seulement'
  )
  assert.deepEqual(etat.niveaux, ['admin', 'editeur', 'correcteur'])
  assert.equal(etat.reglages.corrections.modele, 'claude-haiku-5-5')
  assert.equal(etat.reglages.margo.modele, 'claude-sonnet-5-5')

  const refus = async (patch, motif) => {
    const res = await regler(patch)
    assert.equal(res.status, 400)
    const { error } = await res.json()
    assert.match(error, motif)
    assert.ok(!/page/i.test(error), 'jamais de pages')
  }
  await refus({ corrections: { modele: 'claude-opus-5' } }, /modèle inconnu/)
  await refus({ corrections: { signesParDemande: 0 } }, /signes par demande/)
  await refus({ margo: { demandesParHeure: 1.5 } }, /demandes par heure/)
  await refus({ margo: { signesParMois: '1000' } }, /signes par mois/)
  await refus({ margo: { acces: 'lecteur' } }, /niveau d’accès/)
  await refus({ margo: { n_importe_quoi: 1 } }, /réglage inconnu/)
  await refus({ dialogue: {} }, /fonction inconnue/)
  // Tout ou rien : la première valeur valable n'a pas été appliquée.
  const rate = await regler({ corrections: { signesParDemande: 2000 }, margo: { acces: 'nimporte' } })
  assert.equal(rate.status, 400)
  assert.equal((await conso()).reglages.corrections.signesParDemande, 30_000)

  const ok = await regler({ corrections: { signesParDemande: 2000 } })
  assert.equal(ok.status, 200)
  const apres = await conso()
  assert.equal(apres.reglages.corrections.signesParDemande, 2000)
  assert.equal(apres.reglages.modifiePar, 'admin@example.com')
  await remettre()
})

test('une correction réussie : le modèle des réglages, les signes de la personne et les jetons sont comptés', async () => {
  const doc = await document('alice@example.com')
  requetes.length = 0
  reponse = null
  const res = await demander(doc, 'alice@example.com', { text: 'Ils mange des pomme.' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).suggestion, 'Texte corrigé.')
  assert.equal(requetes[0].model, 'claude-haiku-5-5')

  const ligne = await ligneDe('alice@example.com')
  assert.equal(ligne.corrections.signes, 20)
  assert.equal(ligne.corrections.demandes, 1)
  assert.equal(ligne.corrections.entree, 50)
  assert.equal(ligne.corrections.sortie, 10)
  assert.ok(ligne.corrections.usd > 0)
  const haiku = (await conso()).jetonsParModele['claude-haiku-5-5']
  assert.ok(haiku.entree >= 50 && haiku.parFonction.corrections.entree >= 50)

  // Le modèle se change dans le back-office, sans redémarrage.
  await regler({ corrections: { modele: 'claude-sonnet-5-5' } })
  requetes.length = 0
  assert.equal((await demander(doc, 'alice@example.com', { text: 'Encore.' })).status, 200)
  assert.equal(requetes[0].model, 'claude-sonnet-5-5')
  const sonnet = (await conso()).jetonsParModele['claude-sonnet-5-5']
  assert.ok(sonnet.parFonction.corrections.appels >= 1)
  await remettre()
})

test('plusieurs paragraphes en une seule demande : une demande, la somme des signes, les réponses dans l’ordre', async () => {
  const doc = await document('lot@example.com')
  requetes.length = 0
  reponse = (corps) => succes(`corrigé : ${corps.messages[0].content.match(/<passage>\n([\s\S]*?)\n<\/passage>/)[1]}`)
  const res = await demander(doc, 'lot@example.com', { textes: ['Premier.', 'Deuxième paragraphe.', 'Troisième.'] })
  assert.equal(res.status, 200)
  const { suggestions } = await res.json()
  assert.equal(suggestions.length, 3)
  assert.match(suggestions[0], /Premier/)
  assert.match(suggestions[2], /Troisième/)
  assert.equal(requetes.length, 3)
  const ligne = await ligneDe('lot@example.com')
  assert.equal(ligne.corrections.demandes, 1, 'une sélection est une demande')
  assert.equal(ligne.corrections.signes, 'Premier.'.length + 'Deuxième paragraphe.'.length + 'Troisième.'.length)
  // Et elle ne prend qu'une place dans l'heure.
  const etat = await (
    await vraiFetch(`${BASE}/api/docs/${doc}/ia`, { headers: { cookie: cookie('lot@example.com') } })
  ).json()
  assert.equal(etat.corrections.heure.utilisees, 1)
  reponse = null
})

test('un échec ne coûte rien en signes : erreur de l’API, réponse coupée — mais les jetons comptent', async () => {
  const doc = await document('echec@example.com')
  reponse = () => ({ status: 500, corps: { error: { message: 'panne' } } })
  assert.equal((await demander(doc, 'echec@example.com', { text: 'Un texte.' })).status, 502)
  let ligne = await ligneDe('echec@example.com')
  assert.equal(ligne.corrections.signes, 0)
  assert.equal(ligne.corrections.demandes, 0)
  assert.equal(ligne.corrections.echecs, 1)

  reponse = () => ({
    corps: {
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'coupé' }],
      usage: { input_tokens: 70, output_tokens: 4096 },
    },
  })
  const coupee = await demander(doc, 'echec@example.com', { text: 'Un texte.' })
  assert.equal(coupee.status, 502)
  assert.match((await coupee.json()).error, /coupée/)
  ligne = await ligneDe('echec@example.com')
  assert.equal(ligne.corrections.signes, 0, 'une réponse coupée ne compte pas')
  assert.equal(ligne.corrections.echecs, 2)
  assert.equal(ligne.corrections.entree, 70, 'mais l’API l’a facturée')
  assert.equal(ligne.corrections.sortie, 4096)
  reponse = null
})

test('la taille d’une demande est contrôlée en signes avant tout envoi — administrateurs compris', async () => {
  await regler({ corrections: { signesParDemande: 100 } })
  try {
    const doc = await document('taille@example.com')
    requetes.length = 0
    const res = await demander(doc, 'taille@example.com', { textes: ['a'.repeat(60), 'b'.repeat(41)] })
    assert.equal(res.status, 413)
    const { error } = await res.json()
    assert.match(error, /101\ssignes/)
    assert.match(error, /100\ssignes par demande/)
    assert.ok(!/page/i.test(error))
    assert.equal(requetes.length, 0)
    assert.equal(
      (await demander(doc, 'taille@example.com', { text: 'a'.repeat(100) })).status,
      200,
      'pile à la limite : accepté'
    )

    const docAdmin = await document('admin@example.com')
    assert.equal((await demander(docAdmin, 'admin@example.com', { text: 'a'.repeat(101) })).status, 413)
  } finally {
    await remettre()
  }
})

test('le plafond mensuel : il reste N signes, la demande suivante qui dépasse est refusée, un autre compte n’est pas touché', async () => {
  await regler({ corrections: { signesParMois: 1000 } })
  try {
    const doc = await document('mensuel@example.com')
    assert.equal((await demander(doc, 'mensuel@example.com', { text: 'a'.repeat(600) })).status, 200)
    requetes.length = 0
    const refus = await demander(doc, 'mensuel@example.com', { text: 'b'.repeat(600) })
    assert.equal(refus.status, 429)
    const { error } = await refus.json()
    assert.match(error, /400\ssignes/)
    assert.match(error, /1er \p{L}+/u)
    assert.equal(requetes.length, 0)
    // Plus court, ça passe ; ensuite il ne reste rien.
    assert.equal((await demander(doc, 'mensuel@example.com', { text: 'c'.repeat(400) })).status, 200)
    const fini = await demander(doc, 'mensuel@example.com', { text: 'd' })
    assert.equal(fini.status, 429)
    assert.match((await fini.json()).error, /limite mensuelle est atteinte/)

    const autre = await document('mensuel-2@example.com')
    assert.equal((await demander(autre, 'mensuel-2@example.com', { text: 'a'.repeat(600) })).status, 200)
    // Margo a son propre compteur : Corrections IA épuisée ne la ferme pas.
    const etat = await (
      await vraiFetch(`${BASE}/api/docs/${doc}/ia`, { headers: { cookie: cookie('mensuel@example.com') } })
    ).json()
    assert.deepEqual(etat.corrections.mois, { utilises: 1000, max: 1000 })
    assert.equal(etat.margo.mois.utilises, 0)
  } finally {
    await remettre()
  }
})

test('les demandes par heure, administrateurs compris ; un refus ne consomme rien', async () => {
  await regler({ corrections: { demandesParHeure: 2 } })
  try {
    const doc = await document('admin@example.com')
    assert.equal((await demander(doc, 'admin@example.com', { text: 'Un.' })).status, 200)
    assert.equal((await demander(doc, 'admin@example.com', { text: 'Deux.' })).status, 200)
    const refus = await demander(doc, 'admin@example.com', { text: 'Trois.' })
    assert.equal(refus.status, 429)
    assert.match((await refus.json()).error, /2 demandes par heure/)
    const ligne = await ligneDe('admin@example.com')
    assert.equal(ligne.corrections.demandes, 2)
  } finally {
    await remettre()
  }
})

test('l’accès est un niveau minimal par fonction : admin, éditeur, correcteur — jamais un lecteur ni un administrateur sans rôle', async () => {
  const doc = await document('niveau@example.com')
  storage.inviteEmail(doc, 'corr@example.com', 'correcteur', 'niveau@example.com')
  storage.inviteEmail(doc, 'lect@example.com', 'lecteur', 'niveau@example.com')
  const statuts = async () => [
    (await demander(doc, 'niveau@example.com', { text: 'x' })).status,
    (await demander(doc, 'corr@example.com', { text: 'x' })).status,
    (await demander(doc, 'lect@example.com', { text: 'x' })).status,
    (await demander(doc, 'admin@example.com', { text: 'x' })).status,
  ]
  try {
    await regler({ corrections: { acces: 'editeur' } })
    assert.deepEqual(await statuts(), [200, 403, 403, 403])
    await regler({ corrections: { acces: 'correcteur' } })
    assert.deepEqual(await statuts(), [200, 200, 403, 403])
    await regler({ corrections: { acces: 'admin' } })
    assert.deepEqual(await statuts(), [403, 403, 403, 403], 'l’administrateur sans rôle sur le document n’y écrit pas')
    // Les deux fonctions se règlent séparément.
    await regler({ corrections: { acces: 'editeur' }, margo: { acces: 'correcteur' } })
    const etat = await (
      await vraiFetch(`${BASE}/api/docs/${doc}/ia`, { headers: { cookie: cookie('corr@example.com') } })
    ).json()
    assert.equal(etat.corrections.autorise, false)
    assert.equal(etat.margo.autorise, true)
  } finally {
    await remettre()
    await regler({ margo: { acces: 'editeur' } })
  }
})

test('entrées invalides : refusées avant tout appel payant', async () => {
  const doc = await document('invalide@example.com')
  requetes.length = 0
  for (const corps of [{}, { text: '   ' }, { textes: [] }, { textes: ['ok', ''] }, { textes: ['ok', 3] }]) {
    const res = await demander(doc, 'invalide@example.com', corps)
    assert.ok([400, 413].includes(res.status), JSON.stringify(corps).slice(0, 50))
  }
  assert.equal(requetes.length, 0)
})

test.after(async () => {
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})

// ---------------------------------------------------------------- l'unité de compte : le clic

const vue = async () =>
  (await vraiFetch(`${BASE}/api/admin/overview`, { headers: { cookie: cookie('admin@example.com') } })).json()
const boutons = async () => (await conso()).boutons

test('un clic sur quatre paragraphes : une demande, une place dans l’heure, un événement du journal — et la somme des signes', async () => {
  const doc = await document('clic@example.com')
  const avant = (await vue()).flux.ia.appels30j
  reponse = null
  const res = await demander(doc, 'clic@example.com', {
    textes: ['Un.', 'Deux.', 'Trois.', 'Quatre.'],
    action: 'corriger',
  })
  assert.equal(res.status, 200)
  const ligne = await ligneDe('clic@example.com')
  assert.equal(ligne.corrections.demandes, 1, 'les quotas : un clic = une demande')
  assert.equal(ligne.corrections.passages, 4, 'les quatre paragraphes sont notés à part')
  assert.equal(ligne.corrections.signes, 'Un.Deux.Trois.Quatre.'.length, 'les signes : la somme des paragraphes')
  assert.equal(ligne.corrections.entree, 4 * 50, 'les jetons des quatre appels s’additionnent')
  const etat = await (
    await vraiFetch(`${BASE}/api/docs/${doc}/ia`, { headers: { cookie: cookie('clic@example.com') } })
  ).json()
  assert.equal(etat.corrections.heure.utilisees, 1, 'une seule place dans l’heure')
  const apres = (await vue()).flux.ia
  assert.equal(apres.appels30j - avant, 1, 'le journal du back-office : un événement par clic, pas par paragraphe')
})

test('le cumul des clics par bouton : un clic = un point, quel que soit le nombre de paragraphes ; une clé inconnue va sous « autre »', async () => {
  const doc = await document('boutons@example.com')
  const avant = (await boutons()).cumul
  const n = (cle) => avant[cle] || 0
  reponse = null
  await demander(doc, 'boutons@example.com', { text: 'Un texte.', action: 'raccourcir' })
  await demander(doc, 'boutons@example.com', { textes: ['A.', 'B.', 'C.'], action: 'raccourcir' })
  await demander(doc, 'boutons@example.com', { text: 'Un texte.', action: 'direct' })
  await demander(doc, 'boutons@example.com', { text: 'Un texte.', action: 'inventé' })
  await demander(doc, 'boutons@example.com', { text: 'Un texte.' })
  const apres = await boutons()
  assert.equal(apres.cumul.raccourcir - n('raccourcir'), 2, 'deux clics, dont un sur trois paragraphes')
  assert.equal(apres.cumul.direct - n('direct'), 1)
  assert.equal(apres.cumul.autre - n('autre'), 2, 'clé inconnue ou absente')
  assert.ok(!JSON.stringify(apres).includes('boutons@example.com'), 'anonyme : aucune adresse dans le cumul')
})

test('un clic refusé par une limite compte comme clic (l’intention), pas comme demande réussie', async () => {
  const doc = await document('refus@example.com')
  const avant = (await boutons()).cumul.clarifier || 0
  await regler({ corrections: { signesParDemande: 100 } })
  const res = await demander(doc, 'refus@example.com', { text: 'x'.repeat(101), action: 'clarifier' })
  assert.equal(res.status, 413)
  assert.equal(((await boutons()).cumul.clarifier || 0) - avant, 1)
  const ligne = await ligneDe('refus@example.com')
  assert.ok(!ligne || ligne.corrections.demandes === 0)
  await remettre()
})

test('Corrections IA sur Mistral Large 4 : sans clé, 501 qui nomme MISTRAL_API_KEY ; avec clé, point d’accès européen, jetons et coût comptés', async () => {
  const doc = await document('mistral@example.com')
  delete process.env.MISTRAL_API_KEY
  await regler({ corrections: { modele: 'mistral-large-4-0' } })
  try {
    requetes.length = 0
    requetesMistral.length = 0
    const sansCle = await demander(doc, 'mistral@example.com', { text: 'Ils mange des pomme.' })
    assert.equal(sansCle.status, 501)
    assert.match((await sansCle.json()).error, /MISTRAL_API_KEY/)
    assert.equal(requetes.length + requetesMistral.length, 0)

    process.env.MISTRAL_API_KEY = 'cle-mistral-factice'
    const res = await demander(doc, 'mistral@example.com', { text: 'Ils mange des pomme.' })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).suggestion, 'Texte corrigé par Mistral.')
    assert.equal(requetes.length, 0, 'rien chez Anthropic')
    assert.equal(requetesMistral.length, 1)
    assert.equal(requetesMistral[0].url, 'https://api.eu.mistral.ai/v1/chat/completions')
    assert.equal(requetesMistral[0].corps.model, 'mistral-large-4-0')
    assert.equal(requetesMistral[0].corps.reasoning_effort, 'none')

    const ligne = await ligneDe('mistral@example.com')
    assert.equal(ligne.corrections.demandes, 1)
    assert.equal(ligne.corrections.signes, 20)
    assert.equal(ligne.corrections.entree, 80)
    assert.equal(ligne.corrections.sortie, 6)
    assert.ok(ligne.corrections.usd > 0)
    assert.ok((await conso()).jetonsParModele['mistral-large-4-0'].entree >= 80)
  } finally {
    delete process.env.MISTRAL_API_KEY
    await remettre()
  }
})

test('plus de butée cachée : 250 paragraphes, un corps de plus de 20 Ko, un paragraphe de 9 000 signes — seule la limite en signes compte', async () => {
  const doc = await document('gros@example.com')
  await regler({ corrections: { signesParDemande: 100_000 } })
  try {
    // 250 paragraphes de 100 signes : 25 000 signes, un corps JSON de plus de 25 Ko (l'ancienne butée : 20 Ko, 200 paragraphes).
    const textes = Array.from({ length: 250 }, (_, i) => `Paragraphe ${i} ${'mot '.repeat(23)}`.slice(0, 100))
    let actifs = 0
    let maxActifs = 0
    requetes.length = 0
    reponse = async (corps) => {
      actifs++
      maxActifs = Math.max(maxActifs, actifs)
      await new Promise((r) => setTimeout(r, 3))
      actifs--
      const m = /<passage>\n([\s\S]*)\n<\/passage>/.exec(corps.messages[0].content)
      return succes(`${m[1]} (relu)`)
    }
    const res = await demander(doc, 'gros@example.com', { textes })
    assert.equal(res.status, 200)
    const { suggestions } = await res.json()
    assert.equal(suggestions.length, 250)
    assert.equal(requetes.length, 250)
    assert.deepEqual(
      suggestions.slice(0, 2),
      textes.slice(0, 2).map((t) => `${t} (relu)`),
      'l’ordre est gardé'
    )
    assert.ok(maxActifs <= 8, `au plus 8 appels en même temps (vu : ${maxActifs})`)
    const ligne = await ligneDe('gros@example.com')
    assert.equal(ligne.corrections.demandes, 1)
    assert.equal(ligne.corrections.passages, 250)
    assert.equal(ligne.corrections.signes, 25_000)

    // Un seul paragraphe de 9 000 signes passe aussi.
    reponse = null
    const long = await demander(doc, 'gros@example.com', { text: 'a'.repeat(9000) })
    assert.equal(long.status, 200)

    // Et la limite en signes répond toujours, avec son message.
    const trop = await demander(doc, 'gros@example.com', { text: 'a'.repeat(100_001) })
    assert.equal(trop.status, 413)
    assert.match((await trop.json()).error, /limite est de 100\s000\s+signes par demande/)
  } finally {
    reponse = null
    await remettre()
  }
})

test('garde-fous du back-office : listés avec leur documentation, réglables par un administrateur seulement, appliqués à la demande suivante', async () => {
  const doc = await document('gf@example.com')
  await regler({ corrections: { signesParDemande: 100_000 } })
  try {
    const etat = await conso()
    assert.equal(etat.gardeFous.definitions.length, 9, 'neuf garde-fous, tous visibles (22/10/2026)')
    assert.ok(etat.gardeFous.definitions.every((g) => g.quoi && g.unite && g.nom))
    assert.equal(etat.gardeFous.valeurs.correctionsEnParallele, 8)
    assert.equal(etat.maniereMax, undefined, 'la manière de répondre n’a plus de longueur réglée')

    assert.equal((await regler({ gardeFous: { correctionsEnParallele: 2 } }, 'simple@example.com')).status, 403)
    const refus = await regler({ gardeFous: { correctionsEnParallele: 0 } })
    assert.equal(refus.status, 400)
    assert.match((await refus.json()).error, /Paragraphes envoyés en même temps/)
    assert.equal((await conso()).gardeFous.valeurs.correctionsEnParallele, 8, 'un refus ne change rien')

    assert.equal((await regler({ gardeFous: { correctionsEnParallele: 2 } })).status, 200)
    assert.equal((await conso()).gardeFous.valeurs.correctionsEnParallele, 2)
    let actifs = 0
    let maxActifs = 0
    reponse = async (corps) => {
      actifs++
      maxActifs = Math.max(maxActifs, actifs)
      await new Promise((r) => setTimeout(r, 5))
      actifs--
      return succes(/<passage>\n([\s\S]*)\n<\/passage>/.exec(corps.messages[0].content)[1])
    }
    const textes = Array.from({ length: 12 }, (_, i) => `Paragraphe numéro ${i}`)
    assert.equal((await demander(doc, 'gf@example.com', { textes })).status, 200)
    assert.ok(maxActifs <= 2, `au plus 2 appels en même temps (vu : ${maxActifs})`)
  } finally {
    reponse = null
    await regler({ gardeFous: { correctionsEnParallele: null } })
    await remettre()
  }
})

test('la manière de répondre n’a plus de longueur réglée : un long texte est accepté, relu tel quel', async () => {
  try {
    const longue = 'Sois brève. '.repeat(2_000) // 24 000 signes
    assert.equal((await regler({ margo: { maniere: longue } })).status, 200)
    assert.equal((await conso()).reglages.margo.maniere.length, longue.trim().length)
  } finally {
    await regler({ margo: { maniere: 'Tu vouvoies toujours la personne.' } })
  }
})
