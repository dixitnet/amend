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
  texte,
  attendreEtat,
  donnerRole,
  oublierDocuments,
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
  // Une session valide sans rôle sur le document : refusée ; avec, acceptée.
  const contrat = await session('Contrat')
  assert.equal(await upgrade(doc, contrat), 403)
  const creation = await fetch(`${pile.url}/api/dev/documents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: contrat },
    body: JSON.stringify({ document: doc }),
  })
  assert.equal(creation.status, 201)
  assert.equal(await upgrade(doc, contrat), 101)
  assert.equal(await upgrade(doc, await session('Autre')), 403)
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
  await donnerRole(pile.url, doc, 'Lecteur', 'lecteur')
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
  // La table des accès est en mémoire jusqu'à l'étape 6 : perdue au redémarrage,
  // le document est recréé par la première personne qui l'ouvre (en développement).
  oublierDocuments()
  const b = await ouvrir('Bruno', doc)
  await attendreTexte(b, 'Texte à garder\nDeuxième paragraphe')
  await b.context().close()
})

test('contrat 5 : l’éditeur est dans le fournisseur Mantine de l’application, en clair comme en sombre', async () => {
  for (const schema of ['light', 'dark']) {
    const ctx = await nav.newContext({ colorScheme: schema, locale: 'fr-FR' })
    const page = await ctx.newPage()
    await page.goto(`${pile.url}/#${docTest(`mantine-${schema}`)}`)
    await page.fill('input[name=nom]', 'Alice')
    await page.click('button[type=submit]')
    await page.waitForSelector('.bn-editor')
    const lu = await page.evaluate(() => ({
      page: document.documentElement.getAttribute('data-mantine-color-scheme'),
      editeur: document.querySelector('.bn-container').getAttribute('data-mantine-color-scheme'),
      // Les variables de Mantine sont posées par le fournisseur de l'application.
      variables: getComputedStyle(document.documentElement).getPropertyValue('--mantine-color-body').trim() !== '',
      police: getComputedStyle(document.querySelector('.bn-editor')).fontFamily,
    }))
    assert.equal(lu.page, schema, 'le fournisseur Mantine suit le système')
    assert.equal(lu.editeur, schema, 'l’éditeur suit le même schéma')
    assert.ok(lu.variables, 'variables de Mantine présentes')
    assert.match(lu.police, /Inter/, 'police de BlockNote telle quelle')
    await ctx.close()
  }
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

test('droits : un correcteur lit, ne peut pas écrire, et l’interface le lui dit', async () => {
  const doc = docTest('correcteur')
  const p = await ouvrir('Paule', doc)
  const c = await ouvrir('Carl', doc, { role: 'correcteur' })
  assert.equal(await p.getByText('Lecture seule').count(), 0, 'pas de mention pour la propriétaire')
  assert.equal(await c.getByText('Lecture seule').count(), 1)
  assert.equal(await c.getAttribute('.bn-editor', 'contenteditable'), 'false')

  await p.click('.bn-editor')
  await p.keyboard.type('Texte de Paule.')
  await attendreTexte(c, 'Texte de Paule.')

  // Le correcteur tape quand même : l'interface ne bouge pas.
  await c.click('.bn-inline-content')
  await c.keyboard.type(' Ajout interdit.')
  assert.equal(await texte(c), 'Texte de Paule.')

  // Et s'il force l'éditeur (outils de développement), y/hub refuse l'écriture :
  // rien n'arrive chez la propriétaire ni au rechargement.
  await c.evaluate(() => document.querySelector('.bn-editor').setAttribute('contenteditable', 'true'))
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await c.keyboard.type(' Forcé.')
  await attendre(2000)
  assert.equal(await texte(p), 'Texte de Paule.')
  await c.reload()
  await attendreEtat(c, 'Synchronisé')
  await attendreTexte(c, 'Texte de Paule.')
  await p.context().close()
  await c.context().close()
})

test('droits : sans rôle, un document existant ne s’ouvre pas, avec un message traduit', async () => {
  const doc = docTest('ferme')
  const p = await ouvrir('Paule', doc)
  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const intrus = await ctx.newPage()
  await intrus.goto(`${pile.url}/#${doc}`)
  await intrus.fill('input[name=nom]', 'Intrus')
  await intrus.click('button[type=submit]')
  await intrus.waitForFunction(() =>
    /n’existe pas, ou vous n’y avez pas accès/.test(document.querySelector('[role=status]')?.textContent),
  )
  assert.equal(await intrus.$('.bn-editor'), null)
  await ctx.close()
  await p.context().close()
})
