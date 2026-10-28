// Les modèles de mise en page (01/10/2026, server/modeles.js, routes
// /api/modeles et /api/docs/:id/modele). Le vrai serveur, de vraies sessions.
//
// Ce qui est vérifié, par ordre d'importance : qui voit et qui modifie quoi
// (un modèle personnel n'existe pas pour les autres ; un livré ne se
// modifie pas ; ceux de l'instance sont aux administrateurs), qu'un modèle
// utilisé ne se supprime pas, que le modèle est une propriété du document
// que ses collaborateurs partagent, que changer de modèle abandonne les
// écarts propres sauf demande contraire, et que rien d'invalide n'entre
// dans un modèle.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18806
process.env.PORT = String(PORT)
const DATA = mkdtempSync(join(tmpdir(), 'collabtext-test-modeles-'))
process.env.DATA_DIR = DATA
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { fusionner, styleParDefaut, dimensionsPage } = await import('../../shared/style.js')
const { MODELES_LIVRES, ID_DEFAUT, CATEGORIE_AMEND, comparerModeles, libelleModele } =
  await import('../../shared/modeles.js')
await attendre()

function attendre() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    ;(function essai() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => {
          if (Date.now() > deadline) reject(err)
          else setTimeout(essai, 50)
        })
    })()
  })
}

const cookie = (email) => sessionCookieHeader(email, { secure: false }).split(';')[0]
const ADMIN = cookie('admin@example.com')
const ALICE = cookie('alice@example.com')
const BOB = cookie('bob@example.com')

async function appeler(methode, chemin, c, corps) {
  const res = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, json }
}

const creerDoc = async (c) => (await appeler('POST', '/api/docs', c, { title: 'Doc' })).json
const ids = (liste) => liste.map((m) => m.id)

// Il n'y a plus qu'un modèle livré (« Texte brut »). Pour les scénarios qui
// demandent des modèles **visibles de tous** et nettement différents (A5
// justifié, sans empattement, empattement), l'administrateur en crée trois
// pour l'instance : c'est aussi ce que fera un administrateur réel.
const M = {}
for (const [cle, nom, style] of [
  [
    'livre',
    'Livre',
    {
      page: { size: 'A5' },
      blocs: { body: { font: 'libre-caslon-text', size: 10.5, align: 'justify' }, h1: { size: 24 } },
    },
  ],
  ['note', 'Note', { page: { size: 'A4' }, blocs: { body: { font: 'arial', size: 10.5 }, h1: { size: 20 } } }],
  ['manuscrit', 'Manuscrit', { page: { size: 'A4' }, blocs: { body: { font: 'times', size: 12 }, h1: { size: 16 } } }],
]) {
  const m = (
    await appeler('POST', '/api/modeles', ADMIN, { nom, categorie: 'Test', depuis: 'texte-brut', portee: 'instance' })
  ).json
  const ok = await appeler('PUT', `/api/modeles/${m.id}`, ADMIN, { style: fusionner(m.style, style) })
  assert.equal(ok.status, 200)
  M[cle] = m.id
}

test('la liste : Par défaut, les livrés, puis les siens — et personne d’autre ne voit les siens', async () => {
  const sans = await appeler('GET', '/api/modeles')
  assert.equal(sans.status, 401)

  const cree = await appeler('POST', '/api/modeles', ALICE, {
    nom: 'Mon livre',
    categorie: 'Test',
    depuis: 'texte-brut',
  })
  assert.equal(cree.status, 200)
  assert.equal(cree.json.portee, 'perso')
  assert.match(cree.json.id, /^m-[0-9a-f]{8}$/)

  const a = (await appeler('GET', '/api/modeles', ALICE)).json
  // « Par défaut » d'abord, puis l'ordre des catégories ; tous les livrés y sont.
  assert.equal(a.modeles[0].id, ID_DEFAUT)
  assert.deepEqual(ids([...a.modeles].sort(comparerModeles)), ids(a.modeles), 'la liste est rangée')
  for (const l of MODELES_LIVRES) assert.ok(ids(a.modeles).includes(l.id), l.id)
  assert.ok(ids(a.modeles).includes(cree.json.id))
  assert.equal(a.admin, false)

  const b = (await appeler('GET', '/api/modeles', BOB)).json
  assert.ok(!ids(b.modeles).includes(cree.json.id), 'le modèle d’Alice n’existe pas pour Bob')
  // Ni par son identifiant : 404, pas 403 — on ne confirme même pas qu'il existe.
  assert.equal((await appeler('GET', `/api/modeles/${cree.json.id}`, BOB)).status, 404)
  // Pas même pour un administrateur : ce sont des préférences, pas des données d'exploitation.
  assert.equal((await appeler('GET', `/api/modeles/${cree.json.id}`, ADMIN)).status, 404)
})

