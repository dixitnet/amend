// Tests de la gestion des rôles/accès (voir
// claude/conception-gestion-utilisateurs.md, projet Amend) : invitation
// nominative par email, restriction éditeur/correcteur, et reconnexion par
// lien magique. Même style que integration.test.js — un
// process dédié (port différent) pour ne pas interférer avec lui.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18788
process.env.PORT = String(PORT)
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-access-'))
delete process.env.ANTHROPIC_API_KEY
delete process.env.MAILGUN_API_KEY
delete process.env.MAILGUN_DOMAIN
delete process.env.ADMIN_EMAILS

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader, createReconnectToken, consumeReconnectToken, isAdminEmail, isLoginAllowed } =
  await import('../auth.js')
const { Storage } = await import('../storage.js')
await waitForServer()

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    ;(function attempt() {
      fetch(`${BASE}/api/docs`)
        .then(() => resolve())
        .catch((err) => {
          if (Date.now() > deadline) reject(err)
          else setTimeout(attempt, 50)
        })
    })()
  })
}

function cookieFor(email) {
  return sessionCookieHeader(email, { secure: false }).split(';')[0]
}

test('créer un document sans session est refusé (401)', async () => {
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  })
  assert.equal(res.status, 401)
})

test('créer un document connecté en fait l’auteur éditeur', async () => {
  const cookie = cookieFor('alice@example.com')
  const res = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Doc de Alice' }),
  })
  assert.equal(res.status, 201)
  const doc = await res.json()

  const getRes = await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie } })
  assert.equal(getRes.status, 200)
  const meta = await getRes.json()
  assert.equal(meta.myRole, 'editeur')

  // Une autre personne, non invitée, n'y a pas accès.
  const otherRes = await fetch(`${BASE}/api/docs/${doc.id}`, {
    headers: { cookie: cookieFor('bob@example.com') },
  })
  assert.equal(otherRes.status, 403)

  // Pas de session du tout : refusé aussi (pas de mode anonyme).
  const anonRes = await fetch(`${BASE}/api/docs/${doc.id}`)
  assert.equal(anonRes.status, 403)
})

