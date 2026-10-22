// Supprimer son compte, de bout en bout (point 7, 13/10/2026) : le serveur
// tourne dans le processus, les routes sont appelées comme le client le fait.
// Les documents de départ sont écrits à côté (un second `Storage` sur le même
// dossier) pour y mettre des commentaires et des marques d'Alice.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'

const PORT = 18793
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-suppr-'))
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = ''
process.on('exit', () => rmSync(process.env.DATA_DIR, { recursive: true, force: true }))

const BASE = `http://localhost:${PORT}`
const DATA = process.env.DATA_DIR

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { Users, idCompte } = await import('../users.js')
const { NOM_COMMENTAIRES, NOM_TEXTE, AUTEUR_INCONNU } = await import('../../shared/protocole.js')
const { NOM_SUPPRIME } = await import('../suppressionCompte.js')

const ALICE = 'alice@test.local'
const BOB = 'bob@test.local'
const CLARA = 'clara@test.local'
const DAVID = 'david@test.local'

await new Promise((resolve, reject) => {
  const limite = Date.now() + 5000
  ;(function essai() {
    fetch(`${BASE}/api/docs`)
      .then(() => resolve())
      .catch((err) => (Date.now() > limite ? reject(err) : setTimeout(essai, 50)))
  })()
})