test('chaque modèle de la liste porte un style complet, et le format est lisible', async () => {
  const { modeles } = (await appeler('GET', '/api/modeles', ALICE)).json
  // Seul « Texte brut » reste dans le code ; les autres livrés sont copiés parmi ceux de l'instance.
  assert.deepEqual(ids(modeles.filter((m) => m.portee === 'livre')), ['texte-brut'])
  for (const l of MODELES_LIVRES.filter((l) => !l.fixe)) {
    const copie = modeles.find((m) => m.id === l.id)
    assert.equal(copie.portee, 'instance', l.id)
    assert.equal(copie.origine, l.id)
  }
  const brut = modeles.find((m) => m.id === 'texte-brut')
  assert.equal(brut.style.page.size, 'A4')
  assert.deepEqual(dimensionsPage(brut.style.page), [210, 297])
  assert.ok(brut.style.blocs.body.font)
  assert.equal(brut.modifiable, false)
  assert.equal(brut.supprimable, false)
  assert.ok(brut.description)
  const livre = modeles.find((m) => m.id === M.livre)
  assert.equal(livre.style.page.size, 'A5')
  assert.deepEqual(dimensionsPage(livre.style.page), [148, 210])
  for (const ancien of ['manuscrit', 'livre', 'note']) {
    assert.ok(!ids(modeles).includes(ancien), `« ${ancien} » n’est plus livré`)
  }
})

test('« Texte brut » ne se modifie ni ne se supprime', async () => {
  const modif = await appeler('PUT', '/api/modeles/texte-brut', ADMIN, { nom: 'Autre' })
  assert.equal(modif.status, 403, 'même un administrateur')
  assert.equal((await appeler('DELETE', '/api/modeles/texte-brut', ADMIN)).status, 403)
  assert.equal((await appeler('PUT', '/api/modeles/texte-brut', ADMIN, { style: styleParDefaut() })).status, 403)
})

test('créer : toujours à partir d’un modèle, jamais d’une page blanche', async () => {
  assert.equal((await appeler('POST', '/api/modeles', ALICE, { nom: 'Vide' })).status, 404)
  assert.equal(
    (await appeler('POST', '/api/modeles', ALICE, { nom: 'X', categorie: 'Test', depuis: 'inexistant' })).status,
    404
  )
  assert.equal(
    (await appeler('POST', '/api/modeles', ALICE, { nom: '   ', categorie: 'Test', depuis: 'texte-brut' })).status,
    400
  )
  assert.equal(
    (await appeler('POST', '/api/modeles', ALICE, { nom: 'a'.repeat(61), categorie: 'Test', depuis: 'texte-brut' }))
      .status,
    400
  )
  // Partir du modèle personnel d'un autre : impossible.
  const alice = (
    await appeler('POST', '/api/modeles', ALICE, { nom: 'Privé', categorie: 'Test', depuis: 'texte-brut' })
  ).json
  assert.equal(
    (await appeler('POST', '/api/modeles', BOB, { nom: 'Copie', categorie: 'Test', depuis: alice.id })).status,
    404
  )
  // La copie reprend le style de la source, sans l'altérer.
  const copie = (
    await appeler('POST', '/api/modeles', ALICE, {
      nom: 'Copie de Texte brut',
      categorie: 'Test',
      depuis: 'texte-brut',
    })
  ).json
  const source = (await appeler('GET', '/api/modeles/texte-brut', ALICE)).json
  assert.deepEqual(copie.style, source.style)
})

test('le nom est nettoyé : espaces compactés, caractères de contrôle retirés', async () => {
  const m = (
    await appeler('POST', '/api/modeles', ALICE, {
      nom: '  Mon\u0000   thème\n  ',
      categorie: 'Test',
      depuis: 'texte-brut',
    })
  ).json
  assert.equal(m.nom, 'Mon thème')
})

