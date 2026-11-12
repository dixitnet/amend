// T5 : parcours de panne dans un vrai navigateur (lots « stabiliser,
// fiabiliser » du 11/11/2026) : session expirée en cours d'usage, liste des
// documents injoignable, noms d'auteurs introuvables, Margo occupée, lien de
// connexion déjà utilisé. Les pannes sont simulées par l'interception de
// Playwright (`page.route`) ou en effaçant les cookies ; la coupure de y/hub
// en pleine frappe est déjà couverte par robustesse.test.js.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendre,
  attendreEtat,
  attendreTexte,
  texte,
  choisirMode,
  modeChoisi,
  nouveauDocument,
  panneau as panneauDe,
} from './outils.mjs'

let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4330, portCollab: 4430 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** La route `GET /api/documents` seule (ni ses sous-routes, ni les équipes). */
const LISTE_DES_DOCUMENTS = /\/api\/documents(\?.*)?$/

test('session expirée en cours d’usage : un geste qui appelle le serveur recharge la page une fois, sur l’écran de connexion', async () => {
  const p = await ouvrir('Paule', docTest('expiree'))
  const ctx = p.context()
  let chargements = 0
  let moi = 0
  p.on('load', () => chargements++)
  p.on('request', (r) => {
    if (new URL(r.url()).pathname === '/api/moi') moi++
  })
  await ctx.clearCookies()
  await p.getByRole('button', { name: 'Ajouter aux favoris' }).click()
  await p.getByLabel('Adresse de courriel').waitFor({ timeout: 15000 })
  // Pas de boucle : on laisse du temps à un second rechargement, s'il y en avait un.
  await attendre(4000)
  assert.equal(chargements, 1, 'la page ne se recharge qu’une fois')
  assert.equal(moi, 1, '/api/moi n’est demandé qu’une fois')
  assert.equal(await p.getByLabel('Adresse de courriel').count(), 1, 'l’écran de connexion reste affiché')
  await ctx.close()
})

test('session expirée : « Nouveau document » mène de même à l’écran de connexion, une seule fois', async () => {
  const p = await ouvrir('Paule', docTest('expiree-nouveau'))
  const ctx = p.context()
  let chargements = 0
  p.on('load', () => chargements++)
  await ctx.clearCookies()
  await p.getByRole('tab', { name: 'Documents' }).click()
  await p.getByRole('tabpanel', { name: 'Documents' }).getByRole('button', { name: 'Nouveau document' }).click()
  await p.getByLabel('Adresse de courriel').waitFor({ timeout: 15000 })
  await attendre(4000)
  assert.equal(chargements, 1, 'la page ne se recharge qu’une fois')
  await ctx.close()
})

test('liste des documents injoignable (accueil) : un message d’erreur, pas « Chargement… » ; le nouvel essai à 5 s reprend la page', async () => {
  const p = await ouvrir('Paule', docTest('accueil-panne'))
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  await p.evaluate((d) => localStorage.setItem('amend.dernierDocument', d), docId)
  const q = await p.context().newPage()
  let demandes = 0
  await q.route(LISTE_DES_DOCUMENTS, (route) => {
    demandes++
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })
  await q.goto(`${pile.url}/#`)
  await q.getByText('Une erreur est survenue', { exact: false }).first().waitFor({ timeout: 10000 })
  assert.equal(await q.getByText('Chargement…').count(), 0, 'ne reste pas sur « Chargement… »')
  // Rétablie : le nouvel essai automatique (5 s) mène au document.
  await q.unroute(LISTE_DES_DOCUMENTS)
  await q.waitForSelector('.bn-editor', { timeout: 15000 })
  assert.equal(decodeURIComponent(new URL(q.url()).hash.slice(1)), docId)
  assert.ok(demandes >= 1)
  await p.context().close()
})

test('liste des documents injoignable (volet d’un document) : le message d’erreur à la place de la liste, puis la liste au nouvel essai', async () => {
  const p = await ouvrir('Paule', docTest('volet-panne'))
  const q = await p.context().newPage()
  await q.route(LISTE_DES_DOCUMENTS, (route) => route.abort())
  const autre = docTest('volet-panne-bis')
  await q.goto(`${pile.url}/#${autre}`)
  await q.waitForSelector('.bn-editor')
  await q.getByRole('tab', { name: 'Documents' }).click()
  const panneau = q.getByRole('tabpanel', { name: 'Documents' })
  await panneau.getByText('Le serveur ne répond pas', { exact: false }).waitFor({ timeout: 10000 })
  assert.equal(await panneau.locator('a[href^="#"]').count(), 0, 'pas de liste')
  await q.unroute(LISTE_DES_DOCUMENTS)
  await panneau.locator(`a[href="#${autre}"]`).waitFor({ timeout: 15000 })
  assert.equal(await panneau.getByText('Le serveur ne répond pas', { exact: false }).count(), 0)
  await p.context().close()
})

