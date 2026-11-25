// T5 : l'interface des formats M et L (étape 6b, docs/v2-formats-M-L.md) dans
// un vrai navigateur : plan du document, volets (un seul à la fois sur iPad
// en portrait), volet droit ouvert d'office quand une suggestion arrive,
// lecture d'abord sur écran tactile.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreTexte,
  attendre,
  panneau,
  voletDocuments,
} from './outils.mjs'

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
  await mac.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await attendre(300)
  assert.equal(await inactif(mac, DROITE), false)
  assert.equal(await inactif(mac, GAUCHE), false, 'les deux ensemble')
  await mac.context().close()

  const ipad = await ouvrirDans({ viewport: { width: 820, height: 1180 } }, 'Ines', doc)
  assert.equal(await inactif(ipad, GAUCHE), true, 'volet gauche fermé au départ en portrait')
  await ipad.getByRole('button', { name: 'Plan et documents' }).click()
  await attendre(300)
  assert.equal(await inactif(ipad, GAUCHE), false)
  await ipad.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
  await attendre(300)
  assert.equal(await inactif(ipad, DROITE), false)
  assert.equal(await inactif(ipad, GAUCHE), true, 'ouvrir le droit ferme le gauche')
  await ipad.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' }).click()
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

test('bandeau : l’état de la mise à jour en picto, la présence au milieu, chaque rond de sa couleur (17/11/2026)', async () => {
  const doc = docTest('bandeau-presence')
  const p = await ouvrir('Paule', doc)
  await p.getByRole('status', { name: 'Synchronisé' }).waitFor()
  const c = await ouvrir('Carla', doc)
  const autre = p.getByRole('button', { name: 'Aller au curseur de Carla' })
  await autre.waitFor()
  // Au milieu du bandeau : le centre du rond est dans le tiers central de la fenêtre.
  const [boite, largeur] = [await autre.boundingBox(), p.viewportSize().width]
  const centre = boite.x + boite.width / 2
  assert.ok(centre > largeur / 3 && centre < (2 * largeur) / 3, `présence au milieu (${centre} sur ${largeur})`)
  // Les couleurs : celles de la palette de Mantine (variables), pas le gris par défaut.
  const fond = (loc) => loc.evaluate((e) => e.getAttribute('style') ?? '')
  assert.match(await fond(autre), /--avatar-bg/, 'le rond de Carla a une couleur')
  const compte = p.getByRole('button', { name: 'Compte' }).locator('.mantine-Avatar-root')
  assert.match(await fond(compte), /--avatar-bg/, 'le rond du compte a la couleur de la personne')
  await p.context().close()
  await c.context().close()
})

test('présence : un clic sur le rond d’une personne amène le texte à son curseur (18/11/2026)', async () => {
  const doc = docTest('presence-curseur')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  for (let i = 0; i < 60; i++) {
    await p.keyboard.type(`Ligne ${i} du texte.`)
    await p.keyboard.press('Enter')
  }
  const b = await ouvrir('Bruno', doc)
  await b.getByText('Ligne 59 du texte.').waitFor()
  await b.click('.bn-editor')
  await b.keyboard.press('Control+End')
  await b.keyboard.type(' Fin de Bruno.')
  await p.getByText('Fin de Bruno.').waitFor()
  // Paule remonte tout en haut : le curseur de Bruno n'est plus à l'écran.
  await p.evaluate(() =>
    document.querySelectorAll('*').forEach((e) => e.scrollHeight > e.clientHeight && (e.scrollTop = 0)),
  )
  const aLEcran = () =>
    p
      .locator('.bn-collaboration-cursor__base')
      .first()
      .evaluate((e) => {
        const r = e.getBoundingClientRect()
        return r.bottom > 0 && r.top < window.innerHeight
      })
  assert.equal(await aLEcran(), false, 'le curseur de Bruno est hors de l’écran')
  await p.getByRole('button', { name: 'Aller au curseur de Bruno' }).click()
  for (const t0 = Date.now(); Date.now() - t0 < 5000 && !(await aLEcran()); await attendre(200));
  assert.equal(await aLEcran(), true, 'le texte a défilé jusqu’au curseur de Bruno')
  await p.context().close()
  await b.context().close()
})

test('volet « Documents » : le premier niveau (Mes documents…) en gras, les documents dessous en graisse ordinaire (20/11/2026)', async () => {
  const page = await ouvrir('Paule', docTest('arbre-gras'))
  const volet = await voletDocuments(page)
  const graisse = (l) => l.evaluate((e) => getComputedStyle(e).fontWeight)
  // Chaque entrée du premier niveau (Mes documents, et selon la personne Favoris, ses équipes…) est en gras.
  const premiers = volet.locator('.mantine-NavLink-root[data-amend-premier-niveau] .mantine-NavLink-label')
  await premiers.first().waitFor()
  const noms = await premiers.allInnerTexts()
  assert.ok(noms.includes('Mes documents'), noms.join(', '))
  for (let k = 0; k < noms.length; k++) assert.equal(await graisse(premiers.nth(k)), '700', noms[k])
  // Un document, sous son espace déplié : graisse ordinaire.
  const document = volet.locator('a.mantine-NavLink-root .mantine-NavLink-label').first()
  await document.waitFor()
  assert.notEqual(await graisse(document), '700')
  if (process.env.CAPTURE) await volet.screenshot({ path: `${process.env.CAPTURE}/arbre-gras.png` })
  await page.context().close()
})