test('modifier son modèle : le renommer et changer sa mise en page, les autres ne le peuvent pas', async () => {
  const m = (await appeler('POST', '/api/modeles', ALICE, { nom: 'À régler', categorie: 'Test', depuis: 'texte-brut' }))
    .json
  const style = fusionner(m.style, { page: { size: 'A5', orientation: 'paysage' }, blocs: { body: { size: 13 } } })
  const ok = await appeler('PUT', `/api/modeles/${m.id}`, ALICE, { nom: 'Réglé', style })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.nom, 'Réglé')
  assert.equal(ok.json.style.page.orientation, 'paysage')
  assert.equal(ok.json.style.blocs.body.size, 13)
  assert.deepEqual(dimensionsPage(ok.json.style.page), [210, 148])
  // Bob ne le voit pas : 404 ; un administrateur non plus.
  assert.equal((await appeler('PUT', `/api/modeles/${m.id}`, BOB, { nom: 'Volé' })).status, 404)
  assert.equal((await appeler('DELETE', `/api/modeles/${m.id}`, ADMIN)).status, 404)
  // Sur disque : le CSS du modèle d'un côté, ce que le CSS ne dit pas de l'autre.
  const meta = JSON.parse(readFileSync(join(DATA, 'modeles', `${m.id}.json`), 'utf8'))
  assert.equal(meta.style, undefined, 'la mise en page est dans le .css, plus dans le .json')
  assert.equal(meta.proprietaire, 'alice@example.com')
  assert.equal(meta.nom, 'Réglé')
  const css = readFileSync(join(DATA, 'modeles', `${m.id}.css`), 'utf8')
  assert.match(css, /size: A5 landscape;/)
  assert.match(css, /\np \{\n {2}font-family: "DejaVu Sans", sans-serif;\n {2}font-size: 13pt;/)
})

test('rien d’invalide n’entre : valeurs ramenées dans les listes et les bornes', async () => {
  const m = (await appeler('POST', '/api/modeles', ALICE, { nom: 'Piège', categorie: 'Test', depuis: 'texte-brut' }))
    .json
  const piege = fusionner(m.style)
  piege.page.size = 'A0<script>'
  piege.page.marginTop = 'abc'
  piege.page.largeur = 99999
  piege.page.entete.gauche = { type: 'texte', texte: 'x'.repeat(5000) }
  piege.blocs.body.font = 'Comic Sans; } body { display:none'
  piege.blocs.body.size = -4
  const r = await appeler('PUT', `/api/modeles/${m.id}`, ALICE, { style: piege })
  assert.equal(r.status, 200)
  const s = r.json.style
  assert.ok(['A4', 'A5', 'personnalise', 'Letter'].includes(s.page.size))
  assert.equal(s.page.marginTop, 25, 'une marge illisible reprend sa valeur par défaut')
  assert.ok(s.page.largeur <= 450)
  assert.ok(s.page.entete.gauche.texte.length <= 200)
  assert.equal(s.blocs.body.font, 'system')
  assert.ok(s.blocs.body.size >= 5)
  const brut = readFileSync(join(DATA, 'modeles', `${m.id}.css`), 'utf8')
  assert.ok(!brut.includes('script') && !brut.includes('display:none'))
  assert.equal((await appeler('PUT', `/api/modeles/${m.id}`, ALICE, { style: 'oups' })).status, 400)
})

test('les modèles de l’instance sont aux administrateurs, visibles de tous', async () => {
  assert.equal(
    (
      await appeler('POST', '/api/modeles', ALICE, {
        nom: 'Maison',
        categorie: 'Test',
        depuis: 'texte-brut',
        portee: 'instance',
      })
    ).status,
    403
  )
  const maison = await appeler('POST', '/api/modeles', ADMIN, {
    nom: 'Maison',
    categorie: 'Test',
    depuis: 'texte-brut',
    portee: 'instance',
  })
  assert.equal(maison.status, 200)
  assert.equal(maison.json.portee, 'instance')
  assert.equal(maison.json.modifiable, true)

  const vuParBob = (await appeler('GET', '/api/modeles', BOB)).json.modeles.find((m) => m.id === maison.json.id)
  assert.ok(vuParBob, 'Bob le voit')
  assert.equal(vuParBob.modifiable, false)
  assert.equal(vuParBob.supprimable, false)
  assert.equal((await appeler('PUT', `/api/modeles/${maison.json.id}`, BOB, { nom: 'Mien' })).status, 403)
  assert.equal((await appeler('DELETE', `/api/modeles/${maison.json.id}`, BOB)).status, 403)
  // Bob peut en faire une copie personnelle.
  assert.equal(
    (await appeler('POST', '/api/modeles', BOB, { nom: 'Ma maison', categorie: 'Test', depuis: maison.json.id }))
      .status,
    200
  )
  // L'administrateur peut aussi avoir ses modèles personnels, que les autres ne voient pas.
  const perso = (
    await appeler('POST', '/api/modeles', ADMIN, { nom: 'Perso admin', categorie: 'Test', depuis: 'texte-brut' })
  ).json
  assert.equal(perso.portee, 'perso')
  assert.ok(!ids((await appeler('GET', '/api/modeles', ALICE)).json.modeles).includes(perso.id))
})

