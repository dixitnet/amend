// T3 : le serveur, en processus (requêtes HTTP réelles, sans navigateur),
// contre le dépôt des comptes dans PostgreSQL, rejoué sur les données piégées.
import { test, before, after } from 'node:test'
import http from 'node:http'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerServeur } from '../../application/serveur/index.js'
import { creerJeton } from '../../application/serveur/session.js'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

const statique = mkdtempSync(join(tmpdir(), 'v2-statique-'))
writeFileSync(join(statique, 'index.html'), '<!doctype html><title>index</title>')
const BASE = { secret: 's'.repeat(32), jetonInterne: 'jeton-interne-de-test', collaboration: 'ws://x', statique }
const serveurs = []
let comptes
async function demarrer(conf, services = {}) {
  const s = creerServeur({ ...BASE, ...conf }, { comptes, ...services })
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  serveurs.push(s)
  return `http://127.0.0.1:${s.address().port}`
}
let dev, prod
before(async () => {
  preparerServices()
  comptes = await ouvrirComptes(POSTGRES)
  dev = await demarrer({ dev: true })
  prod = await demarrer({ dev: false, cookieSecure: true })
})
after(async () => {
  serveurs.forEach((s) => s.close())
  await comptes?.fermer()
})

const session = (base, nom) =>
  fetch(`${base}/api/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom }),
  })
const moi = (base, cookie) => fetch(`${base}/api/moi`, { headers: cookie ? { cookie } : {} })

test('session de développement : nom en NFC, cookie HttpOnly, identité relue', async () => {
  const r = await session(dev, 'e\u0301te\u0301')
  assert.equal(r.status, 200)
  assert.equal((await r.json()).nom, 'été')
  const cookie = r.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.doesNotMatch(cookie, /Secure/)
  const m = await moi(dev, cookie.split(';')[0])
  assert.equal((await m.json()).nom, 'été')
})

test('noms piégés : refusés avec le code du domaine', async () => {
  for (const { texte, raison } of piegees.noms) {
    const r = await session(dev, texte)
    assert.ok([200, 400].includes(r.status), raison)
    if (r.status === 400) assert.match((await r.json()).code, /^nom-/, raison)
  }
})

test('hors développement : route de session fermée ; cookie Secure en ligne', async () => {
  assert.equal((await session(prod, 'Alice')).status, 404)
  const r = await session(await demarrer({ dev: true, cookieSecure: true }), 'Alice')
  assert.match(r.headers.get('set-cookie'), /; Secure/)
})

test('cookies piégés, jeton modifié ou signé ailleurs : 401', async () => {
  for (const { texte, raison } of piegees.cookies) assert.equal((await moi(dev, texte)).status, 401, raison)
  const a = await entrer(dev, 'A')
  const bon = creerJeton(BASE.secret, { id: a.id, nom: 'A' })
  const [corps, signature] = bon.split('.')
  const autreCorps = Buffer.from(JSON.stringify({ id: 'dev-b', nom: 'B' })).toString('base64url')
  assert.equal((await moi(dev, `amend2_session=${autreCorps}.${signature}`)).status, 401, 'contenu modifié')
  assert.equal((await moi(dev, `amend2_session=${creerJeton('autre-secret', { id: 'x', nom: 'x' })}`)).status, 401)
  assert.equal((await moi(dev, `amend2_session=${corps}.${signature}`)).status, 200, 'le bon jeton passe')
  const inconnu = creerJeton(BASE.secret, { id: '00000000-0000-4000-8000-000000000000', nom: 'Z' })
  assert.equal((await moi(dev, `amend2_session=${inconnu}`)).status, 401, 'personne inconnue')
})

test('session : plus de 30 jours, ou émise avant « déconnecter partout » : refusée', async () => {
  const a = await entrer(dev, 'Ancienne')
  const vieux = creerJeton(BASE.secret, { id: a.id, nom: 'A' }, Date.now() - 31 * 24 * 3600 * 1000)
  assert.equal((await moi(dev, `amend2_session=${vieux}`)).status, 401)
  const futur = creerJeton(BASE.secret, { id: a.id, nom: 'A' }, Date.now() + 3600 * 1000)
  assert.equal((await moi(dev, `amend2_session=${futur}`)).status, 401)
  assert.equal((await moi(dev, a.cookie)).status, 200)
  assert.equal((await post(dev, '/api/deconnexion-partout', a.cookie, {})).status, 200)
  assert.equal((await moi(dev, a.cookie)).status, 401, 'session d’avant refusée')
})

test('requêtes malformées : codes, jamais de plantage', async () => {
  const mal = await fetch(`${dev}/api/dev/session`, { method: 'POST', body: '{"nom": "Alice"' })
  assert.equal(mal.status, 400)
  assert.equal((await mal.json()).code, 'requete-invalide')
  const gros = await fetch(`${dev}/api/dev/session`, {
    method: 'POST',
    body: JSON.stringify({ nom: 'a'.repeat(20000) }),
  })
  assert.equal(gros.status, 413)
  assert.equal((await gros.json()).code, 'requete-trop-grosse')
  assert.equal((await fetch(`${dev}/api/inconnue`)).status, 404)
  assert.equal((await fetch(`${dev}/api/config`, { method: 'DELETE' })).status, 405)
  // La version en service (le commit), pour vérifier un déploiement de l'extérieur.
  assert.match((await (await fetch(`${dev}/api/config`)).json()).version, /^[0-9a-f]{7}$/)
})

test('route interne des droits : jeton exigé, comparé exactement', async () => {
  const url = `${dev}/api/interne/droits?document=essai&personne=dev-a&branche=main`
  assert.equal((await fetch(url)).status, 403)
  assert.equal((await fetch(url, { headers: { 'x-amend-interne': 'faux' } })).status, 403)
  const r = await fetch(url, { headers: { 'x-amend-interne': BASE.jetonInterne } })
  assert.equal(r.status, 200)
  const sansJeton = await demarrer({ jetonInterne: '' })
  assert.equal(
    (
      await fetch(`${sansJeton}/api/interne/droits?document=a&personne=b&branche=main`, {
        headers: { 'x-amend-interne': '' },
      })
    ).status,
    403,
  )
})

// Les droits : une personne crée un document, en devient propriétaire, donne
// des rôles ; la route interne en tire ce que y/hub doit autoriser.
const post = (base, chemin, cookie, corps) =>
  fetch(`${base}${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(corps),
  })