test('modèle d’interface « Épure » (25/11/2026) : texte à 20 px, blanc entre les blocs, titres dans la police de l’interface, sans cadre, texte large de 720 px ; 17 px au format S', async () => {
  const doc = docTest('epure')
  // Le modèle choisi au back-office arrive par la configuration : la pile n'en a pas, on le pose ici.
  const enEpure = async (page) => {
    await page.route('**/api/config', async (route) => {
      const reponse = await route.fetch()
      const config = await reponse.json()
      await route.fulfill({
        response: reponse,
        json: { ...config, apparence: { ...config.apparence, modele: 'epure' } },
      })
    })
    await page.reload()
    await page.waitForSelector('.bn-editor')
    await page.waitForFunction(() => document.documentElement.dataset.amendInterface === 'epure')
  }
  const p = await ouvrir('Paule', doc, { contexte: { viewport: { width: 1440, height: 900 } } })
  await p.click('.bn-editor')
  await p.keyboard.type('# Un titre')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Premier paragraphe.')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Second paragraphe.')
  await p.keyboard.press('Enter')
  await p.keyboard.type('## Un intertitre')
  await p.keyboard.press('Enter')
  await p.keyboard.type('- Un')
  await p.keyboard.press('Enter')
  await p.keyboard.type('Deux')
  await attendre(500)
  // D'abord « Atelier », le modèle par défaut : la page est un cadre blanc ombré.
  const lire = (page) =>
    page.evaluate(() => {
      const style = (e) => getComputedStyle(e)
      const blocs = [...document.querySelectorAll('.bn-editor .bn-block-group > .bn-block-outer')]
      const titre = document.querySelector("[data-content-type='heading'] .bn-inline-content")
      const paragraphe = document.querySelector("[data-content-type='paragraph'] .bn-inline-content")
      return {
        corps: parseFloat(style(paragraphe).fontSize),
        interligne: parseFloat(style(paragraphe).lineHeight) / parseFloat(style(paragraphe).fontSize),
        policeTexte: style(paragraphe).fontFamily,
        policeTitre: style(titre).fontFamily,
        policeInterface: style(document.body).fontFamily,
        graisseTitre: style(titre).fontWeight,
        entreParagraphes: parseFloat(style(blocs[2]).marginTop),
        avantIntertitre: parseFloat(style(blocs[3]).marginTop),
        avantListe: parseFloat(style(blocs[4]).marginTop),
        dansLaListe: parseFloat(style(blocs[5]).marginTop),
        ombre: style(document.querySelector('[data-amend-colonne]')).boxShadow,
        trait: style(document.querySelector('.mantine-AppShell-header')).borderBottomWidth,
        largeurDuTexte: Math.round(paragraphe.closest('.bn-block-content').getBoundingClientRect().width),
        compteur: style(document.querySelector('[data-amend-compteur]')).color,
        texte: style(document.body).color,
      }
    })
  const atelier = await lire(p)
  assert.equal(atelier.corps, 17)
  assert.notEqual(atelier.ombre, 'none', '« Atelier » garde son cadre')
  assert.equal(atelier.entreParagraphes, 0)
  await enEpure(p)
  const epure = await lire(p)
  assert.equal(epure.corps, 20, 'corps xl de Mantine')
  assert.ok(Math.abs(epure.interligne - 1.6) < 0.01, `interligne ${epure.interligne}`)
  assert.match(epure.policeTexte, /Source Serif 4/)
  assert.equal(epure.policeTitre, epure.policeInterface, 'titres dans la police de l’interface')
  assert.equal(epure.graisseTitre, '700')
  assert.equal(epure.entreParagraphes, 16, 'un blanc md entre deux blocs')
  assert.equal(epure.avantIntertitre, 48, '1,5 × xl devant un titre')
  assert.equal(epure.avantListe, 16, 'le blanc devant une liste')
  assert.equal(epure.dansLaListe, 0, 'les éléments d’une liste restent serrés')
  assert.equal(epure.ombre, 'none', 'pas de cadre de page')
  assert.equal(epure.trait, atelier.trait, 'le trait sous le bandeau est gardé')
  assert.notEqual(epure.trait, '0px')
  // Le texte à la largeur sm de Mantine : 36 fois le corps, comme « Atelier » (612 px à 17 px).
  assert.equal(epure.largeurDuTexte, 720)
  assert.equal(atelier.largeurDuTexte, 612)
  assert.notEqual(epure.compteur, epure.texte, 'compteur atténué')
  // En sombre, le texte reste lisible : clair sur le fond sombre de Mantine (défaut vu sur « Atelier » le 11/11).
  await p.emulateMedia({ colorScheme: 'dark' })
  await p.waitForFunction(() => document.documentElement.dataset.mantineColorScheme === 'dark')
  const sombre = await p.evaluate(() => {
    const clarte = (c) =>
      c
        .match(/\d+/g)
        .slice(0, 3)
        .reduce((a, n) => a + Number(n), 0) / 3
    return {
      texte: clarte(getComputedStyle(document.querySelector('.bn-editor')).color),
      fond: clarte(getComputedStyle(document.body).backgroundColor),
    }
  })
  assert.ok(sombre.texte > 180 && sombre.fond < 60, `texte clair sur fond sombre : ${JSON.stringify(sombre)}`)
  await p.context().close()
  // Au format S, le corps reste à 17 px.
  const s = await ouvrir('Quentin', doc, { contexte: { viewport: { width: 390, height: 844 }, hasTouch: true } })
  await enEpure(s)
  assert.equal(
    await s.evaluate(() =>
      parseFloat(
        getComputedStyle(document.querySelector("[data-content-type='paragraph'] .bn-inline-content")).fontSize,
      ),
    ),
    17,
  )
  await s.context().close()
})
