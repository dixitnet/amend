// T5 : Margo dans un vrai navigateur (étape 8) : l'onglet Margo et le bouton
// « Corriger » pour l'éditeur, rien pour le correcteur ; sans modèle
// configuré, un message clair. Avec MARGO_ESSAI_REEL=1 (et la clé de
// Scaleway dans V2_SCALEWAY_CLE), un vrai « Corriger » avec DeepSeek : la
// correction arrive en suggestion signée « Margo (IA) ».
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, attendre } from './outils.mjs'

let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)
const REEL = process.env.MARGO_ESSAI_REEL === '1'

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4371, portCollab: 4471 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** Sélectionne tout le texte du premier paragraphe (la palette s'ouvre). */
async function selectionner(page) {
  await page.click('.bn-editor .bn-inline-content', { clickCount: 3 })
  await page.waitForSelector('.bn-formatting-toolbar')
}
const boutonCorriger = (page) => page.locator('.bn-formatting-toolbar button', { hasText: 'Corriger' })
const ongletMargo = (page) => page.getByRole('tab', { name: 'Margo (IA)' })

test('éditeur : onglet Margo et « Corriger » ; correcteur : ni l’un ni l’autre', async () => {
  const doc = docTest('margo-droits')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Les enfant jouent dans la cour.')
  await selectionner(p)
  assert.equal(await boutonCorriger(p).count(), 1, 'le bouton est dans la palette de l’éditeur')
  await selectionner(c)
  assert.equal(await boutonCorriger(c).count(), 0, 'pas de « Corriger » pour le correcteur')
  // Le correcteur est en Corriger : ni lien ni gras dans sa palette ; l'éditrice
  // les a (Sylvain, 11/11/2026 : « le bouton ajouter un lien est encore accessible »).
  assert.equal(await c.locator('.bn-formatting-toolbar [data-test="createLink"]').count(), 0, 'pas de lien en Corriger')
  assert.equal(await c.locator('.bn-formatting-toolbar [data-test="bold"]').count(), 0, 'pas de gras en Corriger')
  assert.equal(await p.locator('.bn-formatting-toolbar [data-test="createLink"]').count(), 1, 'le lien pour l’éditrice')
  assert.equal(await p.locator('.bn-formatting-toolbar [data-test="bold"]').count(), 1, 'le gras pour l’éditrice')
  // Le volet droit est ouvert d'office (suggestions) ou s'ouvre par le bouton du bandeau.
  const ouvrirVolet = async (page) => {
    if (!(await page.getByRole('tab', { name: /^Corrections/ }).isVisible()))
      await page.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  }
  await ouvrirVolet(p)
  assert.equal(await ongletMargo(p).count(), 1)
  await ouvrirVolet(c)
  assert.equal(await ongletMargo(c).count(), 0, 'pas d’onglet Margo pour le correcteur')
  await p.context().close()
  await c.context().close()
})

test('« Corriger » : aucun volet ne s’ouvre, un message dit le début ; sans modèle, Margo se dit indisponible', async (t) => {
  if (REEL) return t.skip('essai réel demandé : le modèle est configuré')
  const doc = docTest('margo-indisponible')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByText('Margo corrige la sélection').waitFor()
  await p.getByRole('alert').filter({ hasText: 'Margo est indisponible' }).waitFor()
  // Docs : l'IA travaille dans le texte, sans panneau (Sylvain, 14/11/2026).
  assert.equal(
    await p.getByRole('tab', { name: 'Margo (IA)', selected: true }).count(),
    0,
    'aucun volet ouvert sur Margo',
  )
  // La demande est dans le fil de Margo, portée « sur la sélection ».
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  await p.getByText('Corriger la sélection').waitFor()
  await p.getByText('Sur la sélection').waitFor()
  await p.context().close()
})

test('« Corriger » : une réponse simulée de Margo, le bilan s’affiche dans un message (sans modèle réel)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const doc = docTest('margo-bilan')
  const p = await ouvrir('Paule', doc)
  await p.route('**/margo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        { type: 'debut', blocs: [] },
        { type: 'texte', texte: 'J’ai corrigé le passage.' },
        { type: 'fin', corrections: 1, commentaires: 0, refus: 0, arret: 'longueur' },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n'),
    }),
  )
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  const messages = p.locator('.mantine-Notification-root')
  await messages.filter({ hasText: /1 correction/ }).waitFor()
  await messages.filter({ hasText: 'Réponse coupée' }).waitFor()
  await p.context().close()
})

test('Margo au travail, volet ouvert : trois points dans une bulle de Margo (Sylvain, 15/11/2026)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const doc = docTest('margo-points')
  const p = await ouvrir('Paule', doc)
  await p.route('**/margo', async (route) => {
    await attendre(3000)
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"margo-indisponible"}' })
  })
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  await p.locator('[role=status] .mantine-Loader-root').waitFor()
  await p.context().close()
})

test('fil de Margo en bulles : la personne à droite, Margo à gauche ; « Nouvelle conversation » dans le menu « … » (Sylvain, 15/11/2026)', async (t) => {
  if (REEL) return t.skip('essai réel demandé')
  const doc = docTest('margo-bulles')
  const p = await ouvrir('Paule', doc)
  await p.route('**/margo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        { type: 'debut', blocs: [] },
        { type: 'texte', texte: 'J’ai corrigé le passage.' },
        { type: 'fin', corrections: 1, commentaires: 0, refus: 0, arret: null },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n'),
    }),
  )
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await p.getByRole('tab', { name: 'Margo (IA)' }).click()
  const moi = p.locator('li').filter({ hasText: 'Corriger la sélection' }).locator('.mantine-Paper-root')
  const elle = p.locator('li').filter({ hasText: 'J’ai corrigé le passage.' }).locator('.mantine-Paper-root')
  const [a, b] = [await moi.boundingBox(), await elle.boundingBox()]
  assert.ok(a.x + a.width > b.x + b.width, 'la bulle de la personne finit plus à droite que celle de Margo')
  assert.ok(b.x < a.x, 'la bulle de Margo commence plus à gauche')
  // La portée au-dessus de la saisie (4a).
  await p.getByText('Sur la sélection').waitFor()
  await p.getByRole('region', { name: 'Margo (IA)' }).getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Nouvelle conversation' }).click()
  await p.getByText('Demandez à Margo').waitFor()
  await p.context().close()
})

test('essai réel (MARGO_ESSAI_REEL=1) : « Corriger » pose une suggestion signée Margo (IA)', async (t) => {
  if (!REEL) return t.skip('essai réel non demandé (MARGO_ESSAI_REEL=1)')
  const doc = docTest('margo-reel')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await attendre(1500)
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByText(/1 correction/).waitFor({ timeout: 120000 })
  await p.getByRole('tab', { name: /^Corrections/ }).click()
  // Yjs garde les lettres communes : « enfant » → « enfants » est un ajout de « s ».
  const ligne = p.getByText(/Margo \(IA\) (ajoute|remplace)/)
  try {
    await ligne.waitFor({ timeout: 20000 })
  } finally {
    console.log(await p.evaluate(() => document.querySelector('aside')?.innerText.replace(/\n+/g, ' / ')))
  }
  // L'auteur et le contenu de la ligne (A10 de l'audit) : Margo ajoute le « s » manquant.
  assert.match(await ligne.first().innerText(), /^Margo \(IA\) ajoute «\s?s\s?»$/)
  await p.context().close()
})
