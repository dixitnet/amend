// T6 : la v2 en ligne (v2.amend.ink, derrière le mot de passe de Caddy).
//   npm run test:en-ligne
// Identifiants : V2_IDENTIFIANT et V2_MOT_DE_PASSE (secrets du dépôt dans
// GitHub). Dans la session de Claude, le proxy ajoute lui-même le mot de passe
// mais ne laisse passer ni WebSocket ni port autre que 80 et 443 : ces tests-là
// s'y déclarent sautés, avec la raison.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import https from 'node:https'
import dns from 'node:dns/promises'
import * as playwright from 'playwright'

const BASE = (process.env.V2_BASE || 'https://v2.amend.ink').replace(/\/$/, '')
const MDP = process.env.V2_MOT_DE_PASSE
const IDENT = process.env.V2_IDENTIFIANT || 'sylvain'
const DERRIERE_PROXY = !!(process.env.HTTPS_PROXY || process.env.https_proxy)
const AUTH = MDP ? { authorization: `Basic ${Buffer.from(`${IDENT}:${MDP}`).toString('base64')}` } : {}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const sauf = (condition, raison, nom, f) => test(nom, (t) => (condition ? t.skip(raison) : f(t)))

/** Code HTTP d'une ouverture de WebSocket, sans mot de passe (fetch refuse l'en-tête Upgrade). */
function upgradeSansMotDePasse(chemin) {
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

sauf(
  !MDP,
  'sans V2_MOT_DE_PASSE (le proxy de la session ajoute le mot de passe à tout)',
  'sans mot de passe : 401 partout, WebSocket comprise',
  async () => {
    for (const chemin of ['/', '/api/config']) assert.equal((await fetch(`${BASE}${chemin}`)).status, 401, chemin)
    assert.equal(await upgradeSansMotDePasse('/collaboration/ws/v1/amend/essai'), 401, 'WebSocket')
  },
)

test('avec le mot de passe : page, configuration, HSTS', async () => {
  const r = await fetch(`${BASE}/`, { headers: AUTH })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/)
  const conf = await (await fetch(`${BASE}/api/config`, { headers: AUTH })).json()
  assert.equal(conf.collaboration, `${BASE.replace(/^https/, 'wss')}/collaboration/ws/v1/amend`)
})

test('session : cookie HttpOnly, SameSite et Secure', async () => {
  const r = await fetch(`${BASE}/api/dev/session`, {
    method: 'POST',
    headers: { ...AUTH, 'content-type': 'application/json' },
    body: JSON.stringify({ nom: 'Vérif en ligne' }),
  })
  assert.equal(r.status, 200)
  const c = r.headers.get('set-cookie')
  assert.match(c, /HttpOnly/)
  assert.match(c, /SameSite=Lax/)
  assert.match(c, /; Secure/)
})

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
  DERRIERE_PROXY,
  'le proxy de la session ne laisse pas passer les WebSocket',
  'parcours : deux navigateurs convergent, le texte survit au rechargement',
  async () => {
    const nav = await playwright[process.env.NAVIGATEUR || 'chromium'].launch()
    const doc = `verif-${Date.now().toString(36)}`
    // La première personne crée le document et en est propriétaire ; elle
    // donne ensuite le rôle d'éditeur aux suivantes.
    let proprietaire = null
    const post = (chemin, cookie, corps) =>
      fetch(`${BASE}${chemin}`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(corps),
      })
    const ouvrir = async (nom) => {
      if (proprietaire) {
        const { id } = await (await post('/api/dev/session', null, { nom })).json()
        const r = await post('/api/dev/acces', proprietaire, { document: doc, personne: id, role: 'editeur' })
        assert.equal(r.status, 200, `rôle d'éditeur pour ${nom}`)
      }
      const ctx = await nav.newContext({
        locale: 'fr-FR',
        httpCredentials: MDP ? { username: IDENT, password: MDP } : undefined,
      })
      const page = await ctx.newPage()
      await page.goto(`${BASE}/#${doc}`)
      await page.waitForSelector('input[name=nom], .bn-editor')
      if (await page.$('input[name=nom]')) {
        await page.fill('input[name=nom]', nom)
        await page.click('button[type=submit]')
      }
      await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Synchronisé', null, {
        timeout: 30000,
      })
      if (!proprietaire) {
        const c = (await ctx.cookies(BASE)).find((x) => x.name === 'amend2_session')
        proprietaire = `${c.name}=${c.value}`
      }
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
      const a = await ouvrir('Vérif A')
      const b = await ouvrir('Vérif B')
      await a.click('.bn-editor')
      await a.keyboard.type('Écrit en ligne.')
      await attendreTexte(b, 'Écrit en ligne.')
      await attendre(8000) // délai d'écriture en base en ligne : 5 s
      const c = await ouvrir('Vérif C')
      await attendreTexte(c, 'Écrit en ligne.')
    } finally {
      await nav.close()
    }
  },
)
