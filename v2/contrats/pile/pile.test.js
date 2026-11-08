// Contrats 2, 4 et 5, et parcours de bout en bout de l'étape 1, sur la pile
// complète (PostgreSQL, Redis, y/hub, serveur, client construit, Chromium).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'
import {
  attendre,
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreTexte,
  session as sessionSur,
} from './outils.mjs'

let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)
const session = (nom) => sessionSur(pile.url, nom)

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ delaiPersistance: 500 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

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

  // Lecture côté serveur : l'état Yjs 14 tenu par y/hub, relu en blocs
  // BlockNote ; on attend activement que la dernière frappe y soit arrivée.
  const cookie = await session('Lecteur')
  const lireCoteServeur = async () => {
    const r = await fetch(`${pile.collab}/collaboration/ydoc/v1/amend/${doc}`, {
      headers: { cookie, accept: 'application/json' },
    })
    assert.equal(r.status, 200)
    return texteDesBlocs(lireBlocs(Buffer.from((await r.json()).doc, 'base64')))
  }
  const attendu = 'Texte à garder\nDeuxième paragraphe'
  let lu = ''
  for (let t0 = Date.now(); Date.now() - t0 < 8000 && lu !== attendu; await attendre(200)) lu = await lireCoteServeur()
  assert.equal(lu, attendu)
  await a.context().close()

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