const entrer = async (base, nom) => {
  const r = await session(base, nom)
  return { id: (await r.json()).id, cookie: r.headers.get('set-cookie').split(';')[0] }
}
const mesDroits = (base, cookie, document) =>
  fetch(`${base}/api/droits?document=${encodeURIComponent(document)}`, { headers: cookie ? { cookie } : {} })
const accesInterne = async (base, document, personne, branche) => {
  const r = await fetch(`${base}/api/interne/droits?document=${document}&personne=${personne}&branche=${branche}`, {
    headers: { 'x-amend-interne': BASE.jetonInterne },
  })
  return (await r.json()).acces
}
/** Ce que y/hub doit autoriser sur le texte (branche principale). */
const droitInterne = async (base, document, personne, branche = 'main') =>
  (await accesInterne(base, document, personne, branche))?.texte ?? null
let docNum = 0
const nouveauDoc = () => `t3-droits-${Date.now().toString(36)}-${++docNum}`

test('droits : le créateur est propriétaire, une seule création par document', async () => {
  const alice = await entrer(dev, 'Alice')
  const doc = nouveauDoc()
  const r = await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  assert.equal(r.status, 201)
  assert.equal((await r.json()).role, 'proprietaire')
  const bruno = await entrer(dev, 'Bruno')
  assert.equal((await post(dev, '/api/dev/documents', bruno.cookie, { document: doc })).status, 409)
  const miens = await mesDroits(dev, alice.cookie, doc)
  assert.deepEqual(await miens.json(), {
    role: 'proprietaire',
    capacites: [
      'lire',
      'commenter',
      'suggerer',
      'ecrire',
      'arbitrer',
      'restaurer',
      'inviter',
      'supprimer',
      'transferer',
      'ranger',
    ],
  })
  assert.equal(await droitInterne(dev, doc, alice.id), 'ecriture')
})

test('droits : sans rôle, rien ; document inconnu et document fermé se confondent', async () => {
  const alice = await entrer(dev, 'Alice')
  const bruno = await entrer(dev, 'Bruno')
  const doc = nouveauDoc()
  await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  const ferme = await mesDroits(dev, bruno.cookie, doc)
  const inconnu = await mesDroits(dev, bruno.cookie, 'jamais-cree')
  assert.equal(ferme.status, 404)
  assert.equal(inconnu.status, 404)
  assert.deepEqual(await ferme.json(), await inconnu.json())
  assert.equal(await droitInterne(dev, doc, bruno.id), null)
  assert.equal(await droitInterne(dev, 'jamais-cree', alice.id), null)
  assert.equal((await mesDroits(dev, null, doc)).status, 401)
})