test('« Par défaut » : l’administrateur règle la mise en page, mais ni le nom ni la suppression', async () => {
  const defaut = (await appeler('GET', '/api/modeles/defaut', ALICE)).json
  assert.equal(defaut.nom, 'Par défaut')
  assert.equal(defaut.modifiable, false)
  assert.equal((await appeler('PUT', '/api/modeles/defaut', ALICE, { style: styleParDefaut() })).status, 403)

  const nouveau = fusionner({ blocs: { h1: { size: 31 } } })
  const ok = await appeler('PUT', '/api/modeles/defaut', ADMIN, { style: nouveau })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.style.blocs.h1.size, 31)
  // C'est bien le style de l'instance : l'ancienne route le dit aussi.
  assert.equal((await appeler('GET', '/api/style', ALICE)).json.blocs.h1.size, 31)

  assert.equal((await appeler('PUT', '/api/modeles/defaut', ADMIN, { nom: 'Autre' })).status, 400)
  assert.equal((await appeler('DELETE', '/api/modeles/defaut', ADMIN)).status, 403)
  await appeler('PUT', '/api/modeles/defaut', ADMIN, { style: styleParDefaut() })
})

test('un document sans choix suit « Par défaut » ; en choisir un change ce que les exports reçoivent', async () => {
  const doc = await creerDoc(ALICE)
  const avant = (await appeler('GET', `/api/docs/${doc.id}/style`, ALICE)).json
  assert.equal(avant.modele.id, ID_DEFAUT)
  assert.equal(avant.ecarts, 0)
  assert.equal(avant.style.page.size, 'A4')

  const r = await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.livre })
  assert.equal(r.status, 200)
  assert.equal(r.json.modele.id, M.livre)
  assert.equal(r.json.style.page.size, 'A5')
  assert.equal(r.json.style.blocs.body.align, 'justify')
  assert.equal((await appeler('GET', `/api/docs/${doc.id}/style`, ALICE)).json.style.page.size, 'A5')
  // La liste des documents le porte aussi (c'est une propriété du document).
  const liste = (await appeler('GET', '/api/docs', ALICE)).json.docs
  assert.equal(liste.find((d) => d.id === doc.id).modele, M.livre)
})

test('le modèle est celui du document : un collaborateur éditeur le voit, un correcteur le lit sans le changer', async () => {
  const doc = await creerDoc(ALICE)
  const storage = new Storage(DATA)
  storage.inviteEmail(doc.id, 'bob@example.com', 'editeur', 'alice@example.com')
  storage.acceptInvitation(doc.id, 'bob@example.com')
  storage.inviteEmail(doc.id, 'corr@example.com', 'correcteur', 'alice@example.com')
  storage.acceptInvitation(doc.id, 'corr@example.com')

  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.manuscrit })
  assert.equal((await appeler('GET', `/api/docs/${doc.id}/style`, BOB)).json.modele.id, M.manuscrit)
  const corr = cookie('corr@example.com')
  assert.equal((await appeler('GET', `/api/docs/${doc.id}/style`, corr)).json.modele.id, M.manuscrit)
  assert.equal((await appeler('PUT', `/api/docs/${doc.id}/modele`, corr, { modeleId: M.note })).status, 403)
  // Sans accès : rien.
  assert.equal(
    (await appeler('PUT', `/api/docs/${doc.id}/modele`, cookie('inconnu@example.com'), { modeleId: M.note })).status,
    403
  )
  assert.equal((await appeler('PUT', `/api/docs/${doc.id}/modele`, undefined, { modeleId: M.note })).status, 403)
})