const cookie = (e) => sessionCookieHeader(e, { secure: false }).split(';')[0]
const C = { alice: cookie(ALICE), bob: cookie(BOB), clara: cookie(CLARA), david: cookie(DAVID) }
async function api(chemin, { c, methode = 'GET', corps } = {}) {
  const res = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { ...(corps ? { 'content-type': 'application/json' } : {}), ...(c ? { cookie: c } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const texte = await res.text()
  let json = null
  try {
    json = JSON.parse(texte)
  } catch {
    /* pas du JSON */
  }
  return { status: res.status, json, res }
}
const nom = (c, n) => api('/api/auth/name', { c, methode: 'POST', corps: { nom: n } })
const creer = async (c, title) => (await api('/api/docs', { c, methode: 'POST', corps: { title } })).json.id

// Le second Storage : celui d'un autre programme sur le même dossier.
const autre = new Storage(DATA)

/** Du contenu d'Alice dans le document : un commentaire, une insertion en suivi, une réponse de Bob. */
function ecrireContenu(docId) {
  const doc = new Y.Doc()
  const p = new Y.XmlElement('paragraph')
  doc.getXmlFragment(NOM_TEXTE).insert(0, [p])
  const xt = new Y.XmlText()
  p.insert(0, [xt])
  xt.insert(0, 'Texte de base ')
  xt.insert(14, 'ajout d’Alice', { insertion: { user: 'Alice Test', userColor: '#336699', ts: 1, groupe: null } })
  const c = doc.getMap(NOM_COMMENTAIRES)
  c.set('ca', {
    id: 'ca',
    author: 'Alice Test',
    authorId: idCompte(ALICE),
    color: '#336699',
    text: 'Une remarque',
    createdAt: 1,
  })
  c.set('cb', {
    id: 'cb',
    author: 'Bob Test',
    authorId: idCompte(BOB),
    color: '#aa5533',
    text: 'Une réponse',
    createdAt: 2,
  })
  autre.appendUpdate(docId, Buffer.from(Y.encodeStateAsUpdate(doc)))
}
function lireDoc(docId) {
  const doc = new Y.Doc()
  for (const u of autre.readUpdates(docId)) Y.applyUpdate(doc, u)
  return doc
}

await nom(C.alice, 'Alice Test')
await nom(C.bob, 'Bob Test')
await nom(C.clara, 'Clara Test')
await nom(C.david, 'David Test')

const seul = await creer(C.alice, 'Seul')
const partage = await creer(C.alice, 'Partagé')
const bloque = await creer(C.alice, 'Bloqué')
const deBob = await creer(C.bob, 'De Bob')
const etranger = await creer(C.clara, 'De Clara')
autre.grantAccess(partage, BOB, 'editeur')
autre.grantAccess(partage, CLARA, 'correcteur')
autre.grantAccess(bloque, DAVID, 'lecteur')
autre.grantAccess(deBob, ALICE, 'correcteur')
autre.listeAttente.ajouter(ALICE)
ecrireContenu(partage)
ecrireContenu(deBob)
await autre.flushAll() // le journal écrit en différé : le serveur lit le fichier

test('l’aperçu dit ce qui va se passer, sans rien changer', async () => {
  assert.equal((await api('/api/auth/compte/suppression')).status, 401)
  const { status, json } = await api('/api/auth/compte/suppression', { c: C.alice })
  assert.equal(status, 200)
  assert.deepEqual(
    json.supprimes.map((d) => d.id),
    [seul]
  )
  assert.deepEqual(
    json.transferes.map((d) => [d.id, d.vers, d.versNom]),
    [[partage, BOB, 'Bob Test']]
  )
  assert.deepEqual(
    json.quittes.map((d) => d.id),
    [deBob]
  )
  assert.deepEqual(
    json.bloquants.map((d) => d.id),
    [bloque]
  )
  assert.equal(json.possible, false)
  // Rien n'a bougé.
  assert.equal((await api(`/api/docs/${seul}`, { c: C.alice })).status, 200)
  assert.ok(new Users(DATA).get(ALICE))
})

test('il faut taper son adresse, et la sienne', async () => {
  assert.equal((await api('/api/auth/compte/supprimer', { c: C.alice, methode: 'POST', corps: {} })).status, 400)
  const autrui = await api('/api/auth/compte/supprimer', { c: C.alice, methode: 'POST', corps: { confirmation: BOB } })
  assert.equal(autrui.status, 400)
  assert.equal(
    (await api('/api/auth/compte/supprimer', { methode: 'POST', corps: { confirmation: ALICE } })).status,
    401
  )
  assert.ok(new Users(DATA).get(ALICE), 'toujours là')
})

test('un document que seuls des lecteurs partagent bloque, et rien n’est touché', async () => {
  const r = await api('/api/auth/compte/supprimer', { c: C.alice, methode: 'POST', corps: { confirmation: ALICE } })
  assert.equal(r.status, 409)
  assert.match(r.json.error, /lecteurs ou correcteurs/)
  assert.equal((await api(`/api/docs/${seul}`, { c: C.alice })).status, 200, 'son document seul est intact')
  assert.ok(new Users(DATA).get(ALICE))
  assert.equal(autre.ownerOf(partage), ALICE)
})

test('la suppression : documents, accès, noms, données personnelles, sessions', async () => {
  // Alice règle le blocage elle-même : David, lecteur, devient éditeur.
  autre.grantAccess(bloque, DAVID, 'editeur')
  assert.deepEqual(
    (await api('/api/auth/compte/suppression', { c: C.alice })).json.bloquants,
    [],
    'plus rien ne bloque'
  )

  // Des données personnelles un peu partout.
  await api('/api/auth/couleur', { c: C.alice, methode: 'POST', corps: { couleur: '#3760c9' } })
  await api(`/api/docs/${seul}/favori`, { c: C.alice, methode: 'POST', corps: { favori: true } })

  const r = await api('/api/auth/compte/supprimer', {
    c: C.alice,
    methode: 'POST',
    corps: { confirmation: ' Alice@Test.local ' },
  })
  assert.equal(r.status, 200, r.json && r.json.error)
  assert.equal(r.json.ok, true)
  assert.equal(r.json.documentsSupprimes, 1)
  assert.equal(r.json.documentsTransferes, 2) // partagé → Bob, bloqué → David
  assert.equal(r.json.documentsQuittes, 1)
  assert.deepEqual(r.json.echecs, [])
  assert.ok(r.json.commentaires >= 2)
  assert.match(r.res.headers.get('set-cookie') || '', /collabtext_session=;|Max-Age=0/i, 'le cookie est effacé')

  // Les documents.
  assert.equal(autre.getDoc(seul), null, 'le document porté seul a disparu')
  assert.equal(autre.ownerOf(partage), BOB)
  assert.equal(autre.ownerOf(bloque), DAVID)
  assert.equal(autre.ownerOf(deBob), BOB)
  for (const id of [partage, bloque, deBob]) {
    assert.ok(!autre.getAccess(id).some((a) => a.email === ALICE), `${id} garde Alice`)
  }
  assert.deepEqual(autre.documentsAvecAcces(ALICE), [])
  assert.ok(autre.getDoc(etranger), 'le document d’une autre personne n’est pas touché')

  // Les noms, dans les documents conservés (le journal écrit en différé).
  await new Promise((r) => setTimeout(r, 500))
  for (const id of [partage, deBob]) {
    const doc = lireDoc(id)
    const c = doc.getMap(NOM_COMMENTAIRES)
    assert.equal(c.get('ca').author, NOM_SUPPRIME)
    assert.equal(c.get('ca').authorId, AUTEUR_INCONNU)
    assert.equal(c.get('ca').text, 'Une remarque', 'le commentaire reste')
    assert.equal(c.get('cb').author, 'Bob Test', 'celui de Bob non')
    const delta = doc.getXmlFragment(NOM_TEXTE).toArray()[0].toArray()[0].toDelta()
    const ajout = delta.find((o) => o.insert === 'ajout d’Alice')
    assert.equal(ajout.attributes.insertion.user, NOM_SUPPRIME)
    assert.equal(ajout.attributes.insertion.userColor, '#336699')
  }

  // Les données personnelles.
  assert.equal(new Users(DATA).get(ALICE), null)
  assert.equal(new Users(DATA).get(BOB).nom, 'Bob Test')
  // Nulle part dans le dossier de données : ni fichier, ni journal, ni événement.
  const restes = []
  const parcourir = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const chemin = join(d, e.name)
      if (e.isDirectory()) parcourir(chemin)
      else if (readFileSync(chemin).includes(ALICE)) restes.push(chemin.slice(DATA.length))
    }
  }
  parcourir(DATA)
  assert.deepEqual(restes, [], 'l’adresse d’Alice reste dans ces fichiers')
  assert.ok(!existsSync(join(DATA, 'rangements', `${idCompte(ALICE)}.json`)))

  // L'ancien cookie ne rouvre rien : la session est révoquée.
  const moi = await api('/api/auth/me', { c: C.alice })
  assert.equal(moi.json.email, null)
  assert.equal((await api('/api/auth/compte/suppression', { c: C.alice })).status, 401)
  assert.deepEqual((await api('/api/docs', { c: C.alice })).json.docs, [])
})

test('Bob garde la main sur ce qu’il a hérité, et les autres comptes ne bougent pas', async () => {
  const meta = await api(`/api/docs/${partage}`, { c: C.bob })
  assert.equal(meta.status, 200)
  const liste = (await api('/api/docs', { c: C.bob })).json.docs.map((d) => d.id)
  assert.ok(liste.includes(partage) && liste.includes(deBob))
  const clara = (await api('/api/docs', { c: C.clara })).json.docs.map((d) => d.id)
  assert.ok(clara.includes(partage) && clara.includes(etranger))
  const accesPartage = await api(`/api/docs/${partage}/access`, { c: C.bob })
  assert.equal(accesPartage.status, 200)
  assert.ok(!JSON.stringify(accesPartage.json).includes(ALICE))
})

test('reconnexion : une adresse sans accès nulle part ne reçoit plus de lien', async () => {
  const r = await api('/api/auth/request-link', { methode: 'POST', corps: { email: ALICE } })
  assert.equal(r.status, 200, 'même réponse qu’avant : on n’apprend rien')
  const { isLoginAllowed } = await import('../auth.js')
  assert.equal(isLoginAllowed(ALICE, autre), false)
})

test.after(() => setTimeout(() => process.exit(0), 50))
