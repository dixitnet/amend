// T6 : la v2 en ligne (v2.amend.ink), depuis le 09/11/2026 sans mot de passe
// de Caddy ni entrée de développement : service fermé (lien par courriel), et
// comptes d'essai ouverts par la clé d'essai, seulement en @essai.amend.invalid.
//   npm run test:en-ligne
// Clé : V2_JETON_ESSAI (secret du dépôt dans GitHub). Dans la session de Claude,
// le proxy ajoute lui-même la clé à toute requête vers v2.amend.ink, et ne
// laisse passer ni WebSocket ni port autre que 80 et 443 : ces tests-là s'y
// déclarent sautés, avec la raison.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import https from 'node:https'
import dns from 'node:dns/promises'
import * as playwright from 'playwright'

const BASE = (process.env.V2_BASE || 'https://v2.amend.ink').replace(/\/$/, '')
const CLE = process.env.V2_JETON_ESSAI
const DERRIERE_PROXY = !!(process.env.HTTPS_PROXY || process.env.https_proxy)
/** L'en-tête de la clé d'essai : donné ici en CI ; ajouté par le proxy dans la session de Claude. */
const ESSAI = CLE ? { 'x-amend-essai-token': CLE } : {}
const AVEC_CLE = !!CLE || DERRIERE_PROXY
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const sauf = (condition, raison, nom, f) => test(nom, (t) => (condition ? t.skip(raison) : f(t)))

/** Code HTTP d'une ouverture de WebSocket sans session (fetch refuse l'en-tête Upgrade). */
function upgradeSansSession(chemin) {
  return new Promise((resolve, reject) => {
    const req = https.request(`${BASE}${chemin}`, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('amend-en-ligne-v2').toString('base64'),
      },
    })
    req.on('upgrade', (res, socket) => (socket.destroy(), resolve(101)))
    req.on('response', (res) => (res.resume(), resolve(res.statusCode)))
    req.on('error', reject)
    req.end()
  })
}

/** Une session d'essai : rend le cookie et l'adresse en @essai.amend.invalid. */
async function sessionEssai(nom) {
  const r = await fetch(`${BASE}/api/essai/session`, {
    method: 'POST',
    headers: { ...ESSAI, 'content-type': 'application/json' },
    body: JSON.stringify({ nom }),
  })
  assert.equal(r.status, 200, `session d'essai pour ${nom}`)
  const { courriel } = await r.json()
  return { cookie: r.headers.get('set-cookie').split(';')[0], entete: r.headers.get('set-cookie'), courriel }
}

test('sans mot de passe : page, configuration (dev fermé), HSTS, noindex', async () => {
  const r = await fetch(`${BASE}/`)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/)
  assert.match(r.headers.get('x-robots-tag') || '', /noindex/)
  // En-têtes de sécurité (10/11/2026), à travers Caddy.
  assert.equal(r.headers.get('x-frame-options'), 'DENY')
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  const api = await fetch(`${BASE}/api/config`)
  assert.equal(api.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'")
  const conf = await (await fetch(`${BASE}/api/config`)).json()
  assert.equal(conf.collaboration, `${BASE.replace(/^https/, 'wss')}/collaboration/ws/v1/amend`)
  assert.equal(conf.dev, false)
})

test('entrée de développement fermée ; rien sans session', async () => {
  const dev = await fetch(`${BASE}/api/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom: 'X' }),
  })
  assert.equal(dev.status, 404)
  assert.equal((await fetch(`${BASE}/api/dev/courriers`)).status, 404)
  assert.equal((await fetch(`${BASE}/api/documents`)).status, 401)
  assert.equal((await fetch(`${BASE}/api/admin/systeme`)).status, 401)
})

sauf(
  DERRIERE_PROXY,
  'le proxy de la session ajoute la clé d’essai à toute requête',
  'sans clé d’essai, la route d’essai n’existe pas',
  async () => {
    const r = await fetch(`${BASE}/api/essai/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-amend-essai-token': 'f'.repeat(64) },
      body: JSON.stringify({ nom: 'X' }),
    })
    assert.equal(r.status, 404)
  },
)

sauf(
  DERRIERE_PROXY,
  'le proxy de la session ne laisse pas passer les WebSocket',
  'WebSocket sans session : refusée',
  async () => {
    assert.notEqual(await upgradeSansSession('/collaboration/ws/v1/amend/essai'), 101)
  },
)