test('droits : chaque rôle donné, et ce que y/hub doit autoriser', async () => {
  const alice = await entrer(dev, 'Alice')
  const doc = nouveauDoc()
  await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  // [texte, suggestions] : le lecteur ne voit pas les suggestions (étape 5).
  const attendu = { lecteur: ['lecture', null], correcteur: ['lecture', 'ecriture'], editeur: ['ecriture', 'ecriture'] }
  for (const [role, [texte, suggestions]] of Object.entries(attendu)) {
    const p = await entrer(dev, `Personne ${role}`)
    assert.equal((await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: p.id, role })).status, 200)
    assert.equal((await (await mesDroits(dev, p.cookie, doc)).json()).role, role)
    assert.equal(await droitInterne(dev, doc, p.id), texte, role)
    assert.equal(await droitInterne(dev, doc, p.id, 'suggestions'), suggestions, role)
    assert.equal(await droitInterne(dev, doc, p.id, 'autre'), null, role)
  }
  const proprio = await accesInterne(dev, doc, alice.id, 'main')
  assert.deepEqual(proprio, { texte: 'ecriture', presence: true, restaurer: true })
})

test('route interne : la branche est obligatoire', async () => {
  const r = await fetch(`${dev}/api/interne/droits?document=a&personne=b`, {
    headers: { 'x-amend-interne': BASE.jetonInterne },
  })
  assert.equal(r.status, 400)
})

test('droits : un éditeur invite, y compris un éditeur ; un correcteur non', async () => {
  const alice = await entrer(dev, 'Alice')
  const edith = await entrer(dev, 'Édith')
  const carl = await entrer(dev, 'Carl')
  const doc = nouveauDoc()
  await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: edith.id, role: 'editeur' })
  await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: carl.id, role: 'correcteur' })
  const victor = await entrer(dev, 'Victor')
  assert.equal(
    (await post(dev, '/api/dev/acces', edith.cookie, { document: doc, personne: victor.id, role: 'editeur' })).status,
    200,
  )
  const refus = await post(dev, '/api/dev/acces', carl.cookie, { document: doc, personne: victor.id, role: 'editeur' })
  assert.equal(refus.status, 403)
  assert.equal((await refus.json()).code, 'droit-insuffisant')
  // Un éditeur retire un autre éditeur.
  assert.equal(
    (await post(dev, '/api/dev/acces', edith.cookie, { document: doc, personne: victor.id, role: null })).status,
    200,
  )
  assert.equal(await droitInterne(dev, doc, victor.id), null)
})

test('droits : plusieurs propriétaires, jamais aucun ; seul un propriétaire touche aux propriétaires', async () => {
  const alice = await entrer(dev, 'Alice')
  const edith = await entrer(dev, 'Édith')
  const bruno = await entrer(dev, 'Bruno')
  const doc = nouveauDoc()
  await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: edith.id, role: 'editeur' })
  // L'éditrice ne nomme pas de propriétaire, ne touche pas à celui qui l'est.
  assert.equal(
    (await post(dev, '/api/dev/acces', edith.cookie, { document: doc, personne: bruno.id, role: 'proprietaire' }))
      .status,
    403,
  )
  for (const role of [null, 'lecteur'])
    assert.equal(
      (await post(dev, '/api/dev/acces', edith.cookie, { document: doc, personne: alice.id, role })).status,
      403,
      String(role),
    )
  // Le dernier propriétaire ne se retire pas ; avec un second, si.
  assert.equal(
    (await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: alice.id, role: null })).status,
    409,
  )
  assert.equal(
    (await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: edith.id, role: 'proprietaire' }))
      .status,
    200,
  )
  assert.equal(
    (await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: alice.id, role: 'editeur' })).status,
    200,
  )
  assert.equal((await (await mesDroits(dev, edith.cookie, doc)).json()).role, 'proprietaire')
  assert.equal(await droitInterne(dev, doc, alice.id), 'ecriture')
})