test('invitation nominative : entrée « en attente », puis accès à la première visite', async () => {
  const editorCookie = cookieFor('carla@example.com')
  const createRes = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ title: 'Doc partagé' }),
  })
  const doc = await createRes.json()

  // Mailgun n'est pas configuré dans les tests : l'envoi échoue, et
  // l'invitation ne doit PAS rester en base (sinon on afficherait « en
  // attente » pour un lien que personne n'a reçu).
  const sansMailgun = await fetch(`${BASE}/api/docs/${doc.id}/invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ email: 'dan@example.com', role: 'correcteur' }),
  })
  assert.equal(sansMailgun.status, 502)
  const apresEchec = await (
    await fetch(`${BASE}/api/docs/${doc.id}/access`, { headers: { cookie: editorCookie } })
  ).json()
  assert.equal(apresEchec.access.some((a) => a.email === 'dan@example.com'), false)

  // On court-circuite donc l'envoi de mail pour la suite : le stockage est
  // la source de vérité, c'est lui qu'on teste ici.
  const storage = new Storage(process.env.DATA_DIR)
  const { token } = storage.inviteEmail(doc.id, 'dan@example.com', 'correcteur', 'carla@example.com')

  // Tant que la personne n'est pas venue : « en attente », et le jeton
  // n'apparaît jamais dans la liste renvoyée par l'API.
  const enAttente = await (
    await fetch(`${BASE}/api/docs/${doc.id}/access`, { headers: { cookie: editorCookie } })
  ).json()
  const entree = enAttente.access.find((a) => a.email === 'dan@example.com')
  assert.equal(entree.status, 'invite')
  assert.equal(entree.role, 'correcteur')
  assert.equal('token' in entree, false)

  // Le lien ouvre la session tout seul : aucune adresse à déclarer.
  const acceptRes = await fetch(`${BASE}/api/invitations/${token}`, { method: 'POST' })
  assert.equal(acceptRes.status, 200)
  const accepte = await acceptRes.json()
  assert.equal(accepte.docId, doc.id)
  assert.equal(accepte.email, 'dan@example.com')
  assert.ok(acceptRes.headers.get('set-cookie'))

  const apres = await (
    await fetch(`${BASE}/api/docs/${doc.id}/access`, { headers: { cookie: editorCookie } })
  ).json()
  assert.equal(apres.access.find((a) => a.email === 'dan@example.com').status, 'actif')

  const meta = await (
    await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie: cookieFor('dan@example.com') } })
  ).json()
  assert.equal(meta.myRole, 'correcteur')

  // Réutilisable pendant 14 jours (ouvrir le mail sur un deuxième appareil).
  assert.equal((await fetch(`${BASE}/api/invitations/${token}`, { method: 'POST' })).status, 200)

  // Un jeton inconnu ne donne rien, et un correcteur ne gère pas les accès.
  assert.equal((await fetch(`${BASE}/api/invitations/jeton-bidon`, { method: 'POST' })).status, 404)
  const forbiddenRes = await fetch(`${BASE}/api/docs/${doc.id}/access`, {
    headers: { cookie: cookieFor('dan@example.com') },
  })
  assert.equal(forbiddenRes.status, 403)

  // Inviter quelqu'un qui a déjà l'accès est refusé (409) plutôt que de le
  // renvoyer silencieusement à l'état « en attente ».
  const doublon = await fetch(`${BASE}/api/docs/${doc.id}/invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ email: 'dan@example.com', role: 'correcteur' }),
  })
  assert.equal(doublon.status, 409)

  // L'éditeur révoque dan : il perd l'accès, et son ancien lien aussi.
  const revokeRes = await fetch(`${BASE}/api/docs/${doc.id}/access/${encodeURIComponent('dan@example.com')}`, {
    method: 'DELETE',
    headers: { cookie: editorCookie },
  })
  assert.equal(revokeRes.status, 200)
  const afterRevoke = await fetch(`${BASE}/api/docs/${doc.id}`, { headers: { cookie: cookieFor('dan@example.com') } })
  assert.equal(afterRevoke.status, 403)
  assert.equal((await fetch(`${BASE}/api/invitations/${token}`, { method: 'POST' })).status, 404)
})

test('une invitation expirée le dit au lieu de faire semblant', async () => {
  const editorCookie = cookieFor('carla@example.com')
  const doc = await (
    await fetch(`${BASE}/api/docs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: editorCookie },
      body: JSON.stringify({ title: 'Doc expiré' }),
    })
  ).json()
  const storage = new Storage(process.env.DATA_DIR)
  const { token } = storage.inviteEmail(doc.id, 'tardif@example.com', 'correcteur', 'carla@example.com')
  // On vieillit le jeton à la main plutôt que d'attendre 14 jours.
  const registre = JSON.parse(readFileSync(join(process.env.DATA_DIR, 'docs.json'), 'utf8'))
  registre[doc.id].access.find((a) => a.email === 'tardif@example.com').tokenExpiresAt = Date.now() - 1000
  writeFileSync(join(process.env.DATA_DIR, 'docs.json'), JSON.stringify(registre), 'utf8')

  const res = await fetch(`${BASE}/api/invitations/${token}`, { method: 'POST' })
  assert.equal(res.status, 410)
  assert.match((await res.json()).error, /expir/)
})

test('lien de reconnexion : usage unique, expire une fois consommé', async () => {
  const token = createReconnectToken('finn@example.com')
  const okRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  assert.equal(okRes.status, 200)
  assert.ok(okRes.headers.get('set-cookie'))

  const reuseRes = await fetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  assert.equal(reuseRes.status, 400)

  // consumeReconnectToken direct : confirme aussi l'usage unique côté module.
  const token2 = createReconnectToken('finn@example.com')
  assert.equal(consumeReconnectToken(token2), 'finn@example.com')
  assert.equal(consumeReconnectToken(token2), null)
})

test('demander un lien de reconnexion répond 200 même sans Mailgun configuré', async () => {
  // MAILGUN_API_KEY/MAILGUN_DOMAIN absents dans cet environnement de test
  // (voir en tête de fichier) — l'échec d'envoi est journalisé côté
  // serveur, pas renvoyé au client (voir server.js : on ne veut pas confirmer
  // depuis l'extérieur qu'une adresse existe ou non).
  const res = await fetch(`${BASE}/api/auth/request-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'gina@example.com' }),
  })
  assert.equal(res.status, 200)
})

