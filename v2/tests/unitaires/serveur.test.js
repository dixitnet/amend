// T3 : le serveur, en processus (requêtes HTTP réelles, sans navigateur ni
// service), rejoué sur les données piégées.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerServeur } from '../../application/serveur/index.js'
import { creerJeton } from '../../application/serveur/session.js'
import piegees from '../donnees/piegees.json' with { type: 'json' }

const statique = mkdtempSync(join(tmpdir(), 'v2-statique-'))
writeFileSync(join(statique, 'index.html'), '<!doctype html><title>index</title>')
const BASE = { secret: 's'.repeat(32), jetonInterne: 'jeton-interne-de-test', collaboration: 'ws://x', statique }
const serveurs = []
async function demarrer(conf) {
  const s = creerServeur({ ...BASE, ...conf })
  await new Promise((r) => s.listen(0, '127.0.0.1', r))
  serveurs.push(s)
  return `http://127.0.0.1:${s.address().port}`
}
let dev, prod
before(async () => {
  dev = await demarrer({ dev: true })
  prod = await demarrer({ dev: false, cookieSecure: true })
})
after(() => serveurs.forEach((s) => s.close()))

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
  const bon = creerJeton(BASE.secret, { id: 'dev-a', nom: 'A' })
  const [corps, signature] = bon.split('.')
  const autreCorps = Buffer.from(JSON.stringify({ id: 'dev-b', nom: 'B' })).toString('base64url')
  assert.equal((await moi(dev, `amend2_session=${autreCorps}.${signature}`)).status, 401, 'contenu modifié')
  assert.equal((await moi(dev, `amend2_session=${creerJeton('autre-secret', { id: 'x', nom: 'x' })}`)).status, 401)
  assert.equal((await moi(dev, `amend2_session=${corps}.${signature}`)).status, 200, 'le bon jeton passe')
})

test('requêtes malformées : codes, jamais de plantage', async () => {
  const mal = await fetch(`${dev}/api/dev/session`, { method: 'POST', body: '{"nom": "Alice"' })
  assert.equal(mal.status, 400)
  assert.equal((await mal.json()).code, 'requete-invalide')
  const gros = await fetch(`${dev}/api/dev/session`, {
    method: 'POST',
    body: JSON.stringify({ nom: 'a'.repeat(20000) }),
  })
  assert.equal((await gros.json()).code, 'requete-trop-grosse')
  assert.equal((await fetch(`${dev}/api/inconnue`)).status, 404)
  assert.equal((await fetch(`${dev}/api/config`, { method: 'DELETE' })).status, 405)
})

test('route interne des droits : jeton exigé, comparé exactement', async () => {
  const url = `${dev}/api/interne/droits?document=essai&personne=dev-a`
  assert.equal((await fetch(url)).status, 403)
  assert.equal((await fetch(url, { headers: { 'x-amend-interne': 'faux' } })).status, 403)
  const r = await fetch(url, { headers: { 'x-amend-interne': BASE.jetonInterne } })
  assert.deepEqual(await r.json(), { droit: 'ecriture' })
  const sansJeton = await demarrer({ jetonInterne: '' })
  assert.equal(
    (await fetch(`${sansJeton}/api/interne/droits?document=a&personne=b`, { headers: { 'x-amend-interne': '' } }))
      .status,
    403,
  )
})

test('fichiers : pas de sortie du dossier statique', async () => {
  for (const chemin of ['/../../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc%2fpasswd']) {
    const r = await fetch(`${dev}${chemin}`)
    assert.doesNotMatch(await r.text(), /root:/, chemin)
  }
})