sauf(
  !AVEC_CLE,
  'sans V2_JETON_ESSAI',
  'session d’essai : cookie HttpOnly, SameSite et Secure ; jamais administratrice',
  async () => {
    const s = await sessionEssai('TEST en ligne')
    assert.match(s.courriel, /@essai\.amend\.invalid$/)
    assert.match(s.entete, /HttpOnly/)
    assert.match(s.entete, /SameSite=Lax/)
    assert.match(s.entete, /; Secure/)
    const moi = await (await fetch(`${BASE}/api/moi`, { headers: { cookie: s.cookie } })).json()
    assert.equal(moi.admin, false)
    assert.equal((await fetch(`${BASE}/api/admin/systeme`, { headers: { cookie: s.cookie } })).status, 403)
  },
)

sauf(
  DERRIERE_PROXY,
  'la session de Claude ne joint que les ports 80 et 443',
  'les ports internes du VPS sont fermés depuis Internet',
  async () => {
    const [{ address }] = await dns.lookup(new URL(BASE).hostname, { all: true })
    for (const port of [4300, 4400, 5432, 6379]) {
      const ouvert = await new Promise((r) => {
        const s = net.connect({ host: address, port, timeout: 4000 })
        s.on('connect', () => (s.destroy(), r(true)))
        s.on('timeout', () => (s.destroy(), r(false)))
        s.on('error', () => r(false))
      })
      assert.equal(ouvert, false, `port ${port} ouvert`)
    }
  },
)

sauf(
  DERRIERE_PROXY || !CLE,
  DERRIERE_PROXY ? 'le proxy de la session ne laisse pas passer les WebSocket' : 'sans V2_JETON_ESSAI',
  'parcours : deux navigateurs convergent, le texte survit au rechargement',
  async () => {
    const nav = await playwright[process.env.NAVIGATEUR || 'chromium'].launch()
    const a = await sessionEssai('TEST en ligne A')
    const b = await sessionEssai('TEST en ligne B')
    const appel = (methode, chemin, cookie, corps) =>
      fetch(`${BASE}${chemin}`, {
        method: methode,
        headers: { 'content-type': 'application/json', cookie },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      })
    // A crée le document (« TEST — … ») et donne le rôle d'éditeur à B, par son
    // adresse d'essai (aucun courrier ne part vers une adresse .invalid).
    const { id: doc } = await (await appel('POST', '/api/documents', a.cookie, { titre: 'TEST — T6 en ligne' })).json()
    const partage = await appel('POST', `/api/documents/${doc}/acces`, a.cookie, {
      courriel: b.courriel,
      role: 'editeur',
    })
    assert.equal(partage.status, 200, 'rôle d’éditeur pour B')
    const ouvrir = async (s) => {
      const ctx = await nav.newContext({ locale: 'fr-FR' })
      const [nom, valeur] = s.cookie.split(/=(.*)/s)
      await ctx.addCookies([{ name: nom, value: valeur, url: BASE, secure: true, httpOnly: true }])
      const page = await ctx.newPage()
      await page.goto(`${BASE}/#${doc}`)
      // L'état de la connexion, en attribut de la coquille (formats M et L).
      await page.waitForFunction(
        () => document.querySelector('[data-connexion]')?.dataset.connexion === 'connecte',
        null,
        {
          timeout: 30000,
        },
      )
      return page
    }
    const lire = (p) =>
      p.evaluate(
        () => document.querySelector('.bn-editor .bn-inline-content')?.textContent.replace(/\u2060/g, '') ?? '',
      )
    const attendreTexte = async (p, attendu) => {
      for (const t0 = Date.now(); Date.now() - t0 < 15000; await attendre(200))
        if ((await lire(p)).startsWith(attendu)) return
      assert.equal(await lire(p), attendu)
    }
    try {
      const pa = await ouvrir(a)
      const pb = await ouvrir(b)
      await pa.click('.bn-editor')
      await pa.keyboard.type('Écrit en ligne.')
      await attendreTexte(pb, 'Écrit en ligne.')
      await attendre(8000) // délai d'écriture en base en ligne : 5 s
      await pb.reload()
      await attendreTexte(pb, 'Écrit en ligne.')
    } finally {
      await nav.close()
      await appel('DELETE', `/api/documents/${doc}`, a.cookie)
    }
  },
)