test('noms d’auteurs introuvables : peu de requêtes /api/personnes en 10 s, et la suggestion s’affiche (auteur inconnu)', async () => {
  const doc = docTest('noms')
  const phrase = 'Il faisait nuit sur la ville.'
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type(phrase)
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, phrase)
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout')
  // La suggestion est arrivée chez l'éditrice (noms disponibles).
  if ((await modeChoisi(p)) !== 'Relire') await choisirMode(p, 'Relire')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/Carla ajoute/.test(await panneauDe(p)); await attendre(200));
  assert.match(await panneauDe(p), /Carla ajoute/)

  // L'éditrice ouvre le document sur une page neuve, noms coupés.
  const q = await p.context().newPage()
  let requetes = 0
  await q.route('**/api/personnes*', (route) => {
    requetes++
    return route.abort()
  })
  await q.goto(`${pile.url}/#${doc}`)
  await q.waitForSelector('.bn-editor')
  await attendreEtat(q, 'connecte')
  if ((await modeChoisi(q)) !== 'Relire') await choisirMode(q, 'Relire')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/ajoute/.test(await panneauDe(q)); await attendre(200));
  assert.match(await panneauDe(q), /Quelqu’un ajoute/, 'la ligne s’affiche, auteur inconnu')
  await attendre(10000)
  assert.ok(requetes <= 3, `${requetes} requêtes vers /api/personnes en 10 s (3 au plus)`)
  await p.context().close()
  await c.context().close()
})

test('Margo occupée (429) : le message « Margo répond déjà… » s’affiche et la page reste utilisable', async () => {
  const p = await ouvrir('Paule', docTest('margo-occupee'))
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await p.route(/\/api\/documents\/[^/]+\/margo$/, (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'margo-occupee' }) }),
  )
  await p.click('.bn-editor .bn-inline-content', { clickCount: 3 })
  await p.waitForSelector('.bn-formatting-toolbar')
  await p.locator('.bn-formatting-toolbar button', { hasText: 'Corriger' }).click()
  await p.getByRole('alert').filter({ hasText: 'Margo répond déjà' }).waitFor()
  // La page reste utilisable : on peut encore écrire.
  await p.click('.bn-editor')
  await p.keyboard.press('Control+End')
  await p.keyboard.type(' Suite.')
  assert.match(await texte(p), /Suite\./, 'on peut encore écrire')
  await p.context().close()
})

test('lien de connexion déjà utilisé : la seconde ouverture dit que le lien n’est plus valable, sans page blanche', async () => {
  const p = await ouvrir('Paule', `t5-pannes-${Date.now().toString(36)}`)
  await nouveauDocument(p)
  await p.getByRole('button', { name: 'Partager' }).click()
  const adresse = `lien-${randomUUID().slice(0, 8)}@exemple.fr`
  await p.getByLabel('Adresse de courriel').fill(adresse)
  await p.getByLabel('Rôle', { exact: true }).first().click()
  await p.getByRole('option', { name: 'correcteur' }).click()
  await p.getByRole('button', { name: 'Inviter' }).click()
  await p.getByText(`Invitation envoyée à ${adresse}.`).waitFor()
  let chemin
  for (const t0 = Date.now(); Date.now() - t0 < 8000 && !chemin; await attendre(200)) {
    const courriers = await (await fetch(`${pile.url}/api/dev/courriers`)).json()
    const m = courriers.reverse().find((x) => x.a === adresse)
    if (m) chemin = new URL(m.texte.match(/https?:\/\/\S+/)[0]).pathname
  }
  assert.ok(chemin, 'un courrier est arrivé')

  const premier = await nav.newContext({ locale: 'fr-FR' })
  const a = await premier.newPage()
  await a.goto(`${pile.url}${chemin}`)
  await a.getByLabel('Votre nom').fill('Carla')
  await a.getByRole('button', { name: 'Continuer' }).click()
  await a.waitForSelector('.bn-editor')

  const second = await nav.newContext({ locale: 'fr-FR' })
  const b = await second.newPage()
  await b.goto(`${pile.url}${chemin}`)
  await b.getByText('Ce lien de connexion n’est plus valable').waitFor()
  assert.ok((await b.locator('body').innerText()).trim().length > 0, 'la page n’est pas blanche')
  await premier.close()
  await second.close()
  await p.context().close()
})