test('renommer/étoiler/supprimer un document est réservé aux éditeurs', async () => {
  const editorCookie = cookieFor('hana@example.com')
  const createRes = await fetch(`${BASE}/api/docs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ title: 'Doc géré' }),
  })
  const doc = await createRes.json()

  const storage = new Storage(process.env.DATA_DIR)
  const { token } = storage.inviteEmail(doc.id, 'ivan@example.com', 'correcteur', 'hana@example.com')
  await fetch(`${BASE}/api/invitations/${token}`, { method: 'POST' })
  const correcteurCookie = cookieFor('ivan@example.com')

  const renameByCorrecteur = await fetch(`${BASE}/api/docs/${doc.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: correcteurCookie },
    body: JSON.stringify({ title: 'Piraté' }),
  })
  assert.equal(renameByCorrecteur.status, 403)

  const starByCorrecteur = await fetch(`${BASE}/api/docs/${doc.id}/star`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: correcteurCookie },
    body: JSON.stringify({ starred: true }),
  })
  assert.equal(starByCorrecteur.status, 403)

  const deleteByCorrecteur = await fetch(`${BASE}/api/docs/${doc.id}`, {
    method: 'DELETE',
    headers: { cookie: correcteurCookie },
  })
  assert.equal(deleteByCorrecteur.status, 403)

  const renameByEditor = await fetch(`${BASE}/api/docs/${doc.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ title: 'Titre légitime' }),
  })
  assert.equal(renameByEditor.status, 200)

  const deleteByEditor = await fetch(`${BASE}/api/docs/${doc.id}`, {
    method: 'DELETE',
    headers: { cookie: editorCookie },
  })
  assert.equal(deleteByEditor.status, 200)
})

test('la feuille de style et le diagnostic sont réservés aux administrateurs', async () => {
  process.env.ADMIN_EMAILS = 'admin@example.com'
  try {
    const nonAdminRes = await fetch(`${BASE}/api/style`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: cookieFor('nobody@example.com') },
      body: JSON.stringify({}),
    })
    assert.equal(nonAdminRes.status, 403)

    const adminRes = await fetch(`${BASE}/api/style`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: cookieFor('admin@example.com') },
      body: JSON.stringify({}),
    })
    assert.equal(adminRes.status, 200)

    const statsRes = await fetch(`${BASE}/api/debug/stats`, { headers: { cookie: cookieFor('nobody@example.com') } })
    assert.equal(statsRes.status, 403)
  } finally {
    delete process.env.ADMIN_EMAILS
  }
})

test('la suggestion IA : session exigée, et interdite au correcteur', async () => {
  const editorCookie = cookieFor('kim@example.com')
  const doc = await (
    await fetch(`${BASE}/api/docs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: editorCookie },
      body: JSON.stringify({ title: 'Doc avec IA' }),
    })
  ).json()

  const anonRes = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ docId: doc.id, text: 'Bonjour', instruction: 'plus formel' }),
  })
  assert.equal(anonRes.status, 401)

  // Le correcteur a une session valide et accès au document : c'est bien
  // son rôle, et rien d'autre, qui lui ferme l'IA (décision du 15/09/2026 —
  // la suggestion consomme la clé Anthropic de l'instance et écrit dans le
  // document).
  const storage = new Storage(process.env.DATA_DIR)
  const { token } = storage.inviteEmail(doc.id, 'lou@example.com', 'correcteur', 'kim@example.com')
  await fetch(`${BASE}/api/invitations/${token}`, { method: 'POST' })
  const correcteurRes = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieFor('lou@example.com') },
    body: JSON.stringify({ docId: doc.id, text: 'Bonjour', instruction: 'plus formel' }),
  })
  assert.equal(correcteurRes.status, 403)

  // Sans document, on ne peut plus vérifier de droit : 400 plutôt qu'un
  // passage en force.
  const sansDoc = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ text: 'Bonjour', instruction: 'plus formel' }),
  })
  assert.equal(sansDoc.status, 400)

  // L'éditeur passe les contrôles et la requête suit son cours — on
  // supprime ANTHROPIC_API_KEY juste pour cet appel (le vrai .env du Mac
  // peut l'avoir rechargée malgré le `delete` en tête de fichier, même bug
  // déjà connu que integration.test.js) pour vérifier précisément que ce
  // n'est ni un 401 ni un 403.
  const savedKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  const editeurRes = await fetch(`${BASE}/api/ai/suggest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: editorCookie },
    body: JSON.stringify({ docId: doc.id, text: 'Bonjour', instruction: 'plus formel' }),
  })
  if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey
  assert.equal(editeurRes.status, 501)
})

test("la liste d'attente est publique et se contente de stocker l'email", async () => {
  const res = await fetch(`${BASE}/api/waitlist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'kim@example.com' }),
  })
  assert.equal(res.status, 200)
})

