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
    ['claude-haiku-5-5', 'claude-sonnet-5-5'],
    'Haiku et Sonnet seulement'
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
  for (const corps of [
    {},
    { text: '   ' },
    { textes: [] },
    { textes: ['ok', ''] },
    { textes: ['ok', 3] },
    { text: 'ok', instruction: 'x'.repeat(2001) },
  ]) {
    const res = await demander(doc, 'invalide@example.com', corps)
    assert.ok([400, 413].includes(res.status), JSON.stringify(corps).slice(0, 50))
  }
  assert.equal(requetes.length, 0)
})

test.after(async () => {
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
