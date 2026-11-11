// T3 : le serveur, en processus (requêtes HTTP réelles, sans navigateur),
// contre le dépôt des comptes dans PostgreSQL, rejoué sur les données piégées.
import postgres from 'postgres'
import { test, before, after } from 'node:test'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerServeur } from '../../application/serveur/index.js'
import { creerJeton } from '../../application/serveur/session.js'
import { adresseSansSecret } from '../../application/serveur/adresse.js'
import { preparerServices, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

const statique = mkdtempSync(join(tmpdir(), 'v2-statique-'))
writeFileSync(join(statique, 'index.html'), '<!doctype html><title>index</title>')
mkdirSync(join(statique, 'assets'))
writeFileSync(join(statique, 'assets', 'compilateur-abc123.wasm'), Buffer.from([0, 97, 115, 109]))
for (const f of ['police-abc.ttf', 'picto-abc.svg', 'icone-abc.png']) writeFileSync(join(statique, 'assets', f), 'x')
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
      'utiliserMargo',
      'supprimer',
      'transferer',
      'ranger',
    ],
    titre: null,
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

test('config : la version en service (le commit, ou null hors d’un dépôt git), pour vérifier un déploiement', async () => {
  const { version } = await (await fetch(`${dev}/api/config`)).json()
  assert.ok(version === null || /^[0-9a-f]{7}$/.test(version), String(version))
})

test('config : l’adresse de l’aide, seulement si elle est valable (V2_AIDE_URL)', async () => {
  assert.equal((await (await fetch(`${dev}/api/config`)).json()).aide, null, 'sans réglage : pas d’aide')
  const avec = await demarrer({ dev: false, aide: 'https://www.amend.ink/aide/' })
  assert.equal((await (await fetch(`${avec}/api/config`)).json()).aide, 'https://www.amend.ink/aide/')
  const mauvaise = await demarrer({ dev: false, aide: 'javascript:alert(1)' })
  assert.equal((await (await fetch(`${mauvaise}/api/config`)).json()).aide, null)
})

test('comptes d’essai : seulement avec la clé (assez longue), seulement en @essai.amend.invalid', async () => {
  const CLE = 'e'.repeat(40)
  const enLigne = await demarrer({ dev: false, jetonEssai: CLE })
  const courte = await demarrer({ dev: false, jetonEssai: 'court' })
  const essai = (base, entetes = {}) =>
    fetch(`${base}/api/essai/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...entetes },
      body: JSON.stringify({ nom: 'Essai A' }),
    })
  assert.equal((await essai(enLigne)).status, 404, 'sans jeton fourni, la route n’existe pas')
  assert.equal((await essai(enLigne, { 'x-amend-essai-token': 'f'.repeat(40) })).status, 404)
  assert.equal((await essai(courte, { 'x-amend-essai-token': 'court' })).status, 404, 'clé trop courte : fermé')
  assert.equal((await essai(prod, { 'x-amend-essai-token': CLE })).status, 404, 'sans clé configurée : fermé')
  const r = await essai(enLigne, { 'x-amend-essai-token': CLE })
  assert.equal(r.status, 200)
  const corps = await r.json()
  assert.match(corps.courriel, /@essai\.amend\.invalid$/)
  const cookie = r.headers.get('set-cookie').split(';')[0]
  const moi = await (await fetch(`${enLigne}/api/moi`, { headers: { cookie } })).json()
  assert.equal(moi.nom, 'Essai A')
  // L'entrée par un simple nom reste fermée hors développement.
  const dev = await fetch(`${enLigne}/api/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom: 'X' }),
  })
  assert.equal(dev.status, 404)
})

test('back-office : réservé aux administrateurs de l’instance ; jamais un compte d’essai', async () => {
  const adresse = `admin-${Date.now().toString(36)}@exemple.fr`
  const base = await demarrer({ dev: false, administrateurs: `autre@exemple.fr, ${adresse.toUpperCase()}` })
  const admin = await comptes.personneOuNouvelle(adresse)
  const simple = await comptes.personneOuNouvelle(`simple-${Date.now().toString(36)}@exemple.fr`)
  const cookie = (p) => `amend2_session=${creerJeton(BASE.secret, { id: p.id, nom: 'N' })}`
  const moi = async (p) => (await (await fetch(`${base}/api/moi`, { headers: { cookie: cookie(p) } })).json()).admin
  assert.equal(await moi(admin), true)
  assert.equal(await moi(simple), false)
  assert.equal((await fetch(`${base}/api/admin/systeme`)).status, 401)
  assert.equal((await fetch(`${base}/api/admin/systeme`, { headers: { cookie: cookie(simple) } })).status, 403)
  const r = await fetch(`${base}/api/admin/systeme`, { headers: { cookie: cookie(admin) } })
  assert.equal(r.status, 200)
  const s = await r.json()
  assert.ok(s.version.numero === null || /^2\.\d{3,}$/.test(s.version.numero), String(s.version.numero))
  assert.ok(s.comptes.personnes >= 2 && Number.isInteger(s.comptes.essai) && Number.isInteger(s.comptes.equipes))
  assert.ok(s.memoire > 0 && s.demarrage <= Date.now())
  // Sans liste, personne n'est administrateur.
  const sans = await demarrer({ dev: false })
  assert.equal((await fetch(`${sans}/api/admin/systeme`, { headers: { cookie: cookie(admin) } })).status, 403)
})