test('on ne choisit qu’un modèle qu’on voit ; un document peut porter celui d’un autre', async () => {
  const doc = await creerDoc(ALICE)
  const storage = new Storage(DATA)
  storage.inviteEmail(doc.id, 'bob@example.com', 'editeur', 'alice@example.com')
  storage.acceptInvitation(doc.id, 'bob@example.com')

  const alice = (await appeler('POST', '/api/modeles', ALICE, { nom: 'Le mien', categorie: 'Test', depuis: M.livre }))
    .json
  const bob = (
    await appeler('POST', '/api/modeles', BOB, { nom: 'Celui de Bob', categorie: 'Test', depuis: 'texte-brut' })
  ).json
  // Bob ne peut pas poser le modèle d'Alice…
  assert.equal((await appeler('PUT', `/api/docs/${doc.id}/modele`, BOB, { modeleId: alice.id })).status, 404)
  // …mais Alice pose le sien, et Bob, éditeur, voit un document qui l'utilise (il en lit le nom).
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: alice.id })
  const vuParBob = (await appeler('GET', `/api/docs/${doc.id}/style`, BOB)).json
  assert.equal(vuParBob.modele.id, alice.id)
  assert.equal(vuParBob.modele.nom, 'Le mien')
  assert.equal(vuParBob.style.page.size, 'A5', 'le document se résout pour tous, quel que soit celui qui regarde')
  // Re-poser le même modèle (que Bob ne voit pas) ne change rien et n'échoue pas.
  assert.equal((await appeler('PUT', `/api/docs/${doc.id}/modele`, BOB, { modeleId: alice.id })).status, 200)
  // Bob le remplace par le sien.
  assert.equal((await appeler('PUT', `/api/docs/${doc.id}/modele`, BOB, { modeleId: bob.id })).status, 200)
  assert.equal((await appeler('PUT', `/api/docs/${doc.id}/modele`, BOB, { modeleId: 'inexistant' })).status, 404)
})

test('changer de modèle abandonne les écarts propres, sauf demande contraire', async () => {
  const doc = await creerDoc(ALICE)
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.livre })
  const livre = (await appeler('GET', `/api/modeles/${M.livre}`, ALICE)).json.style
  // Ce que le formulaire envoie : la feuille effective, avec le changement de l'éditeur.
  const ecart = fusionner(livre, { page: { size: 'A4' }, blocs: { body: { size: 14 } } })
  const apres = (await appeler('PUT', `/api/docs/${doc.id}/style`, ALICE, ecart)).json
  assert.equal(apres.propre, true)
  assert.equal(apres.ecarts, 2, 'deux réglages propres, pas la feuille entière')
  assert.equal(apres.style.page.size, 'A4')
  assert.equal(apres.style.blocs.body.size, 14)
  assert.equal(apres.style.blocs.body.align, 'justify', 'le reste vient du modèle')
  const brut = JSON.parse(readFileSync(join(DATA, `${doc.id}.style.json`), 'utf8'))
  assert.deepEqual(brut, { version: brut.version, page: { size: 'A4' }, blocs: { body: { size: 14 } } })

  const n = (await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.note })).json
  assert.equal(n.propre, false)
  assert.equal(n.ecarts, 0)
  assert.equal(n.style.blocs.body.size, 10.5, 'les écarts sont partis')

  // Avec garderEcarts, ils restent.
  const note = (await appeler('GET', `/api/modeles/${M.note}`, ALICE)).json.style
  await appeler('PUT', `/api/docs/${doc.id}/style`, ALICE, fusionner(note, { blocs: { body: { size: 14 } } }))
  const garde = (
    await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.manuscrit, garderEcarts: true })
  ).json
  assert.equal(garde.propre, true)
  assert.equal(garde.style.blocs.body.size, 14)
  assert.equal(garde.style.blocs.body.font, 'times')
})

test('un document qui a un modèle suit ses changements pour tout ce qu’il n’a pas réglé lui-même', async () => {
  const doc = await creerDoc(ALICE)
  const m = (await appeler('POST', '/api/modeles', ALICE, { nom: 'Vivant', categorie: 'Test', depuis: 'texte-brut' }))
    .json
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: m.id })
  await appeler('PUT', `/api/docs/${doc.id}/style`, ALICE, fusionner(m.style, { blocs: { h1: { size: 33 } } }))

  // On modifie le modèle (police du corps) : le document le suit, sauf pour son propre titre.
  await appeler('PUT', `/api/modeles/${m.id}`, ALICE, {
    style: fusionner(m.style, { blocs: { body: { font: 'serif' }, h1: { size: 10 } } }),
  })
  const r = (await appeler('GET', `/api/docs/${doc.id}/style`, ALICE)).json
  assert.equal(r.style.blocs.body.font, 'serif', 'suit le modèle')
  assert.equal(r.style.blocs.h1.size, 33, 'garde son propre réglage')
  assert.equal(r.ecarts, 1)
})

test('revenir au modèle efface les écarts, et le décompte les dit', async () => {
  const doc = await creerDoc(ALICE)
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.note })
  const note = (await appeler('GET', `/api/modeles/${M.note}`, ALICE)).json.style
  const e = (
    await appeler(
      'PUT',
      `/api/docs/${doc.id}/style`,
      ALICE,
      fusionner(note, { blocs: { h1: { size: 30, align: 'center' } } })
    )
  ).json
  assert.equal(e.ecarts, 2)
  const r = (await appeler('DELETE', `/api/docs/${doc.id}/style`, ALICE)).json
  assert.equal(r.ecarts, 0)
  assert.equal(r.propre, false)
  assert.equal(r.modele.id, M.note)
  assert.equal(r.style.blocs.h1.size, 20)
})

