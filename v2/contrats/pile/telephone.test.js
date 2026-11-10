// T5 : le format S (téléphone, vertical) dans un vrai navigateur, d'après la
// maquette validée (docs/v2-format-S.md) : bandeau, lecture à l'ouverture,
// modification d'un appui, « Terminer », plan, menu « … », partage plein
// écran, titre modifiable, listes empilées.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, attendre } from './outils.mjs'

let pile, nav
/** Un téléphone en portrait (taille d'un iPhone 13). */
const TELEPHONE = { viewport: { width: 390, height: 844 }, hasTouch: true }
const ouvrir = (nom, docId, o = {}) => ouvrirSur(nav, pile.url, nom, docId, { ...o, contexte: TELEPHONE })

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4380, portCollab: 4480 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

const modifiable = (page) => page.evaluate(() => document.querySelector('.bn-editor')?.contentEditable === 'true')

test('format S : bandeau, lecture à l’ouverture, un appui pour modifier, « Terminer » pour revenir', async () => {
  const doc = docTest('s-lecture')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('button', { name: 'Plan et documents' }).waitFor()
  await p.getByRole('button', { name: 'Autres actions' }).waitFor()
  assert.equal(await p.getByRole('button', { name: 'Historique' }).count(), 0, 'pas d’historique sur téléphone (Docs)')
  assert.equal(await modifiable(p), false, 'lecture à l’ouverture')
  await p.click('.bn-editor')
  assert.equal(await modifiable(p), true, 'un appui passe en modification')
  await p.getByRole('button', { name: 'Terminer' }).waitFor()
  await p.keyboard.type('Écrit sur téléphone.')
  await attendreTexte(p, 'Écrit sur téléphone.')
  // Un second appui, au milieu du texte : le curseur va à l'endroit touché.
  await p.getByRole('button', { name: 'Terminer' }).click()
  const boite = await p.locator('.bn-inline-content').first().boundingBox()
  await p.mouse.click(boite.x + 3, boite.y + boite.height / 2)
  await p.keyboard.type('X')
  await attendreTexte(p, 'XÉcrit sur téléphone.')
  await p.getByRole('button', { name: 'Terminer' }).click()
  assert.equal(await modifiable(p), false, '« Terminer » revient en lecture')
  await p.getByRole('button', { name: 'Terminer' }).waitFor({ state: 'detached' })
  await attendre(1500)
  await p.reload()
  await attendreTexte(p, 'XÉcrit sur téléphone.')
  await p.context().close()
})

test('format S : le plan liste les titres ; le menu « … » ; le partage en plein écran ; le titre se renomme', async () => {
  const doc = docTest('s-plan')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('# Chapitre un')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Du texte.')
  await p.getByRole('button', { name: 'Terminer' }).click()
  // Titres réduits comme Docs à 560 px et moins (réglage css.telephone.titres) : 1,6 rem au niveau 1.
  // (mesurée une fois la transition de BlockNote finie : sinon 25,56 px).
  const taille = () =>
    p.evaluate(
      () => getComputedStyle(document.querySelector("[data-content-type='heading'] .bn-inline-content")).fontSize,
    )
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && (await taille()) !== '25.6px';) await attendre(100)
  assert.equal(await taille(), '25.6px')
  await p.getByRole('button', { name: 'Plan et documents' }).click()
  const titre = p.getByRole('dialog').getByRole('button', { name: 'Chapitre un' })
  await titre.waitFor()
  await titre.click()
  await p.getByRole('dialog').waitFor({ state: 'detached' })
  // Menu « … » : ce qui marche seulement (plan du format S, 3.1).
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem').first().waitFor()
  const elements = await p.getByRole('menuitem').allInnerTexts()
  assert.deepEqual(
    elements.map((e) => e.trim()),
    ['Copier le lien', 'Partager', 'Mes documents', 'Supprimer'],
  )
  await p.getByRole('menuitem', { name: 'Partager' }).click()
  await p.getByRole('dialog', { name: 'Partage' }).getByLabel('Adresse de courriel').waitFor()
  await p.keyboard.press('Escape')
  await p.getByRole('dialog', { name: 'Partage' }).waitFor({ state: 'detached' })
  // Le titre, dans le bandeau, se renomme d'un appui.
  // (fenêtre de saisie, comme en L et M, plutôt que la boîte du navigateur).
  await p.getByRole('button', { name: 'Renommer' }).click()
  await p.getByRole('textbox', { name: 'Titre du document' }).fill('Mon livre')
  await p.getByRole('button', { name: 'Valider' }).click()
  await p.getByRole('banner').getByText('Mon livre').waitFor()
  await p.context().close()
})

test('format S : un lecteur ne passe pas en modification ; les listes sont empilées', async () => {
  const doc = docTest('s-lecteur')
  const p = await ouvrir('Paule', doc)
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  await l.click('.bn-editor')
  assert.equal(await modifiable(l), false)
  assert.equal(await l.getByRole('button', { name: 'Terminer' }).count(), 0)
  assert.equal(await l.getByRole('button', { name: 'Renommer' }).count(), 0, 'un lecteur ne renomme pas')
  await p.goto(`${pile.url}/#`)
  await p.getByRole('heading', { name: 'Mes documents' }).waitFor()
  assert.equal(await p.getByRole('table').count(), 0, 'pas de tableau sur téléphone')
  assert.ok((await p.locator('article').count()) > 0, 'des fiches empilées')
  await p.getByRole('combobox').first().waitFor()
  await l.context().close()
  await p.context().close()
})
