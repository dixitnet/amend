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
  // Le correcteur est en Suggérer : ni lien ni gras dans sa palette ; l'éditrice
  // les a (Sylvain, 11/11/2026 : « le bouton ajouter un lien est encore accessible »).
  assert.equal(await c.locator('.bn-formatting-toolbar [data-test="createLink"]').count(), 0, 'pas de lien en Suggérer')
  assert.equal(await c.locator('.bn-formatting-toolbar [data-test="bold"]').count(), 0, 'pas de gras en Suggérer')
  assert.equal(await p.locator('.bn-formatting-toolbar [data-test="createLink"]').count(), 1, 'le lien pour l’éditrice')
  assert.equal(await p.locator('.bn-formatting-toolbar [data-test="bold"]').count(), 1, 'le gras pour l’éditrice')
  // Le volet droit est ouvert d'office (suggestions) ou s'ouvre par le bouton du bandeau.
  const ouvrirVolet = async (page) => {
    if (!(await page.getByRole('tab', { name: /^Suggestions/ }).isVisible()))
      await page.getByRole('button', { name: 'Suggestions, commentaires et Margo (IA)' }).click()
  }
  await ouvrirVolet(p)
  assert.equal(await ongletMargo(p).count(), 1)
  await ouvrirVolet(c)
  assert.equal(await ongletMargo(c).count(), 0, 'pas d’onglet Margo pour le correcteur')
  await p.context().close()
  await c.context().close()
})

test('« Corriger » : l’onglet Margo s’ouvre sur la demande ; sans modèle, Margo se dit indisponible', async (t) => {
  if (REEL) return t.skip('essai réel demandé : le modèle est configuré')
  const doc = docTest('margo-indisponible')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Les enfant jouent dans la cour.')
  await selectionner(p)
  await boutonCorriger(p).click()
  await p.getByRole('tab', { name: 'Margo (IA)', selected: true }).waitFor()
  await p.getByText('Corriger la sélection').waitFor()
  await p.getByRole('alert').filter({ hasText: 'Margo est indisponible' }).waitFor()
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
  await p.getByRole('tab', { name: /^Suggestions/ }).click()
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