test('« Par défaut » reste le repli : un document dont le modèle a disparu retombe dessus', async () => {
  const doc = await creerDoc(ALICE)
  const m = (await appeler('POST', '/api/modeles', ALICE, { nom: 'Éphémère', categorie: 'Test', depuis: 'texte-brut' }))
    .json
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: m.id })
  // Le fichier disparaît à la main — et le document continue de se résoudre.
  rmSync(join(DATA, 'modeles', `${m.id}.json`))
  const r = (await appeler('GET', `/api/docs/${doc.id}/style`, ALICE)).json
  assert.equal(r.modele.id, ID_DEFAUT)
  assert.equal(r.style.page.size, 'A4')
})

test('un modèle utilisé ne se supprime pas ; libre, il se supprime', async () => {
  const doc = await creerDoc(ALICE)
  const m = (await appeler('POST', '/api/modeles', ALICE, { nom: 'À jeter', categorie: 'Test', depuis: 'texte-brut' }))
    .json
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: m.id })

  const liste = (await appeler('GET', '/api/modeles', ALICE)).json.modeles.find((x) => x.id === m.id)
  assert.equal(liste.utilisePar, 1)

  const refus = await appeler('DELETE', `/api/modeles/${m.id}`, ALICE)
  assert.equal(refus.status, 409)
  assert.equal(refus.json.utilisePar, 1)
  assert.ok(existsSync(join(DATA, 'modeles', `${m.id}.json`)))

  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.note })
  assert.equal((await appeler('DELETE', `/api/modeles/${m.id}`, ALICE)).status, 200)
  assert.ok(!existsSync(join(DATA, 'modeles', `${m.id}.json`)))
  assert.equal((await appeler('GET', `/api/modeles/${m.id}`, ALICE)).status, 404)
})

test('« Par défaut » compte les documents qui n’ont jamais choisi', async () => {
  const n = async () =>
    (await appeler('GET', '/api/modeles', ALICE)).json.modeles.find((m) => m.id === ID_DEFAUT).utilisePar
  const avant = await n()
  const doc = await creerDoc(ALICE)
  assert.equal(await n(), avant + 1)
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.note })
  assert.equal(await n(), avant, 'il est parti sur « Note »')
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: ID_DEFAUT })
  assert.equal(await n(), avant + 1, 'et le revoilà sur « Par défaut »')
})

test('les écarts d’un document sont comptés par rapport à son modèle, pas à l’instance', async () => {
  const doc = await creerDoc(ALICE)
  // Choisir « Livre » (A5, justifié) puis enregistrer une feuille identique à Livre : zéro écart.
  await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: M.livre })
  const livre = (await appeler('GET', `/api/modeles/${M.livre}`, ALICE)).json.style
  const e = (await appeler('PUT', `/api/docs/${doc.id}/style`, ALICE, livre)).json
  assert.equal(e.ecarts, 0)
})

