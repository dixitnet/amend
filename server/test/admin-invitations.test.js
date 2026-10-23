// Les invitations sans réponse, au back-office (23/10/2026) : où en est leur
// courrier, un nouveau lien, le renvoi, la suppression — et ce que devient un
// lien d'invitation déjà utilisé. Le vrai serveur, de vraies sessions ; le
// courrier et la lecture chez le fournisseur sont remplacés.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 18831
process.env.PORT = String(PORT)
const DATA_DIR = mkdtempSync(join(tmpdir(), 'collabtext-test-admin-invitations-'))
process.env.DATA_DIR = DATA_DIR
process.env.ANTHROPIC_API_KEY = ''
process.env.MAILGUN_API_KEY = ''
process.env.MAILGUN_DOMAIN = ''
process.env.MAILGUN_API_HOST = '127.0.0.1'
process.env.ADMIN_EMAILS = 'admin@example.com'
process.env.APP_BASE_URL = `http://localhost:${PORT}`

const BASE = `http://localhost:${PORT}`

await import('../server.js')
const { sessionCookieHeader } = await import('../auth.js')
const { Storage } = await import('../storage.js')
const { remplacerEnvoi, remplacerLecture } = await import('../mailgun.js')
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
const ADMIN = cookie('admin@example.com')
const envoyes = []
remplacerEnvoi((m) => {
  envoyes.push(m)
})

