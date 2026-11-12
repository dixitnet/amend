// T5 : l'éditeur du livre dans un vrai navigateur (étape 4) : typographie à
// la frappe et au collage, Retour arrière, schéma du livre (menus et collage).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fr } from '@blocknote/core/locales'
import { creerTraducteur } from '../../i18n/index.js'
import { dateDuJour } from '../../domaine/index.js'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreTexte,
  texte,
  attendre,
  NAVIGATEUR,
  choisirMode,
} from './outils.mjs'

const I = '\u00A0' // espace insécable
const F = '\u202F' // espace fine insécable
let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4360, portCollab: 4460 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** Une page prête à écrire dans le premier paragraphe d'un document neuf. */
async function pageEcriture(nom) {
  const page = await ouvrir('Alice', docTest(nom))
  await page.click('.bn-editor')
  return page
}

/** Les tests du presse-papiers fabriquent l'événement de copie ou de collage.
 * Firefox ignore les données d'un tel événement fabriqué (CI du 08/11/2026 :
 * rien n'est collé, rien n'est copié) : limite de la méthode de test, pas de
 * l'éditeur. Le vrai collage dans Firefox est dans la recette à la main. */
const PRESSE_PAPIERS = {
  skip: NAVIGATEUR === 'firefox' && 'Firefox ignore les données d’un événement de presse-papiers fabriqué',
}