test('catégories : obligatoire, « catégorie - nom », rangés par catégorie', async () => {
  const creer = (c, categorie, nom, extra = {}) =>
    appeler('POST', '/api/modeles', c, { nom, categorie, depuis: 'texte-brut', ...extra })
  const bod = (await creer(ADMIN, '  BOD ', 'Livre poche', { portee: 'instance' })).json
  assert.equal(bod.categorie, 'BOD')
  assert.equal(libelleModele(bod), 'BOD - Livre poche')
  const aube = (await creer(ADMIN, 'Aube', 'Petit format', { portee: 'instance' })).json
  const ailleurs = (await creer(ALICE, 'dixit', 'Rapport A4 paysage')).json
  assert.equal(ailleurs.categorie, 'dixit')

  // Obligatoire : absente, vide ou blanche, c'est un refus ; pas d'héritage de la source.
  for (const categorie of [undefined, '', '   ', null]) {
    const r = await creer(ALICE, categorie, 'Refusé')
    assert.equal(r.status, 400, JSON.stringify(categorie))
    assert.match(r.json.error, /obligatoire/)
  }
  // Invalide : trop longue, ou pas un texte.
  for (const categorie of ['x'.repeat(41), 12, { a: 1 }]) {
    assert.equal((await creer(ALICE, categorie, 'Refusé')).status, 400, JSON.stringify(categorie))
  }
  // « amend.ink » est réservée aux modèles qui viennent avec l'application, sans égard à la casse.
  for (const categorie of ['amend.ink', 'AMEND.INK', ' Amend.ink ']) {
    const r = await creer(ADMIN, categorie, 'Faux', { portee: 'instance' })
    assert.equal(r.status, 400, categorie)
    assert.match(r.json.error, /réservée/)
  }

  // Le rangement : « Par défaut », puis amend.ink, Aube, BOD, dixit (puis ce que les autres tests ont créé).
  const liste = (await appeler('GET', '/api/modeles', ALICE)).json.modeles
  const rang = (id) => liste.findIndex((m) => m.id === id)
  assert.equal(liste[0].id, ID_DEFAUT)
  assert.ok(rang('texte-brut') < rang(aube.id), 'amend.ink avant Aube')
  assert.ok(rang(aube.id) < rang(bod.id), 'Aube avant BOD')
  assert.ok(rang(bod.id) < rang(ailleurs.id), 'BOD avant dixit')

  // Changer la catégorie : le propriétaire pour les siens, les administrateurs pour l'instance.
  assert.equal((await appeler('PUT', `/api/modeles/${bod.id}`, ALICE, { categorie: 'Autre' })).status, 403)
  const change = await appeler('PUT', `/api/modeles/${bod.id}`, ADMIN, { categorie: 'BoD' })
  assert.equal(change.status, 200)
  assert.equal(change.json.categorie, 'BoD')
  assert.equal(change.json.nom, 'Livre poche')
  for (const categorie of ['x'.repeat(41), '', 'amend.ink']) {
    assert.equal((await appeler('PUT', `/api/modeles/${bod.id}`, ADMIN, { categorie })).status, 400, categorie)
  }
  // « Par défaut » et les livrés sont dans amend.ink, et y restent.
  const defaut = (await appeler('GET', `/api/modeles/${ID_DEFAUT}`, ALICE)).json
  assert.equal(defaut.categorie, CATEGORIE_AMEND)
  assert.equal(libelleModele(defaut), 'amend.ink - Par défaut')
  assert.equal((await appeler('GET', '/api/modeles/texte-brut', ALICE)).json.categorie, CATEGORIE_AMEND)
  assert.equal((await appeler('PUT', `/api/modeles/${ID_DEFAUT}`, ADMIN, { categorie: 'X' })).status, 400)
  assert.equal((await appeler('PUT', '/api/modeles/texte-brut', ADMIN, { categorie: 'X' })).status, 403)

  // Le document qui choisit un modèle en connaît la catégorie (le menu Exporter la lit).
  const doc = await creerDoc(ALICE)
  const etat = (await appeler('PUT', `/api/docs/${doc.id}/modele`, ALICE, { modeleId: aube.id })).json
  assert.deepEqual(etat.modele, { id: aube.id, nom: 'Petit format', categorie: 'Aube', portee: 'instance' })
})

test('les modèles d’imprimeur et des P’tits Papiers : livrés, copiés, rangés, avec leur vrai format', async () => {
  const { modeles } = (await appeler('GET', '/api/modeles', ALICE)).json
  const lire = (id) => modeles.find((m) => m.id === id)
  const attendu = {
    'kdp-15-6x23-39': ['KDP', [156, 233.9]],
    'kdp-5-5x8-5': ['KDP', [139.7, 215.9]],
    'bod-12x19': ['BOD', [120, 190]],
    'bod-13-5x21-5': ['BOD', [135, 215]],
    'tat-grand': ['Aube', [140, 220]],
    'tat-moyen': ['Aube', [130, 200]],
    'tat-poche': ['Aube', [120, 180]],
    'dixit-ptit-papier': ['dixit', [148, 210]],
  }
  for (const [id, [categorie, dims]] of Object.entries(attendu)) {
    const m = lire(id)
    assert.ok(m, id)
    assert.equal(m.portee, 'instance')
    assert.equal(m.origine, id)
    assert.equal(m.ecartLivre, false)
    assert.equal(m.categorie, categorie)
    assert.deepEqual(dimensionsPage(m.style.page), dims, id)
    assert.equal(m.modifiable, false)
    assert.ok(m.description, id)
    // Un livre : marges pour la reliure, numéros de page, texte à empattement.
    assert.equal(m.style.page.pageNumbers.enabled, true, id)
    assert.equal(m.style.blocs.body.font, 'serif', id)
  }
  // KDP : la marge intérieure sûre jusqu'à 500 pages est de 15,9 mm.
  for (const id of ['kdp-15-6x23-39', 'kdp-5-5x8-5']) {
    assert.ok(lire(id).style.page.marginLeft >= 15.9 && lire(id).style.page.marginRight >= 15.9, id)
  }
  // On part d'un livré en le dupliquant, comme des autres.
  const copie = await appeler('POST', '/api/modeles', ALICE, {
    nom: 'Mon grand format',
    categorie: 'KDP',
    depuis: 'kdp-15-6x23-39',
  })
  assert.equal(copie.status, 200)
  assert.deepEqual(dimensionsPage(copie.json.style.page), [156, 233.9])
})

