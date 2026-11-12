// T5 : l'interface des formats M et L (étape 6b, docs/v2-formats-M-L.md) dans
// un vrai navigateur : plan du document, volets (un seul à la fois sur iPad
// en portrait), volet droit ouvert d'office quand une suggestion arrive,
// lecture d'abord sur écran tactile.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, attendre, panneau } from './outils.mjs'

let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4386, portCollab: 4486 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

const inactif = (page, selecteur) => page.locator(selecteur).evaluate((e) => e.inert)
const GAUCHE = '.mantine-AppShell-navbar'
const DROITE = '.mantine-AppShell-aside'

/** Une personne connectée, dans un contexte choisi (taille, écran tactile). */
const ouvrirDans = (contexte, nom, docId) => ouvrir(nom, docId, { contexte })

test('plan : les titres du document dans le volet, et aller à un titre', async () => {
  const p = await ouvrir('Paule', docTest('plan'))
  await p.click('.bn-editor')
  await p.keyboard.type('## Première partie')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Un paragraphe.')
  await p.keyboard.press('Enter')
  await p.keyboard.type('### Un détail')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Fin.')
  const premiere = p.getByRole('tabpanel').getByRole('button', { name: 'Première partie' })
  await premiere.waitFor()
  assert.equal(await premiere.getAttribute('data-niveau'), '2')
  assert.equal(await p.getByRole('button', { name: 'Un détail' }).getAttribute('data-niveau'), '3')
  await premiere.click()
  await attendre(300)
  const ou = await p.evaluate(
    () => getSelection().anchorNode?.parentElement?.closest('[data-content-type]')?.textContent ?? '',
  )
  assert.equal(ou, 'Première partie', 'le curseur est dans le titre choisi')
  // Tout en bas, sous le dernier titre : le plan désigne le dernier titre passé.
  for (let i = 0; i < 40; i++) await p.keyboard.press('Enter')
  await p.keyboard.type('Bas de page.')
  await p.evaluate(() => {
    const zone = document.querySelector('.amend-coquille-defilement')
    zone.scrollTo(0, zone.scrollHeight)
  })
  const courant = p.getByRole('button', { name: 'Un détail' })
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && !(await courant.getAttribute('data-active'));)
    await attendre(100)
  assert.ok(await courant.getAttribute('data-active'), 'le dernier titre passé est le titre courant')
  await p.context().close()
})

test('volets : deux ensemble sur Mac ; un seul à la fois sur iPad en portrait', async () => {
  const doc = docTest('volets')
  const mac = await ouvrir('Paule', doc)
  assert.equal(await inactif(mac, GAUCHE), false, 'volet gauche ouvert au départ sur Mac')
  await mac.getByRole('button', { name: 'Suggestions, commentaires et Margo (IA)' }).click()
  await attendre(300)
  assert.equal(await inactif(mac, DROITE), false)
  assert.equal(await inactif(mac, GAUCHE), false, 'les deux ensemble')
  await mac.context().close()

  const ipad = await ouvrirDans({ viewport: { width: 820, height: 1180 } }, 'Ines', doc)
  assert.equal(await inactif(ipad, GAUCHE), true, 'volet gauche fermé au départ en portrait')
  await ipad.getByRole('button', { name: 'Plan et documents' }).click()
  await attendre(300)
  assert.equal(await inactif(ipad, GAUCHE), false)
  await ipad.getByRole('button', { name: 'Suggestions, commentaires et Margo (IA)' }).click()
  await attendre(300)
  assert.equal(await inactif(ipad, DROITE), false)
  assert.equal(await inactif(ipad, GAUCHE), true, 'ouvrir le droit ferme le gauche')
  await ipad.getByRole('button', { name: 'Suggestions, commentaires et Margo (IA)' }).click()
  await attendre(300)
  assert.equal(await inactif(ipad, GAUCHE), false, 'le gauche fermé d’office se rouvre')
  await ipad.context().close()
})

test('volet droit : il s’ouvre d’office quand une suggestion arrive ; en relecture, leur nombre', async () => {
  const doc = docTest('office')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Il faisait nuit.')
  assert.equal(await inactif(p, DROITE), true, 'fermé sans suggestion')
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await c.keyboard.type(' Noire.')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && (await inactif(p, DROITE));) await attendre(200)
  assert.equal(await inactif(p, DROITE), false, 'ouvert d’office')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/Carla ajoute/.test(await panneau(p));) await attendre(200)
  assert.match(await panneau(p), /Carla ajoute/)
  for (const t0 = Date.now(); Date.now() - t0 < 5000; await attendre(200))
    if (await p.locator('.mantine-Indicator-indicator').getByText('1', { exact: true }).count()) break
  assert.ok(await p.locator('.mantine-Indicator-indicator').getByText('1', { exact: true }).count())
  await p.context().close()
  await c.context().close()
})

test('lecture d’abord sur écran tactile : un appui passe en modification, « Terminer » repasse en lecture', async () => {
  const doc = docTest('tactile')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Un texte à toucher.')
  await attendre(500)
  const ipad = await ouvrirDans({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }, 'Ines', doc)
  await attendreTexte(ipad, 'Un texte à toucher.')
  const modifiable = () => ipad.locator('.bn-editor').getAttribute('contenteditable')
  assert.equal(await modifiable(), 'false', 'ouvert en lecture')
  assert.equal(await ipad.getByRole('button', { name: 'Terminer' }).count(), 0)
  await ipad.locator('.bn-inline-content').first().tap()
  await attendre(300)
  assert.equal(await modifiable(), 'true', 'en modification après l’appui')
  await ipad.getByRole('button', { name: 'Terminer' }).click()
  await attendre(300)
  assert.equal(await modifiable(), 'false', 'de retour en lecture')
  await p.context().close()
  await ipad.context().close()
})