test('back-office, suivi : erreurs et refus inhabituels au journal, mémoire des processus relevée ; réservé aux administrateurs', async () => {
  const adresse = `admin-suivi-${Date.now().toString(36)}@exemple.fr`
  const JETON = 'jeton-interne-du-suivi'
  const base = await demarrer({
    dev: false,
    administrateurs: adresse,
    jetonInterne: JETON,
    adresse: 'https://ici.example',
  })
  const admin = await comptes.personneOuNouvelle(adresse)
  const simple = await comptes.personneOuNouvelle(`simple-suivi-${Date.now().toString(36)}@exemple.fr`)
  const cookie = (p) => `amend2_session=${creerJeton(BASE.secret, { id: p.id, nom: 'N' })}`
  assert.equal((await fetch(`${base}/api/admin/suivi`)).status, 401)
  assert.equal((await fetch(`${base}/api/admin/suivi`, { headers: { cookie: cookie(simple) } })).status, 403)
  // Un refus inhabituel (requête venue d'un autre site) et un refus ordinaire (404).
  const marque = `suivi-${Date.now().toString(36)}`
  const ailleurs = await fetch(`${base}/api/${marque}`, {
    method: 'POST',
    headers: { origin: 'https://ailleurs.example' },
  })
  assert.equal(ailleurs.status, 403)
  assert.equal((await fetch(`${base}/api/${marque}-ordinaire`, { headers: { cookie: cookie(simple) } })).status, 404)
  // La mémoire de la collaboration, relevée avec le jeton interne seulement.
  const mesure = (jeton, corps) =>
    fetch(`${base}/api/interne/mesure`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-amend-interne': jeton },
      body: JSON.stringify(corps),
    })
  assert.equal((await mesure('faux', { processus: 'collaboration', memoire: 1000 })).status, 403)
  assert.equal((await mesure(JETON, { processus: 'autre', memoire: 1000 })).status, 400)
  assert.equal((await mesure(JETON, { processus: 'collaboration', memoire: 123_456_789 })).status, 200)
  await new Promise((r) => setTimeout(r, 200))
  const r = await fetch(`${base}/api/admin/suivi`, { headers: { cookie: cookie(admin) } })
  assert.equal(r.status, 200)
  const suivi = await r.json()
  const note = suivi.journal.find((j) => j.detail?.chemin === `/api/${marque}`)
  assert.deepEqual(
    { type: note?.type, code: note?.code, detail: note?.detail },
    { type: 'refus', code: 'origine-refusee', detail: { methode: 'POST', chemin: `/api/${marque}` } },
  )
  assert.equal(
    suivi.journal.some((j) => j.detail?.chemin === `/api/${marque}-ordinaire`),
    false,
    'un refus ordinaire n’est pas noté',
  )
  assert.ok(suivi.mesures.some((m) => m.processus === 'collaboration' && m.memoire === 123_456_789))
  // La purge efface ce qui dépasse les durées du domaine.
  await comptes.purgerSuivi({ journalAvant: Date.now() + 1000, mesuresAvant: Date.now() + 1000 })
  const apres = await (await fetch(`${base}/api/admin/suivi`, { headers: { cookie: cookie(admin) } })).json()
  assert.deepEqual([apres.journal.length, apres.mesures.length], [0, 0])
})