test('archive : les modèles sont dans data/, donc dans la sauvegarde', async () => {
  assert.ok(readdirSync(join(DATA, 'modeles')).length > 0)
})

test('un livré copié se règle, se renomme, se rétablit et se supprime — par un administrateur seulement', async () => {
  const id = 'tat-grand'
  const dossier = join(DATA, 'modeles')
  assert.ok(existsSync(join(dossier, `${id}.css`)) && existsSync(join(dossier, `${id}.json`)))
  const avant = (await appeler('GET', `/api/modeles/${id}`, ADMIN)).json
  assert.equal(avant.modifiable, true)
  assert.equal(avant.retablissable, false, 'rien à rétablir tant qu’il est d’origine')
  assert.ok(avant.description)

  // Un utilisateur ordinaire ne le touche pas.
  assert.equal((await appeler('PUT', `/api/modeles/${id}`, ALICE, { nom: 'Autre' })).status, 403)
  assert.equal((await appeler('POST', `/api/modeles/${id}/retablir`, ALICE)).status, 403)
  assert.equal((await appeler('DELETE', `/api/modeles/${id}`, ALICE)).status, 403)

  // L'administrateur règle les dimensions, renomme, reclasse.
  const style = { ...avant.style, page: { ...avant.style.page, largeur: 143, hauteur: 224 } }
  const regle = await appeler('PUT', `/api/modeles/${id}`, ADMIN, { style, nom: 'TàT grand format', categorie: 'Aube' })
  assert.equal(regle.status, 200)
  assert.deepEqual(dimensionsPage(regle.json.style.page), [143, 224])
  assert.equal(regle.json.nom, 'TàT grand format')
  assert.equal(regle.json.ecartLivre, true)
  assert.equal(regle.json.retablissable, true)
  assert.equal(regle.json.description, null, 'la description d’origine ne décrit plus ce modèle')
  assert.equal(regle.json.origine, id)

  // Même identifiant : un document qui le choisit le suit.
  const lu = (await appeler('GET', '/api/modeles', ALICE)).json.modeles.filter((m) => m.id === id)
  assert.equal(lu.length, 1, 'une seule fois dans la liste')
  assert.deepEqual(dimensionsPage(lu[0].style.page), [143, 224])

  // Un redémarrage (nouvelle copie) ne défait rien.
  new Storage(DATA).styles.modeles.semer()
  assert.deepEqual(dimensionsPage((await appeler('GET', `/api/modeles/${id}`, ADMIN)).json.style.page), [143, 224])

  // Rétablir : nom, catégorie et mise en page reviennent.
  const retabli = await appeler('POST', `/api/modeles/${id}/retablir`, ADMIN)
  assert.equal(retabli.status, 200)
  assert.equal(retabli.json.nom, 'TàT grand')
  assert.deepEqual(dimensionsPage(retabli.json.style.page), [140, 220])
  assert.equal(retabli.json.ecartLivre, false)
  assert.equal(retabli.json.retablissable, false)
  assert.ok(retabli.json.description)

  // Un modèle qui n'est pas un livré copié ne se « rétablit » pas.
  const perso = await appeler('POST', '/api/modeles', ALICE, { nom: 'Mien', categorie: 'Test', depuis: id })
  assert.equal((await appeler('POST', `/api/modeles/${perso.json.id}/retablir`, ALICE)).status, 400)
  assert.equal(perso.json.origine, null, 'une copie à soi n’est pas un livré')

  // Supprimé, il ne revient ni dans la liste ni au redémarrage.
  assert.equal((await appeler('DELETE', `/api/modeles/${id}`, ADMIN)).status, 200)
  assert.ok(!existsSync(join(dossier, `${id}.css`)) && !existsSync(join(dossier, `${id}.json`)))
  new Storage(DATA).styles.modeles.semer()
  const apres = (await appeler('GET', '/api/modeles', ALICE)).json.modeles
  assert.ok(!ids(apres).includes(id))
  assert.equal((await appeler('GET', `/api/modeles/${id}`, ADMIN)).status, 404)
})

test('fin : nettoyage', async () => {
  rmSync(DATA, { recursive: true, force: true })
  setTimeout(() => process.exit(0), 200)
})