/** Colle du contenu dans l'éditeur, comme le ferait le presse-papiers. */
const coller = (page, donnees) =>
  page.evaluate((donnees) => {
    const dt = new DataTransfer()
    for (const [type, valeur] of Object.entries(donnees)) dt.setData(type, valeur)
    document
      .querySelector('.bn-editor [contenteditable=true], .bn-editor')
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, donnees)

test('frappe : les cinq règles au moment où l’on tape', async () => {
  const page = await pageEcriture('frappe')
  await page.keyboard.type('Il dit "l\'été" ; puis : quoi ? Non ! Fin...')
  await attendreTexte(page, `Il dit «${I}l’été${I}»${F}; puis${I}: quoi${F}? Non${F}! Fin…`)
  await page.context().close()
})

test('frappe : rien devant un signe collé, rien dans une adresse, 12:30 intact', async () => {
  const page = await pageEcriture('frappe-intacte')
  // (« :) » tapé n'est pas dans la liste : au moment où l'on tape « : », rien
  // ne dit qu'une parenthèse suivra ; un Retour arrière rend le « : » tapé.)
  await page.keyboard.type("mot; 12:30 http://exemple.org/l'a?b=1")
  await attendreTexte(page, "mot; 12:30 http://exemple.org/l'a?b=1")
  await page.context().close()
})

test('frappe : un Retour arrière juste après rend ce qui a été tapé', async () => {
  const page = await pageEcriture('retour-arriere')
  await page.keyboard.type("l'")
  await attendreTexte(page, 'l’')
  await page.keyboard.press('Backspace')
  await attendreTexte(page, "l'")
  await page.keyboard.type(' Quoi ?')
  await attendreTexte(page, `l' Quoi${F}?`)
  await page.keyboard.press('Backspace')
  await attendreTexte(page, "l' Quoi ?")
  // Un second Retour arrière efface normalement.
  await page.keyboard.press('Backspace')
  await attendreTexte(page, "l' Quoi ")
  await page.context().close()
})

test('collage : texte brut et HTML typographiés et en NFC ; adresse d’un lien intacte', PRESSE_PAPIERS, async () => {
  const page = await pageEcriture('collage')
  await coller(page, { 'text/plain': 'Il a dit "oui" : été ...' })
  await attendreTexte(page, `Il a dit «${I}oui${I}»${I}: été …`)
  await page.keyboard.press('Enter')
  await coller(page, {
    'text/html': '<p>Lien <a href="http://x.org/l\'a">http://x.org/l\'a</a> et "ici" ?</p>',
    'text/plain': 'Lien http://x.org/l\'a et "ici" ?',
  })
  await attendre(500)
  const t = await texte(page)
  assert.match(t, /http:\/\/x\.org\/l'a/, 'l’adresse du lien n’est pas touchée')
  assert.ok(t.includes(`«${I}ici${I}»${F}?`), `typographié : ${JSON.stringify(t)}`)
  await page.context().close()
})

test('schéma du livre : le menu « / » ne propose que les blocs retenus', async () => {
  // Les libellés attendus viennent du dictionnaire de BlockNote (clés stables),
  // pas d'un texte écrit ici : le test survit à un changement de libellé amont.
  const libelle = (cle) => fr.slash_menu[cle].title
  const page = await pageEcriture('menu')
  await page.keyboard.type('/')
  await page.waitForSelector('.bn-suggestion-menu')
  const titres = await page.$$eval('.bn-suggestion-menu-item', (els) =>
    els.map((e) => e.querySelector('.bn-mt-suggestion-menu-item-title, [class*=title]')?.textContent ?? e.textContent),
  )
  const tout = titres.join(' | ')
  for (const cle of [
    'heading',
    'heading_2',
    'heading_3',
    'heading_4',
    'heading_5',
    'quote',
    'bullet_list',
    'numbered_list',
    'table',
    'image',
    'divider',
    // Saut de page de BlockNote, comme Docs (11/11/2026).
    'page_break',
  ])
    assert.ok(titres.includes(libelle(cle)), `${cle} (${libelle(cle)}) proposé : ${tout}`)
  // La table des matières (11/11/2026), libellé de notre catalogue.
  assert.ok(titres.includes(creerTraducteur('fr')('document.tableDesMatieres')), `table des matières : ${tout}`)
  // Titre et sous-titre, en bas du menu (12/11/2026).
  assert.deepEqual(
    titres.slice(-2),
    [creerTraducteur('fr')('document.titre'), creerTraducteur('fr')('document.sousTitre')],
    `titre et sous-titre en bas : ${tout}`,
  )
  // Titres 1 à 5 (Sylvain, 09/11/2026, journal des décisions) : le niveau 6 reste exclu.
  for (const cle of [
    'heading_6',
    'toggle_heading',
    'check_list',
    'toggle_list',
    'code_block',
    'video',
    'audio',
    'file',
    // Les émoticônes, retirées du menu (Sylvain, 12/11/2026).
    'emoji',
  ])
    assert.ok(!titres.includes(libelle(cle)), `${cle} (${libelle(cle)}) absent : ${tout}`)
  await page.context().close()
})

test('table des matières : un clic sur le choix des niveaux l’ouvre, sans sélectionner le bloc', async () => {
  const page = await pageEcriture('choix-table')
  await page.keyboard.type('# Titre')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page
    .locator('.bn-suggestion-menu-item', { hasText: creerTraducteur('fr')('document.tableDesMatieres') })
    .first()
    .click()
  const choix = page.locator('nav[data-amend-bloc="tableDesMatieres"] select')
  await choix.waitFor()
  await choix.click()
  await attendre(300)
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SELECT', 'le choix a le focus')
  assert.equal(await page.locator('.ProseMirror-selectednode').count(), 0, 'le bloc n’est pas sélectionné')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await attendre(300)
  assert.equal(await choix.inputValue(), '3')
  await page.context().close()
})

test('image (comme Docs) : envoyée depuis le bloc Image, gardée par le serveur, affichée', async () => {
  const page = await pageEcriture('image')
  await page.keyboard.type('/')
  await page.waitForSelector('.bn-suggestion-menu')
  await page.locator('.bn-suggestion-menu-item', { hasText: fr.slash_menu.image.title }).first().click()
  // Le panneau du bloc : l'onglet d'envoi n'existe que si l'éditeur sait envoyer.
  const fichier = page.locator('.bn-panel input[type=file], input[type=file]').first()
  await fichier.waitFor({ state: 'attached' })
  // Un PNG de 1 × 1 pixel.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await fichier.setInputFiles({ name: 'point.png', mimeType: 'image/png', buffer: png })
  const img = page.locator('.bn-editor img[src*="/images/"]')
  await img.waitFor()
  const src = await img.getAttribute('src')
  assert.match(src, /\/api\/documents\/[^/]+\/images\/[0-9a-f]{32}\.png$/)
  const r = await page.evaluate(async (u) => (await fetch(u)).status, src)
  assert.equal(r, 200, 'le serveur rend l’image à qui lit le document')
  await page.context().close()
})

test('schéma du livre : un HTML collé perd ce que le livre n’a pas, garde le reste', PRESSE_PAPIERS, async () => {
  const page = await pageEcriture('collage-schema')
  await coller(page, {
    'text/html':
      '<h1>Titre</h1><p>a <code>code</code> <span style="color:red">rouge</span> <b>gras</b></p>' +
      '<video src="v.mp4"></video><pre><code>bloc</code></pre><blockquote>cite</blockquote>',
    'text/plain': 'Titre',
  })
  await attendre(800)
  const blocs = await page.$$eval('.bn-block-content', (els) => els.map((e) => e.getAttribute('data-content-type')))
  assert.ok(!blocs.includes('video') && !blocs.includes('codeBlock'), `blocs : ${blocs}`)
  assert.ok(blocs.includes('heading') && blocs.includes('quote'), `blocs : ${blocs}`)
  assert.equal(await page.$('.bn-editor code'), null, 'pas de style code')
  assert.ok(await page.$('.bn-editor strong'), 'le gras est gardé')
  await page.context().close()
})

test('correcteur : sa frappe et son collage restent des suggestions ; le texte principal ne change pas', async () => {
  const doc = docTest('typo-correcteur')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Texte.')
  const c = await ouvrir('Carl', doc, { role: 'correcteur' })
  await attendreTexte(c, 'Texte.')
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await c.keyboard.type(' "ajout" ?')
  await coller(c, { 'text/plain': 'collé "ici"' })
  await attendre(1500)
  // Chez l'éditrice, en relecture : le texte principal, plus les suggestions marquées comme telles.
  await choisirMode(p, 'Relire')
  const principal = await p.evaluate(() => {
    const copie = document.querySelector('.bn-editor .bn-inline-content').cloneNode(true)
    copie.querySelectorAll('ins, .ProseMirror-widget').forEach((e) => e.remove())
    return copie.textContent
  })
  assert.equal(principal, 'Texte.')
  assert.ok(await p.$('.bn-editor ins'), 'la proposition se voit, en suggestion')
  await p.context().close()
  await c.context().close()
})

test('titre et sous-titre : insérés par le menu « / », hors du plan', async () => {
  const page = await pageEcriture('titres')
  const t = creerTraducteur('fr')
  for (const [cle, texte] of [
    ['document.titre', 'Mon livre'],
    ['document.sousTitre', 'Un essai'],
  ]) {
    await page.keyboard.type('/')
    // Le libellé exact : « Titre » est aussi dans « Titre 1 » et « Sous-titre ».
    await page
      .locator('.bn-suggestion-menu-item')
      .filter({ has: page.getByText(t(cle), { exact: true }) })
      .click()
    await page.keyboard.type(texte)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('# Chapitre')
  await attendre(800)
  assert.equal(await page.locator('[data-content-type="titre"]').innerText(), 'Mon livre')
  assert.equal(await page.locator('[data-content-type="sousTitre"]').innerText(), 'Un essai')
  const plan = page.getByRole('tabpanel', { name: 'Plan' })
  assert.deepEqual(await plan.locator('button').allInnerTexts(), ['Chapitre'], 'seul le chapitre est au plan')
  await page.context().close()
})

test('« /date » insère la date du jour, AAAA-MM-JJ', async () => {
  const page = await pageEcriture('date')
  await page.keyboard.type('Le ')
  await page.keyboard.type('/date')
  await page.waitForSelector('.bn-suggestion-menu-item')
  await page.keyboard.press('Enter')
  await attendre(300)
  assert.equal(await page.locator('.bn-inline-content').first().innerText(), `Le ${dateDuJour()}`)
  await page.context().close()
})

test('notes de bas de page : « /note », texte typographié, modification au clic, retrait, curseur rendu au texte', async () => {
  const page = await pageEcriture('notes')
  const notes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.bn-editor [data-amend-note]')].map((n) => n.getAttribute('data-texte')),
    )
  await page.keyboard.type('La ville')
  await page.keyboard.type('/note')
  await page.waitForSelector('.bn-suggestion-menu-item')
  await page.keyboard.press('Enter')
  const fenetre = page.getByRole('dialog')
  await fenetre.getByRole('textbox', { name: 'Texte de la note' }).fill("Voir l'introduction : la ville existe.")
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click()
  await attendre(400)
  // Le curseur est revenu dans le texte, après la note.
  await page.keyboard.type(' existe.')
  assert.deepEqual(
    await notes(),
    [`Voir l’introduction${String.fromCodePoint(0xa0)}: la ville existe.`],
    'typographie française',
  )
  assert.equal(await texte(page), 'La ville existe.')
  // Modifier au clic ; vider la note la retire.
  await page.locator('.bn-editor [data-amend-note]').click()
  await fenetre.getByRole('textbox', { name: 'Texte de la note' }).fill('Note corrigée.')
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click()
  await attendre(300)
  assert.deepEqual(await notes(), ['Note corrigée.'])
  await page.locator('.bn-editor [data-amend-note]').click()
  await fenetre.getByRole('button', { name: 'Supprimer la note' }).click()
  await attendre(300)
  assert.deepEqual(await notes(), [])
  assert.equal(await texte(page), 'La ville existe.', 'le texte autour reste intact')
  await page.context().close()
})

test('bandeau : signes et mots du document, ou de la sélection', async () => {
  const page = await pageEcriture('compteur')
  await page.keyboard.type('Il faisait nuit sur la ville.')
  const compteur = () =>
    page
      .locator('.amend-coquille-bandeau')
      .getByText(/\d+ mots?$/)
      .innerText()
  for (const t0 = Date.now(); Date.now() - t0 < 5000; await attendre(200))
    if (/29 signes/.test(await compteur().catch(() => ''))) break
  assert.match(await compteur(), /^29 signes, 6 mots$/)
  await page.locator('.bn-inline-content').first().dblclick()
  await attendre(400)
  assert.match(await compteur(), /^Sélection\s?: \d+ signes?, 1 mot$/)
  await page.context().close()
})