test('back-office, rubrique IA : le modèle de Margo, choisi par un administrateur, parmi ceux qui ont une clé', async (t) => {
  const adresse = `admin-ia-${Date.now().toString(36)}@exemple.fr`
  const ia = { disponible: (m) => m !== 'claude-fable-5-2', conversation: () => ({ tour: async () => ({}) }) }
  const base = await demarrer({ dev: false, administrateurs: adresse, margoModele: 'deepseek-v4.1-flash-1017' }, { ia })
  const admin = await comptes.personneOuNouvelle(adresse)
  const simple = await comptes.personneOuNouvelle(`simple-ia-${Date.now().toString(36)}@exemple.fr`)
  const cookie = (p) => `amend2_session=${creerJeton(BASE.secret, { id: p.id, nom: 'N' })}`
  const sql = postgres(POSTGRES, { max: 1, onnotice: () => {} })
  t.after(async () => {
    // Le réglage est commun à toute la base : on le retire après l'essai.
    await sql`delete from amend.reglages where cle = 'margo.modele'`
    await sql.end()
  })
  await sql`delete from amend.reglages where cle = 'margo.modele'`
  const lire = (p) => fetch(`${base}/api/admin/ia`, p ? { headers: { cookie: cookie(p) } } : {})
  const choisir = (p, modele) =>
    fetch(`${base}/api/admin/ia`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: cookie(p) },
      body: JSON.stringify({ modele }),
    })
  assert.equal((await lire()).status, 401)
  assert.equal((await lire(simple)).status, 403)
  assert.equal((await choisir(simple, 'claude-sonnet-5-5')).status, 403)
  const avant = await (await lire(admin)).json()
  assert.equal(avant.modele, null, 'jamais choisi')
  assert.equal(avant.defaut, 'deepseek-v4.1-flash-1017')
  assert.deepEqual(
    avant.modeles.map((m) => [m.id, m.disponible]),
    [
      ['deepseek-v4.1-flash-1017', true],
      ['claude-sonnet-5-5', true],
      ['claude-haiku-5-5', true],
      ['claude-fable-5-2', false],
    ],
  )
  assert.deepEqual(await (await choisir(admin, 'inconnu')).json(), { code: 'modele-inconnu' })
  assert.deepEqual(await (await choisir(admin, 'toString')).json(), { code: 'modele-inconnu' })
  const sansCle = await choisir(admin, 'claude-fable-5-2')
  assert.equal(sansCle.status, 409)
  assert.deepEqual(await sansCle.json(), { code: 'modele-sans-cle' })
  assert.equal((await choisir(admin, 'claude-sonnet-5-5')).status, 200)
  assert.equal((await (await lire(admin)).json()).modele, 'claude-sonnet-5-5')
  // Un modèle retiré de l'adaptateur (montée de version) : le réglage ne vaut plus rien.
  await comptes.definirReglage('margo.modele', 'modele-retire', admin.id)
  assert.equal((await (await lire(admin)).json()).modele, null)
})

test('titre : qui écrit renomme le document (NFC, espaces réduits, vide : sans titre) ; un lecteur non', async () => {
  const alice = await entrer(dev, 'Alice')
  const doc = nouveauDoc()
  await post(dev, '/api/dev/documents', alice.cookie, { document: doc })
  const renommer = (cookie, titre) =>
    fetch(`${dev}/api/documents/${doc}/titre`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ titre }),
    })
  const r = await renommer(alice.cookie, '  Re\u0301parons   la ville  ')
  assert.deepEqual(await r.json(), { titre: 'Réparons la ville' })
  assert.equal((await (await mesDroits(dev, alice.cookie, doc)).json()).titre, 'Réparons la ville')
  assert.deepEqual(await (await renommer(alice.cookie, '   ')).json(), { titre: null })
  assert.equal((await renommer(alice.cookie, 'x'.repeat(201))).status, 400)
  assert.equal((await renommer(alice.cookie, 42)).status, 400)
  const bruno = await entrer(dev, 'Bruno')
  await post(dev, '/api/dev/acces', alice.cookie, { document: doc, personne: bruno.id, role: 'lecteur' })
  assert.equal((await renommer(bruno.cookie, 'Pirate')).status, 403)
})

