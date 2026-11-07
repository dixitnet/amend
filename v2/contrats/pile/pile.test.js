// Contrats 2, 4 et 5, et parcours de bout en bout de l'étape 1, sur la pile
// complète (PostgreSQL, Redis, y/hub, serveur, client construit, Chromium).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createRequire } from 'node:module'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'

const { chromium } = createRequire(import.meta.url)('playwright')
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const docTest = (nom) => `contrat-${nom}-${Date.now().toString(36)}`
let pile, nav

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ delaiPersistance: 500 })
  nav = await chromium.launch()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

async function session(nom) {
  const r = await fetch(`${pile.url}/api/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom }),
  })
  assert.equal(r.status, 200)
  return r.headers.get('set-cookie').split(';')[0]
}

async function ouvrir(nom, docId) {
  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const page = await ctx.newPage()
  await page.goto(`${pile.url}/#${docId}`)
  await page.fill('input[name=nom]', nom)
  await page.click('button[type=submit]')
  await page.waitForSelector('.bn-editor')
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent === 'Synchronisé')
  return page
}
/** Le texte des blocs, un par ligne, sans les étiquettes des curseurs distants. */
const texte = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.bn-editor .bn-inline-content')]
      .map((el) => {
        const copie = el.cloneNode(true)
        copie.querySelectorAll('.ProseMirror-widget').forEach((c) => c.remove())
        return copie.textContent.replace(/\u2060/g, '')
      })
      .filter((l, i, tout) => l || i < tout.length - 1)
      .join('\n'),
  )
async function attendreTexte(page, attendu, delai = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < delai) {
    if ((await texte(page)) === attendu) return
    await attendre(100)
  }
  assert.equal(await texte(page), attendu)
}

/** Ouverture d'un WebSocket vers y/hub, sans navigateur : le code HTTP de la réponse. */
function upgrade(docId, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${pile.collab}/collaboration/ws/v1/amend/${docId}`, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('amend-contrat-v2').toString('base64'),
        ...(cookie ? { cookie } : {}),
      },
    })
    req.on('upgrade', (res, socket) => {
      socket.destroy()
      resolve(101)
    })
    req.on('response', (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', reject)
    req.end()
  })
}

test('contrat 4 : y/hub refuse une connexion sans session, accepte une session valide', async () => {
  const doc = docTest('session')
  assert.equal(await upgrade(doc, null), 401)
  assert.equal(await upgrade(doc, 'amend2_session=faux.jeton'), 401)
  assert.equal(await upgrade(doc, await session('Contrat')), 101)
})

test('deux navigateurs éditent le même document et convergent', async () => {
  const doc = docTest('convergence')
  const a = await ouvrir('Alice', doc)
  const b = await ouvrir('Bruno', doc)
  await a.click('.bn-editor')
  await a.keyboard.type('Première phrase, élégante.')
  await attendreTexte(b, 'Première phrase, élégante.')
  await b.click('.bn-inline-content')
  await b.keyboard.press('End')
  await b.keyboard.type(' Suite de Bruno.')
  await attendreTexte(a, 'Première phrase, élégante. Suite de Bruno.')
  await a.context().close()
  await b.context().close()
})

test('contrats 2 et 4 : le document se lit côté serveur, et survit au redémarrage', async () => {
  const doc = docTest('persistance')
  const a = await ouvrir('Alice', doc)
  await a.click('.bn-editor')
  await a.keyboard.type('Texte à garder')
  await a.keyboard.press('Enter')
  await a.keyboard.type('Deuxième paragraphe')
  await attendre(400)
  await a.context().close()

  // Lecture côté serveur : l'état Yjs 14 tenu par y/hub, relu en blocs BlockNote.
  const cookie = await session('Lecteur')
  const r = await fetch(`${pile.collab}/collaboration/ydoc/v1/amend/${doc}`, {
    headers: { cookie, accept: 'application/json' },
  })
  assert.equal(r.status, 200)
  const { doc: etat } = await r.json()
  assert.equal(texteDesBlocs(lireBlocs(Buffer.from(etat, 'base64'))), 'Texte à garder\nDeuxième paragraphe')

  // Redémarrage du serveur et de y/hub, après écriture dans PostgreSQL.
  await attendre(2500)
  await pile.redemarrer()
  const b = await ouvrir('Bruno', doc)
  await attendreTexte(b, 'Texte à garder\nDeuxième paragraphe')
  await b.context().close()
})

test('contrat 5 : les jetons de design atteignent l’éditeur (couleur et police)', async () => {
  const a = await ouvrir('Alice', docTest('jetons'))
  const lire = () =>
    a.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.bn-editor'))
      return { fond: s.backgroundColor, police: s.fontFamily }
    })
  const avant = await lire()
  assert.match(avant.police, /Iowan Old Style|Source Serif/, 'la police des jetons atteint l’éditeur')
  await a.evaluate(() => document.documentElement.style.setProperty('--couleur-fond', 'rgb(1, 2, 3)'))
  assert.equal((await lire()).fond, 'rgb(1, 2, 3)')
  await a.context().close()
})

test('l’interface suit la langue du navigateur', async () => {
  const ctx = await nav.newContext({ locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(pile.url)
  await page.waitForSelector('input[name=nom]')
  assert.equal(await page.textContent('h1'), 'Development sign-in')
  assert.equal(await page.getAttribute('html', 'lang'), 'en')
  await ctx.close()
})