const json = (chemin, methode, corps, galette = ADMIN) =>
  fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'content-type': 'application/json', ...(galette ? { cookie: galette } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
const lienDe = (courrier) => courrier.text.match(/#\/invite\/([A-Za-z0-9_-]+)/)[1]
const accepter = (jeton) => fetch(`${BASE}/api/invitations/${jeton}`, { method: 'POST' })

async function documentDe(email, title) {
  return await (await json('/api/docs', 'POST', { title }, cookie(email))).json()
}
async function inviter(proprio, docId, email, role = 'correcteur') {
  const avant = envoyes.length
  const res = await json(`/api/docs/${docId}/invitations`, 'POST', { email, role }, cookie(proprio))
  assert.equal(res.status, 200)
  assert.equal(envoyes.length, avant + 1)
  return lienDe(envoyes.at(-1))
}
const embarquer = async (email) => {
  const res = await json('/api/admin/embarquer', 'POST', { email })
  assert.equal(res.status, 200)
  return { ...(await res.json()), jeton: lienDe(envoyes.at(-1)) }
}
const vueEnsemble = async () => (await json('/api/admin/overview', 'GET', undefined)).json()

test('ces gestes sont réservés aux administrateurs', async () => {
  const doc = await documentDe('anne@example.com', 'Doc fermé')
  await inviter('anne@example.com', doc.id, 'ferme@example.com')
  const corps = { docId: doc.id, email: 'ferme@example.com' }
  for (const galette of [null, cookie('anne@example.com'), cookie('ferme@example.com')]) {
    assert.equal((await json('/api/admin/invitations/courrier', 'GET', undefined, galette)).status, 403)
    assert.equal((await json('/api/admin/invitations/lien', 'POST', corps, galette)).status, 403)
    assert.equal((await json('/api/admin/invitations/renvoyer', 'POST', corps, galette)).status, 403)
    assert.equal((await json('/api/admin/invitations', 'DELETE', corps, galette)).status, 403)
  }
  // Rien n'a bougé.
  assert.equal(new Storage(DATA_DIR).getAccess(doc.id).find((a) => a.email === 'ferme@example.com').status, 'invite')
})

test('la vue d’ensemble dit quelle invitation est un embarquement', async () => {
  const doc = await documentDe('bruno@example.com', 'Doc de Bruno')
  await inviter('bruno@example.com', doc.id, 'simple@example.com')
  const { docId } = await embarquer('bienvenu@example.com')
  const liste = (await vueEnsemble()).utilisateurs.invitationsEnAttente
  const simple = liste.find((i) => i.email === 'simple@example.com')
  const bienvenu = liste.find((i) => i.email === 'bienvenu@example.com')
  assert.equal(simple.bienvenue, false)
  assert.equal(simple.docId, doc.id)
  assert.equal(bienvenu.bienvenue, true)
  assert.equal(bienvenu.docId, docId)
})

test('l’état du courrier de chaque invitation, selon le type de courrier', async () => {
  const doc = await documentDe('clara@example.com', 'Doc de Clara')
  await inviter('clara@example.com', doc.id, 'etat-simple@example.com')
  const { docId } = await embarquer('etat-bienvenu@example.com')
  const demandes = []
  remplacerLecture(async ({ to, objet }) => {
    demandes.push({ to, objet })
    return to === 'etat-simple@example.com' ? { etat: 'remis' } : { etat: 'refuse', detail: '550 5.1.1' }
  })
  try {
    const res = await json('/api/admin/invitations/courrier', 'GET')
    assert.equal(res.status, 200)
    const { etats } = await res.json()
    assert.deepEqual(etats[`${doc.id}|etat-simple@example.com`], { etat: 'remis' })
    assert.deepEqual(etats[`${docId}|etat-bienvenu@example.com`], { etat: 'refuse', detail: '550 5.1.1' })
    // Le courrier d’embarquement s’appelle « Bienvenue… », pas « Invitation… ».
    const objetDe = (to) => demandes.find((d) => d.to === to).objet
    assert.equal(objetDe('etat-bienvenu@example.com').test('Bienvenue sur amend.ink'), true)
    assert.equal(objetDe('etat-simple@example.com').test('Invitation à collaborer sur « x »'), true)
  } finally {
    remplacerLecture(null)
  }
})

test('copier le lien : un nouveau lien sans courrier, l’ancien cesse de marcher', async () => {
  const doc = await documentDe('denis@example.com', 'Doc de Denis')
  const ancien = await inviter('denis@example.com', doc.id, 'lien-admin@example.com', 'lecteur')
  const avant = envoyes.length
  const res = await json('/api/admin/invitations/lien', 'POST', { docId: doc.id, email: 'lien-admin@example.com' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const nouveau = (await res.json()).lien.match(/#\/invite\/([A-Za-z0-9_-]+)$/)[1]
  assert.notEqual(nouveau, ancien)
  assert.equal(envoyes.length, avant, 'aucun courrier')
  assert.equal((await accepter(ancien)).status, 404)
  const ok = await accepter(nouveau)
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).docId, doc.id)
  // Une fois la personne entrée, plus d’invitation en attente à renouveler.
  assert.equal(
    (await json('/api/admin/invitations/lien', 'POST', { docId: doc.id, email: 'lien-admin@example.com' })).status,
    404
  )
  for (const corps of [
    { docId: doc.id, email: 'inconnue@example.com' },
    { docId: 'pas-un-doc', email: 'lien-admin@example.com' },
    { docId: doc.id, email: 'pas une adresse' },
    { email: 'lien-admin@example.com' },
  ])
    assert.equal((await json('/api/admin/invitations/lien', 'POST', corps)).status, 404)
})

test('renvoyer une invitation : le courrier nomme celle ou celui qui avait invité, avec un nouveau lien', async () => {
  const doc = await documentDe('emma@example.com', 'Doc d’Emma')
  const ancien = await inviter('emma@example.com', doc.id, 'renvoi@example.com', 'lecteur')
  const avant = envoyes.length
  const res = await json('/api/admin/invitations/renvoyer', 'POST', { docId: doc.id, email: 'renvoi@example.com' })
  assert.equal(res.status, 200)
  assert.equal(envoyes.length, avant + 1)
  const courrier = envoyes.at(-1)
  assert.equal(courrier.to, 'renvoi@example.com')
  assert.match(courrier.subject, /^Invitation à collaborer sur « Doc d’Emma »/)
  assert.match(courrier.text, /emma@example\.com vous invite/)
  assert.doesNotMatch(courrier.text, /admin@example\.com/)
  const nouveau = lienDe(courrier)
  assert.notEqual(nouveau, ancien)
  assert.equal((await accepter(ancien)).status, 404)
  const accepte = await accepter(nouveau)
  assert.equal((await accepte.json()).role, 'lecteur')
})

test('renvoyer un embarquement : le courrier de bienvenue, signé de l’administrateur', async () => {
  const { docId } = await embarquer('renvoi-bienvenue@example.com')
  const avant = envoyes.length
  const res = await json('/api/admin/invitations/renvoyer', 'POST', { docId, email: 'renvoi-bienvenue@example.com' })
  assert.equal(res.status, 200)
  assert.equal(envoyes.length, avant + 1)
  assert.equal(envoyes.at(-1).subject, 'Bienvenue sur amend.ink')
  assert.match(envoyes.at(-1).text, /admin@example\.com vous ouvre un premier document/)
})

test('si le courrier ne part pas au renvoi, l’erreur est dite et l’invitation reste', async () => {
  const doc = await documentDe('fred@example.com', 'Doc de Fred')
  await inviter('fred@example.com', doc.id, 'panne-renvoi@example.com')
  remplacerEnvoi(() => {
    throw new Error('Mailgun en panne')
  })
  try {
    const res = await json('/api/admin/invitations/renvoyer', 'POST', {
      docId: doc.id,
      email: 'panne-renvoi@example.com',
    })
    assert.equal(res.status, 502)
    assert.match((await res.json()).error, /pas pu être envoyé/)
  } finally {
    remplacerEnvoi((m) => {
      envoyes.push(m)
    })
  }
  assert.equal(
    new Storage(DATA_DIR).getAccess(doc.id).find((a) => a.email === 'panne-renvoi@example.com').status,
    'invite'
  )
})

test('supprimer une invitation : l’accès disparaît, et le lien avec lui', async () => {
  const doc = await documentDe('gina@example.com', 'Doc de Gina')
  const jeton = await inviter('gina@example.com', doc.id, 'supprime@example.com')
  await inviter('gina@example.com', doc.id, 'reste@example.com')
  const res = await json('/api/admin/invitations', 'DELETE', { docId: doc.id, email: 'supprime@example.com' })
  assert.equal(res.status, 200)
  const r = await res.json()
  assert.equal(r.ok, true)
  assert.equal(r.documentSupprime, undefined)
  const acces = new Storage(DATA_DIR).getAccess(doc.id).map((a) => a.email)
  assert.ok(!acces.includes('supprime@example.com'))
  assert.ok(acces.includes('reste@example.com'), 'les autres invitations restent')
  assert.ok(new Storage(DATA_DIR).getDoc(doc.id), 'le document reste')
  assert.equal((await accepter(jeton)).status, 404)
  // Déjà supprimée : plus rien à supprimer.
  assert.equal(
    (await json('/api/admin/invitations', 'DELETE', { docId: doc.id, email: 'supprime@example.com' })).status,
    404
  )
})

test('supprimer une personne qui est déjà entrée n’est pas possible ici', async () => {
  const doc = await documentDe('hugo@example.com', 'Doc de Hugo')
  const jeton = await inviter('hugo@example.com', doc.id, 'entree@example.com')
  assert.equal((await accepter(jeton)).status, 200)
  assert.equal(
    (await json('/api/admin/invitations', 'DELETE', { docId: doc.id, email: 'entree@example.com' })).status,
    404
  )
  assert.ok(new Storage(DATA_DIR).getAccess(doc.id).some((a) => a.email === 'entree@example.com'))
  // Le propriétaire d’un document ordinaire n’est pas une « invitation » non plus.
  assert.equal(
    (await json('/api/admin/invitations', 'DELETE', { docId: doc.id, email: 'hugo@example.com' })).status,
    404
  )
})

test('supprimer un embarquement : le document de bienvenue part avec, et l’adresse retourne en liste d’attente', async () => {
  await fetch(`${BASE}/api/waitlist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'retour-liste@example.com' }),
  })
  const { docId, jeton } = await embarquer('retour-liste@example.com')
  const file = async () => (await json('/api/admin/waitlist', 'GET')).json()
  assert.equal((await file()).file.find((l) => l.email === 'retour-liste@example.com').statut, 'embarque')

  const res = await json('/api/admin/invitations', 'DELETE', { docId, email: 'retour-liste@example.com' })
  assert.equal(res.status, 200)
  const r = await res.json()
  assert.equal(r.documentSupprime, true)
  assert.equal(r.remiseEnAttente, true)
  assert.equal(new Storage(DATA_DIR).getDoc(docId), null)
  assert.equal((await accepter(jeton)).status, 404)
  assert.equal((await file()).file.find((l) => l.email === 'retour-liste@example.com').statut, 'attente')
  // Elle peut être embarquée de nouveau.
  const encore = await json('/api/admin/embarquer', 'POST', { email: 'retour-liste@example.com' })
  assert.equal(encore.status, 200)
})

test('une adresse embarquée sans être sur la liste : la supprimer ne touche à aucune liste', async () => {
  const { docId } = await embarquer('hors-liste@example.com')
  const res = await json('/api/admin/invitations', 'DELETE', { docId, email: 'hors-liste@example.com' })
  assert.equal(res.status, 200)
  const r = await res.json()
  assert.equal(r.documentSupprime, true)
  assert.equal(r.remiseEnAttente, false)
})

test('un document partagé dont le seul accès est celui d’une personne invitée n’est pas pris pour un embarquement', async () => {
  // Même titre que le document de bienvenue, mais créé par un autre : supprimer
  // l’invitation ne doit pas supprimer le document.
  const doc = await documentDe('ines@example.com', 'Bienvenue sur amend.ink')
  await inviter('ines@example.com', doc.id, 'piege@example.com')
  const res = await json('/api/admin/invitations', 'DELETE', { docId: doc.id, email: 'piege@example.com' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).documentSupprime, undefined)
  assert.ok(new Storage(DATA_DIR).getDoc(doc.id))
})

test('un lien d’invitation déjà utilisé reste un signet vers le document, sans redonner de session après l’heure de grâce', async () => {
  const doc = await documentDe('jules@example.com', 'Doc de Jules')
  const jeton = await inviter('jules@example.com', doc.id, 'revenu@example.com')

  // Première ouverture : le document, et la session.
  const premiere = await accepter(jeton)
  assert.equal(premiere.status, 200)
  const p = await premiere.json()
  assert.equal(p.docId, doc.id)
  assert.equal(p.dejaUtilisee, undefined)
  assert.ok(premiere.headers.get('set-cookie'))

  // Pendant l’heure qui suit : comme la première fois, session comprise
  // (téléphone puis ordinateur, ou un filtre qui a ouvert le lien le premier).
  const seconde = await accepter(jeton)
  assert.equal(seconde.status, 200)
  const s = await seconde.json()
  assert.equal(s.docId, doc.id)
  assert.equal(s.dejaUtilisee, undefined)
  assert.ok(seconde.headers.get('set-cookie'))

  // Plus tard : expiré, mais pas une erreur. Il montre le document sans rien
  // donner d’autre — pas de session, pas d’adresse, pas de rôle.
  const registre = JSON.parse(readFileSync(join(DATA_DIR, 'docs.json'), 'utf8'))
  registre[doc.id].access.find((a) => a.email === 'revenu@example.com').tokenExpiresAt = Date.now() - 1000
  writeFileSync(join(DATA_DIR, 'docs.json'), JSON.stringify(registre), 'utf8')
  const tardive = await accepter(jeton)
  assert.equal(tardive.status, 200)
  assert.deepEqual(await tardive.json(), { dejaUtilisee: true, docId: doc.id })
  assert.equal(tardive.headers.get('set-cookie'), null)

  // Et dès que l’accès est retiré, le signet ne mène plus nulle part.
  await json(
    `/api/docs/${doc.id}/access/${encodeURIComponent('revenu@example.com')}`,
    'DELETE',
    undefined,
    cookie('jules@example.com')
  )
  assert.equal((await accepter(jeton)).status, 404)
})

test('un lien d’invitation jamais utilisé et expiré reste une erreur, comme un lien inconnu', async () => {
  const doc = await documentDe('karim@example.com', 'Doc de Karim')
  const jeton = await inviter('karim@example.com', doc.id, 'tarde@example.com')
  const registre = JSON.parse(readFileSync(join(DATA_DIR, 'docs.json'), 'utf8'))
  registre[doc.id].access.find((a) => a.email === 'tarde@example.com').tokenExpiresAt = Date.now() - 1000
  writeFileSync(join(DATA_DIR, 'docs.json'), JSON.stringify(registre), 'utf8')
  assert.equal((await accepter(jeton)).status, 410)
  assert.equal((await accepter('jeton-bidon')).status, 404)
})