test('isLoginAllowed : administrateur ou déjà invité quelque part, personne d’autre', async () => {
  const storage = new Storage(process.env.DATA_DIR)
  process.env.ADMIN_EMAILS = 'boss@example.com'
  try {
    assert.equal(isAdminEmail('boss@example.com'), true)
    assert.equal(isAdminEmail('nobody@example.com'), false)
    assert.equal(isLoginAllowed('boss@example.com', storage), true)
    assert.equal(isLoginAllowed('totally-unknown@example.com', storage), false)

    const doc = storage.createDoc('Doc pour laura', 'laura@example.com')
    assert.equal(isLoginAllowed('laura@example.com', storage), true)
  } finally {
    delete process.env.ADMIN_EMAILS
  }
})

test('la déconnexion efface la session (le cookie renvoyé ne revérifie plus)', async () => {
  const email = 'logout-test@example.com'
  const cookie = cookieFor(email)

  const beforeRes = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })
  assert.deepEqual(await beforeRes.json(), { email })

  const logoutRes = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } })
  assert.equal(logoutRes.status, 200)
  const setCookie = logoutRes.headers.get('set-cookie')
  assert.match(setCookie, /collabtext_session=;/)
  assert.match(setCookie, /Max-Age=0/)

  // Un client applique ce Set-Cookie et ne renvoie donc plus l'ancien —
  // on simule ça en n'envoyant simplement plus de cookie du tout.
  const afterRes = await fetch(`${BASE}/api/auth/me`)
  assert.deepEqual(await afterRes.json(), { email: null })
})

test.after(async () => {
  rmSync(process.env.DATA_DIR, { recursive: true, force: true })
  // Laisse le rapporteur TAP écrire le résultat du tout dernier test avant
  // de couper le process (le serveur maintient sinon la boucle d'événements
  // ouverte indéfiniment) — sans ce court délai, un process.exit() synchrone
  // ici arrive parfois avant que le dernier "ok"/"not ok" ne soit imprimé.
  await new Promise((r) => setTimeout(r, 50))
  process.exit(0)
})
