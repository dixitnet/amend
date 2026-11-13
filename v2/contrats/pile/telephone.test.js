// T5 : le format S (téléphone, vertical) dans un vrai navigateur, d'après la
// maquette validée (docs/v2-format-S.md) : bandeau, lecture à l'ouverture,
// modification d'un appui, « Terminer », plan, menu « … », partage plein
// écran, titre modifiable, listes empilées.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, attendre, panneau } from './outils.mjs'

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

test('format S : le correcteur s’ouvre en Lire ; un appui passe en Corriger, sa frappe est une suggestion ; « Terminer » ramène en Lire', async () => {
  const doc = docTest('s-correcteur')
  // L'éditrice, sur grand écran, écrit le texte.
  const p = await ouvrirSur(nav, pile.url, 'Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Il faisait nuit.')
  assert.equal(await modifiable(c), false, 'Lire à l’ouverture')
  const boite = await c.locator('.bn-inline-content').first().boundingBox()
  await c.mouse.click(boite.x + boite.width - 2, boite.y + boite.height / 2)
  assert.equal(await modifiable(c), true, 'un appui passe en Corriger')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/Carla ajoute/.test(await panneau(p));) await attendre(200)
  assert.match(await panneau(p), /Carla ajoute «\s?Ajout\s?»/, 'une suggestion, chez l’éditrice')
  await c.getByRole('button', { name: 'Terminer' }).click()
  assert.equal(await modifiable(c), false, '« Terminer » ramène en Lire')
  await attendreTexte(c, 'Il faisait nuit.')
  await p.context().close()
  await c.context().close()
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
  // Firefox arrondit au 1/60 de pixel (25,5938 px) : comparaison à 0,05 px près.
  const taille = () =>
    p.evaluate(() =>
      parseFloat(getComputedStyle(document.querySelector("[data-content-type='heading'] .bn-inline-content")).fontSize),
    )
  const juste = (t) => Math.abs(t - 25.6) < 0.05
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && !juste(await taille());) await attendre(100)
  const t = await taille()
  assert.ok(juste(t), `taille du titre : ${t} px, attendu 25,6 px`)
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
    [
      'Ajouter aux favoris',
      'Copier le lien',
      'Passer en mode Éditer',
      'Passer en mode Corriger',
      'Partager',
      'Exporter…',
      'Dupliquer',
      'Mes documents',
      '100\u202F%',
      '150\u202F%',
      '200\u202F%',
      'Supprimer',
    ],
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

test('format S : un lecteur ne passe pas en modification ; l’accueil ouvre le dernier document ; le volet « Documents »', async () => {
  const doc = docTest('s-lecteur')
  const p = await ouvrir('Paule', doc)
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  await l.click('.bn-editor')
  assert.equal(await modifiable(l), false)
  assert.equal(await l.getByRole('button', { name: 'Terminer' }).count(), 0)
  assert.equal(await l.getByRole('button', { name: 'Renommer' }).count(), 0, 'un lecteur ne renomme pas')
  // Plus de page « Mes documents » : l'accueil rouvre le dernier document.
  await p.goto(`${pile.url}/#`)
  await p.waitForFunction((d) => decodeURIComponent(location.hash.slice(1)) === d, doc)
  await p.getByRole('button', { name: 'Plan et documents' }).click()
  await p.getByRole('dialog').getByRole('tab', { name: 'Documents' }).click()
  await p.getByRole('dialog').getByRole('searchbox', { name: 'Rechercher un document' }).waitFor()
  await p.getByRole('dialog').getByRole('button', { name: 'Nouveau', exact: true }).waitFor()
  await l.context().close()
  await p.context().close()
})

test('format S : l’état de synchronisation est un picto du bandeau, les favoris et la taille du texte sont dans le menu « … »', async () => {
  const doc = docTest('s-synchro')
  const p = await ouvrir('Paule', doc)
  // Le picto dit l'état (nom accessible) ; ni étoile devant le titre, ni texte « Synchronisé » en bas de page.
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  assert.equal(
    await p
      .locator('header')
      .getByRole('button', { name: /favoris/ })
      .count(),
    0,
    'plus d’étoile dans le bandeau',
  )
  assert.equal(await p.getByText('Synchronisé', { exact: true }).count(), 0, 'plus de texte d’état en bas de page')
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Ajouter aux favoris' }).waitFor()
  // Taille du texte : 100, 150 et 200 % au format S (plus de 50 %).
  assert.equal(await p.getByRole('menuitem', { name: '50\u202F%', exact: true }).count(), 0)
  await p.getByRole('menuitem', { name: '200\u202F%', exact: true }).click()
  const taille = () =>
    p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.bn-editor .bn-inline-content')).fontSize))
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && (await taille()) < 30;) await attendre(100)
  assert.ok((await taille()) >= 30, 'le texte à 200 % est deux fois plus grand')
  // Les favoris se basculent depuis le menu.
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Ajouter aux favoris' }).click()
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Retirer des favoris' }).waitFor()
})

test('format S : un zoom mémorisé à 50 % (autre format) est ramené à 100 %, le palier le plus proche', async () => {
  const doc = docTest('s-zoom-memorise')
  const p = await ouvrir('Paule', doc)
  await p.evaluate(() => localStorage.setItem('amend.zoom', '50'))
  await p.reload()
  await p.getByRole('button', { name: 'Autres actions' }).click()
  const coche = p
    .getByRole('menuitemradio', { checked: true })
    .or(p.getByRole('menuitem', { name: '100\u202F%', exact: true }))
  await coche.first().waitFor()
  assert.equal(await p.locator('[data-amend-zoom]').first().getAttribute('data-amend-zoom'), '100')
})

test('format S : sans réseau (mode avion), le picto passe à « Hors ligne », puis revient à « Synchronisé »', async () => {
  const doc = docTest('s-avion')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  await p.context().setOffline(true)
  await p.getByRole('status', { name: 'Hors ligne' }).waitFor()
  await p.context().setOffline(false)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor({ timeout: 30000 })
})

test('format S : un serveur qui ne répond pas, au-delà de 10 secondes, est annoncé « Hors ligne »', async () => {
  const doc = docTest('s-serveur-muet')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  // Le réseau est là, mais le serveur de collaboration ne répond plus : les connexions sont refusées.
  let muet = true
  await p.routeWebSocket(/.*/, (ws) => (muet ? ws.close() : ws.connectToServer()))
  await p.reload()
  await p.getByRole('status', { name: 'Synchronisation…' }).waitFor()
  // Avant le délai, le picto dit encore « Synchronisation… » ; après, « Hors ligne ».
  assert.equal(await p.getByRole('status', { name: 'Hors ligne' }).count(), 0, 'pas avant le délai')
  await p.getByRole('status', { name: 'Hors ligne' }).waitFor({ timeout: 20000 })
  // Le serveur revient : le fournisseur se reconnecte, le picto repasse à « Synchronisé ».
  muet = false
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor({ timeout: 60000 })
})