test('fichiers : construits gardés un an (immutable), page revalidée ; bons types ; construit absent → 404', async () => {
  const wasm = await fetch(`${prod}/assets/compilateur-abc123.wasm`)
  assert.equal(wasm.status, 200)
  assert.equal(wasm.headers.get('content-type'), 'application/wasm')
  assert.equal(wasm.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  for (const [f, type] of [
    ['police-abc.ttf', 'font/ttf'],
    ['picto-abc.svg', 'image/svg+xml'],
    ['icone-abc.png', 'image/png'],
  ])
    assert.equal((await fetch(`${prod}/assets/${f}`)).headers.get('content-type'), type, f)
  for (const chemin of ['/', '/index.html', '/une-page-inconnue']) {
    const page = await fetch(`${prod}${chemin}`)
    assert.equal(page.status, 200, chemin)
    assert.equal(page.headers.get('cache-control'), 'no-cache', chemin)
  }
  const absent = await fetch(`${prod}/assets/ancien-chunk-xyz.js`)
  assert.equal(absent.status, 404)
  assert.equal((await absent.json()).code, 'introuvable')
})

test('en-têtes de sécurité, comme Docs : jamais dans le cadre d’un autre site ; l’API n’autorise rien', async () => {
  for (const chemin of ['/', '/assets/compilateur-abc123.wasm', '/api/config', '/api/moi', '/api/inconnue']) {
    const r = await fetch(`${prod}${chemin}`)
    assert.equal(r.headers.get('x-frame-options'), 'DENY', chemin)
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', chemin)
    assert.equal(r.headers.get('referrer-policy'), 'same-origin', chemin)
    const politique = r.headers.get('content-security-policy')
    if (chemin.startsWith('/api/')) assert.equal(politique, "default-src 'none'; frame-ancestors 'none'", chemin)
    else assert.equal(politique, null, `la page n’a pas de politique de contenu, comme celle de Docs (${chemin})`)
  }
})

test('un corps JSON coupé au milieu d’un caractère multi-octets arrive intact', async () => {
  const cookie = (await entrer(dev, 'Zoé')).cookie
  const corps = Buffer.from(JSON.stringify({ nom: 'Étienne Hélène' }))
  const coupe = corps.indexOf(0xc3) + 1 // entre les deux octets du premier « É »
  const url = new URL(`${dev}/api/moi`)
  const reponse = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json', 'content-length': corps.length },
      },
      (res) => {
        let brut = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (brut += d))
        res.on('end', () => resolve({ statut: res.statusCode, corps: JSON.parse(brut) }))
      },
    )
    req.on('error', reject)
    req.write(corps.subarray(0, coupe))
    setTimeout(() => req.end(corps.subarray(coupe)), 50)
  })
  assert.equal(reponse.statut, 200)
  assert.equal(reponse.corps.nom, 'Étienne Hélène')
})

test('la collaboration hors développement refuse de démarrer sans ses réglages', () => {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '../../application/collab/index.js')], {
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
  })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /réglage absent \(V2_/)
})

test('le jeton d’une connexion est masqué dans l’adresse journalisée', () => {
  assert.equal(adresseSansSecret('/api/connexion/abcDEF123_-?x=1'), '/api/connexion/***?x=1')
  assert.equal(adresseSansSecret('/api/moi'), '/api/moi')
})

test('back-office, rubrique Apparence : le modèle d’interface et la couleur de l’instance, lus par tous dans la configuration', async (t) => {
  const adresse = `admin-apparence-${Date.now().toString(36)}@exemple.fr`
  const base = await demarrer({ dev: false, administrateurs: adresse })
  const admin = await comptes.personneOuNouvelle(adresse)
  const simple = await comptes.personneOuNouvelle(`simple-apparence-${Date.now().toString(36)}@exemple.fr`)
  const cookie = (p) => `amend2_session=${creerJeton(BASE.secret, { id: p.id, nom: 'N' })}`
  const sql = postgres(POSTGRES, { max: 1, onnotice: () => {} })
  t.after(async () => {
    // Le réglage est commun à toute la base : on le retire après l'essai.
    await sql`delete from amend.reglages where cle = 'apparence'`
    await sql.end()
  })
  await sql`delete from amend.reglages where cle = 'apparence'`
  const lire = (p) => fetch(`${base}/api/admin/apparence`, p ? { headers: { cookie: cookie(p) } } : {})
  const choisir = (p, corps) =>
    fetch(`${base}/api/admin/apparence`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: cookie(p) },
      body: JSON.stringify(corps),
    })
  const config = async () => (await (await fetch(`${base}/api/config`)).json()).apparence
  assert.equal((await lire()).status, 401)
  assert.equal((await lire(simple)).status, 403)
  assert.equal((await choisir(simple, { modele: 'origine', couleur: 'vert' })).status, 403)
  const avant = await (await lire(admin)).json()
  assert.deepEqual(avant.apparence, { modele: 'atelier', couleur: 'vermillon' }, 'par défaut')
  assert.deepEqual(avant.modeles, ['atelier', 'origine'])
  assert.equal(avant.couleurs[0], 'vermillon')
  assert.deepEqual(await config(), { modele: 'atelier', couleur: 'vermillon' }, 'sans session aussi')
  for (const corps of [{ modele: 'inconnu', couleur: 'vert' }, { modele: 'origine', couleur: 'toString' }, {}]) {
    const r = await choisir(admin, corps)
    assert.equal(r.status, 400)
    assert.deepEqual(await r.json(), { code: 'apparence-inconnue' })
  }
  assert.equal((await choisir(admin, { modele: 'origine', couleur: 'petrole' })).status, 200)
  assert.deepEqual((await (await lire(admin)).json()).apparence, { modele: 'origine', couleur: 'petrole' })
  assert.deepEqual(await config(), { modele: 'origine', couleur: 'petrole' })
  // Une couleur retirée du design (montée de version) : celle par défaut, le modèle gardé.
  await comptes.definirReglage('apparence', { modele: 'origine', couleur: 'retiree' }, admin.id)
  assert.deepEqual(await config(), { modele: 'origine', couleur: 'vermillon' })
})