test('droits : rôles et documents piégés refusés avec un code', async () => {
  const alice = await entrer(dev, 'Alice')
  const xavier = await entrer(dev, 'Xavier')
  const doc = nouveauDoc()
  await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  for (const { texte, raison } of piegees.roles) {
    const r = await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: xavier.id, role: texte })
    assert.equal(r.status, 400, raison)
    assert.equal((await r.json()).code, 'role-invalide', raison)
  }
  for (const role of [undefined, 1, ['editeur'], { role: 'editeur' }])
    assert.equal(
      (await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: xavier.id, role })).status,
      400,
    )
  assert.equal((await post(dev, '/api/dev/acces', alice.cookie, { document: doc, role: 'lecteur' })).status, 400)
  for (const { texte, raison } of piegees.identifiantsDeDocument) {
    if (texte === 'doc1') continue
    const r = await post(dev, '/api/dev/documents', alice.cookie, { document: texte })
    assert.equal(r.status, 400, raison)
    assert.match((await r.json()).code, /^document-/, raison)
  }
  for (const corps of [null, 'texte', [1]])
    assert.equal((await post(dev, '/api/dev/documents', alice.cookie, corps)).status, 400, JSON.stringify(corps))
  assert.equal((await post(dev, '/api/dev/documents', null, { document: 'sans-session' })).status, 401)
})

test('droits : un rôle inconnu dans la table vaut le plus restrictif', async () => {
  const s = creerServeur({ ...BASE, dev: true }, { comptes: { ...comptes, rolesDe: async () => ['administrateur'] } })
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  serveurs.push(s)
  assert.equal(await droitInterne(`http://127.0.0.1:${s.address().port}`, 'doc', 'dev-a'), 'lecture')
})

test('hors développement : routes de création et de rôles fermées', async () => {
  const cookie = `amend2_session=${creerJeton(BASE.secret, { id: 'dev-a', nom: 'A' })}`
  assert.equal((await post(prod, '/api/dev/documents', cookie, { document: 'x' })).status, 404)
  assert.equal(
    (await post(prod, '/api/dev/acces', cookie, { document: 'x', personne: 'b', role: 'lecteur' })).status,
    404,
  )
})

test('fichiers : pas de sortie du dossier statique', async () => {
  for (const chemin of ['/../../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc%2fpasswd']) {
    const r = await fetch(`${dev}${chemin}`)
    assert.doesNotMatch(await r.text(), /root:/, chemin)
  }
})

test('en ligne, un secret de session absent arrête le serveur ; en développement, un secret de repli', () => {
  const avant = { secret: process.env.V2_SECRET, dev: process.env.V2_DEV }
  try {
    delete process.env.V2_SECRET
    delete process.env.V2_DEV
    assert.throws(() => creerServeur(), /secret de session absent/)
    process.env.V2_DEV = '1'
    assert.doesNotThrow(() => creerServeur().close())
  } finally {
    if (avant.secret === undefined) delete process.env.V2_SECRET
    else process.env.V2_SECRET = avant.secret
    if (avant.dev === undefined) delete process.env.V2_DEV
    else process.env.V2_DEV = avant.dev
  }
})

test('une erreur à nous : 500 et code erreur-interne, jamais le détail', async () => {
  const enPanne = {
    ...comptes,
    rolesDe: async () => {
      throw new Error('panne simulée du dépôt des accès')
    },
  }
  const s = creerServeur({ ...BASE, dev: true }, { comptes: enPanne })
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  serveurs.push(s)
  const erreurs = []
  const original = console.error
  console.error = (...a) => erreurs.push(a.join(' '))
  try {
    const r = await fetch(
      `http://127.0.0.1:${s.address().port}/api/interne/droits?document=d&personne=p&branche=main`,
      {
        headers: { 'x-amend-interne': BASE.jetonInterne },
      },
    )
    assert.equal(r.status, 500)
    assert.deepEqual(await r.json(), { code: 'erreur-interne' })
    assert.ok(
      erreurs.some((e) => e.includes('panne simulée')),
      'l’erreur est journalisée',
    )
  } finally {
    console.error = original
  }
})

test('une adresse de requête illisible (« // ») : 400, et le serveur continue de répondre', async () => {
  // Audit partiel du 08/11/2026 (constat 3) : l'analyse de l'adresse était hors
  // du bloc qui intercepte les erreurs ; sous Node 24, le rejet arrêtait le processus.
  const base = new URL(dev)
  const statut = (chemin) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: base.hostname, port: base.port, path: chemin }, (res) => {
        res.resume()
        resolve(res.statusCode)
      })
      req.on('error', reject)
      req.end()
    })
  assert.equal(await statut('//'), 400)
  assert.equal(await statut('//a:b@'), 400)
  assert.equal((await fetch(`${dev}/api/config`)).status, 200, 'le serveur répond toujours')
})
