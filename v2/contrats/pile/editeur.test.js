// T5 : l'éditeur du livre dans un vrai navigateur (étape 4) : typographie à
// la frappe et au collage, Retour arrière, schéma du livre (menus et collage).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import { fr } from '@blocknote/core/locales'
import { creerTraducteur } from '../../i18n/index.js'
import { dateDuJour, nomsCites } from '../../domaine/index.js'
import { clientCollaboration } from '../../adaptateurs/yhub/client.js'
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
  panneau,
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
  // Titre, sous-titre, légende et bibliographie, en bas du menu (12, 13 et 19/11/2026).
  assert.deepEqual(
    titres.slice(-4),
    [
      creerTraducteur('fr')('document.titre'),
      creerTraducteur('fr')('document.sousTitre'),
      creerTraducteur('fr')('document.legende'),
      creerTraducteur('fr')('document.bibliographie'),
    ],
    `titre, sous-titre, légende et bibliographie en bas : ${tout}`,
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

/** Un PNG de bruit (incompressible), de `l` × `h` pixels : une photo lourde, sans dépendance. */
function pngBruit(l, h) {
  const ligne = 1 + l * 3
  const brut = randomBytes(ligne * h)
  for (let y = 0; y < h; y++) brut[y * ligne] = 0
  const morceau = (type, donnees) => {
    const t = Buffer.concat([Buffer.from(type), donnees])
    const longueur = Buffer.alloc(4)
    longueur.writeUInt32BE(donnees.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(t))
    return Buffer.concat([longueur, t, crc])
  }
  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(l, 0)
  entete.writeUInt32BE(h, 4)
  entete.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', deflateSync(brut, { level: 0 })),
    morceau('IEND', Buffer.alloc(0)),
  ])
}

/** Un PNG d'aplats (très compressible), de `l` × `h` pixels : une capture d'écran. */
function pngPlat(l, h) {
  const ligne = 1 + l * 3
  const brut = Buffer.alloc(ligne * h, 0xc8)
  for (let y = 0; y < h; y++) brut[y * ligne] = 0
  const morceau = (type, donnees) => {
    const t = Buffer.concat([Buffer.from(type), donnees])
    const longueur = Buffer.alloc(4)
    longueur.writeUInt32BE(donnees.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(t))
    return Buffer.concat([longueur, t, crc])
  }
  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(l, 0)
  entete.writeUInt32BE(h, 4)
  entete.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', deflateSync(brut, { level: 9 })),
    morceau('IEND', Buffer.alloc(0)),
  ])
}

/** Envoie `fichier` par le bloc Image ; rend la page. */
async function envoyerParLeBloc(nom, fichier) {
  const page = await pageEcriture(nom)
  await page.keyboard.type('/')
  await page.waitForSelector('.bn-suggestion-menu')
  await page.locator('.bn-suggestion-menu-item', { hasText: fr.slash_menu.image.title }).first().click()
  const champ = page.locator('.bn-panel input[type=file], input[type=file]').first()
  await champ.waitFor({ state: 'attached' })
  await champ.setInputFiles(fichier)
  return page
}

test('image lourde : acceptée à l’import (jusqu’à 25 Mo), réduite avant l’envoi (2 000 px, moins de 5 Mo)', async () => {
  const brut = pngBruit(3000, 1500) // environ 13 Mo
  assert.ok(brut.length > 5 * 1024 * 1024 && brut.length < 25 * 1024 * 1024, `poids d'essai : ${brut.length}`)
  const page = await envoyerParLeBloc('image-lourde', { name: 'photo.png', mimeType: 'image/png', buffer: brut })
  const img = page.locator('.bn-editor img[src*="/images/"]')
  await img.waitFor({ timeout: 30000 })
  const src = await img.getAttribute('src')
  assert.match(src, /\.jpg$/, 'un bruit pèse moins en JPEG : c’est ce qui est gardé')
  const { statut, octets, type } = await page.evaluate(async (u) => {
    const r = await fetch(u)
    return { statut: r.status, octets: (await r.arrayBuffer()).byteLength, type: r.headers.get('content-type') }
  }, src)
  assert.equal(statut, 200)
  assert.equal(type, 'image/jpeg')
  assert.ok(octets <= 5 * 1024 * 1024, `l’image gardée pèse ${octets} octets`)
  assert.equal(await img.evaluate((e) => e.naturalWidth), 2000, 'réduite à 2 000 px de large')
  // Affichée à la largeur de la colonne, sans la déborder.
  const [boite, colonne] = await Promise.all([img.boundingBox(), page.locator('.bn-editor').boundingBox()])
  assert.ok(boite.width <= colonne.width + 1, `image affichée : ${boite.width} px, colonne : ${colonne.width} px`)
  await page.context().close()
})

test('capture d’écran large (aplats) : réduite à 2 000 px et gardée en PNG, plus léger que le JPEG', async () => {
  const page = await envoyerParLeBloc('image-capture', {
    name: 'capture.png',
    mimeType: 'image/png',
    buffer: pngPlat(3200, 400),
  })
  const img = page.locator('.bn-editor img[src*="/images/"]')
  await img.waitFor({ timeout: 30000 })
  assert.match(await img.getAttribute('src'), /\.png$/)
  assert.equal(await img.evaluate((e) => e.naturalWidth), 2000)
  await page.context().close()
})

test('analyse des orphelines : le nom d’une image se lit dans l’état du document dans y/hub, tant qu’elle est dans le texte', async () => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  const page = await envoyerParLeBloc('image-etat', { name: 'point.gif', mimeType: 'image/gif', buffer: gif })
  const img = page.locator('.bn-editor img[src*="/images/"]')
  await img.waitFor({ timeout: 15000 })
  const nom = (await img.getAttribute('src')).split('/').pop()
  const docId = decodeURIComponent(new URL(page.url()).hash.slice(1))
  const collaboration = clientCollaboration({ url: `${pile.collab}/collaboration`, jeton: pile.secrets.jetonInterne })
  // y/hub écrit après un court délai de persistance.
  let cite = false
  for (let i = 0; i < 20 && !cite; i++) {
    await attendre(500)
    cite = nomsCites(await collaboration.lireTexte(docId)).has(nom)
  }
  assert.ok(cite, `le nom ${nom} se lit dans l’état du document`)
  await page.context().close()
})

test('image GIF : acceptée et gardée telle quelle (l’animation est conservée)', async () => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  const page = await envoyerParLeBloc('image-gif', { name: 'point.gif', mimeType: 'image/gif', buffer: gif })
  const img = page.locator('.bn-editor img[src*="/images/"]')
  await img.waitFor({ timeout: 15000 })
  const src = await img.getAttribute('src')
  assert.match(src, /\.gif$/)
  const rendu = await page.evaluate(async (u) => [...new Uint8Array(await (await fetch(u)).arrayBuffer())], src)
  assert.deepEqual(Buffer.from(rendu), gif, 'les octets du GIF sont ceux de l’original')
  await page.context().close()
})

test('image de plus de 25 Mo : refusée avec un message, rien n’est envoyé', async () => {
  const trop = Buffer.alloc(25 * 1024 * 1024 + 1)
  trop.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const page = await envoyerParLeBloc('image-25-mo', { name: 'enorme.png', mimeType: 'image/png', buffer: trop })
  await page.getByText('Cette image dépasse 25').waitFor({ timeout: 15000 })
  assert.equal(await page.locator('.bn-editor img[src*="/images/"]').count(), 0)
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
  // Chez l'éditrice, en Éditer : le texte principal, plus les suggestions marquées comme telles.
  await choisirMode(p, 'Éditer')
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

test('palette : le style « Paragraphe » une seule fois, avec notre picto (un P) ; « Titre », « Sous-titre », « Légende » et « Bibliographie » à la suite', async () => {
  const page = await pageEcriture('styles')
  await page.keyboard.type('Un paragraphe')
  await page.keyboard.press('Shift+Home')
  await attendre(800)
  await page.locator('.bn-formatting-toolbar button').first().click()
  const items = page.getByRole('menuitem')
  await items.first().waitFor()
  const noms = (await items.allInnerTexts()).map((x) => x.trim())
  assert.equal(noms.filter((n) => n === 'Paragraphe').length, 1)
  assert.deepEqual(noms.slice(-4), ['Titre', 'Sous-titre', 'Légende', 'Bibliographie'])
  assert.equal(
    await page.getByRole('menuitem', { name: 'Paragraphe', exact: true }).locator('svg.tabler-icon-letter-p').count(),
    1,
    'le P de Tabler, pas le T de BlockNote',
  )
  await page.context().close()
})

test('titres : l’interligne d’un titre est celui des titres de Mantine, pas celui du texte (Sylvain, 14/11/2026)', async () => {
  const page = await pageEcriture('titres-interligne')
  await page.keyboard.type('# Un grand titre')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Du texte courant.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('## Un sous-titre')
  await attendre(500)
  const rapports = await page.evaluate(() => {
    const rapport = (el) => {
      const c = getComputedStyle(el)
      return parseFloat(c.lineHeight) / parseFloat(c.fontSize)
    }
    return {
      titre: rapport(document.querySelector('.bn-block-content[data-content-type="heading"]')),
      texte: rapport(document.querySelector('.bn-block-content[data-content-type="paragraph"]')),
      niveau2: rapport(document.querySelector('.bn-block-content[data-content-type="heading"][data-level="2"]')),
    }
  })
  assert.ok(rapports.niveau2 >= 1.3 && rapports.niveau2 <= 1.45, `interligne du titre 2 : ${rapports.niveau2}`)
  assert.ok(rapports.titre >= 1.25 && rapports.titre <= 1.35, `interligne du titre 1 : ${rapports.titre}`)
  assert.ok(rapports.texte >= 1.45, `le texte garde le sien : ${rapports.texte}`)
  await page.context().close()
})

test('poignées de bloc : visibles au format L (Sylvain, 14/11/2026)', async () => {
  const page = await pageEcriture('poignees-l')
  await page.keyboard.type('Un paragraphe.')
  await attendre(500)
  await page.hover('.bn-block-content[data-content-type="paragraph"]')
  await attendre(500)
  const affichee = await page.evaluate(() => {
    const el = document.querySelector('.bn-side-menu')
    return Boolean(el) && getComputedStyle(el).display !== 'none'
  })
  assert.ok(affichee, 'la poignée de bloc est affichée au survol')
  await page.context().close()
})

test('émojis : « : » n’ouvre rien dans le texte ; l’entrée « Emoji » du menu « / » ouvre le sélecteur (17/11/2026)', async () => {
  const page = await pageEcriture('emoji-menu')
  await page.keyboard.type('deux:points et :sourire')
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.bn-frimousse-picker').count(), 0, '« : » n’ouvre pas le sélecteur')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/emoji')
  await page.locator('.bn-suggestion-menu-item').first().waitFor()
  await page.keyboard.press('Enter')
  await page.locator('.bn-frimousse-picker').waitFor()
  await page.context().close()
})

test('menu « / » : chaque groupe n’a qu’une étiquette, aussi pendant la frappe (« /saut » en montrait trois ; 18/11/2026)', async () => {
  const page = await pageEcriture('menu-etiquettes')
  await page.keyboard.type('/')
  await page.locator('.bn-suggestion-menu-item').first().waitFor()
  const etiquettes = () => page.locator('.bn-suggestion-menu-label').allInnerTexts()
  const toutes = await etiquettes()
  assert.deepEqual(toutes, [...new Set(toutes)], `étiquettes uniques : ${toutes}`)
  // Les états intermédiaires de la frappe, où les étiquettes en trop apparaissaient.
  for (const lettre of ['s', 'a', 'u', 't']) {
    await page.keyboard.type(lettre)
    // Le menu a fini de se mettre à jour : jamais plus d'étiquettes que d'éléments, toutes différentes.
    await page.waitForFunction(() => {
      const e = [...document.querySelectorAll('.bn-suggestion-menu-label')].map((x) => x.textContent)
      return e.length <= document.querySelectorAll('.bn-suggestion-menu-item').length && e.length === new Set(e).size
    })
  }
  await page.waitForFunction(() => document.querySelectorAll('.bn-suggestion-menu-item').length === 1)
  assert.equal((await etiquettes()).length, 1, 'une seule étiquette pour un seul élément')
  await page.context().close()
})

/** Sélectionne un mot du texte, comme à la souris. */
async function choisirMot(page, mot) {
  await page.evaluate((mot) => {
    const parcours = document.createTreeWalker(document.querySelector('.bn-editor'), NodeFilter.SHOW_TEXT)
    for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
      const i = n.data.indexOf(mot)
      if (i < 0) continue
      const plage = document.createRange()
      plage.setStart(n, i)
      plage.setEnd(n, i + mot.length)
      getSelection().removeAllRanges()
      getSelection().addRange(plage)
      document.dispatchEvent(new Event('selectionchange'))
      return
    }
  }, mot)
  // ProseMirror lit la sélection du navigateur de façon asynchrone.
  await attendre(500)
}

test('liens et gras en « Éditer » : créer, modifier, retirer ; rien ne reste marqué, aucune lettre ne disparaît (24/11/2026)', async () => {
  const PHRASE = 'Voir le site officiel ici.'
  const doc = docTest('liens')
  const page = await ouvrir('Paule', doc)
  await page.click('.bn-editor')
  await page.keyboard.type(PHRASE)
  const autre = await ouvrir('Quentin', doc)
  await attendreTexte(autre, PHRASE)
  const lien = (p) => p.evaluate(() => document.querySelector('.bn-inline-content a')?.getAttribute('href') ?? null)
  const marques = (p) => p.locator('.bn-inline-content [data-type="modification"], .bn-suggestion-mark').count()
  // La barre d'un lien s'ouvre au survol, après un délai : on y revient tant qu'elle n'est pas là.
  const barreDuLien = async (nom) => {
    const bouton = page.locator('.bn-toolbar').getByRole('button', { name: nom, exact: true }).first()
    // Toujours un nouveau survol : une barre restée ouverte après un geste vise l'ancien lien.
    for (let essai = 0; essai < 10 && (essai === 0 || !(await bouton.isVisible())); essai++) {
      await page.mouse.move(5, 5)
      await attendre(600)
      await page.hover('.bn-inline-content a')
      await attendre(800)
    }
    await bouton.click()
  }
  const propre = async (etape) => {
    await attendreTexte(page, PHRASE)
    await attendreTexte(autre, PHRASE)
    assert.equal(await marques(page), 0, `${etape} : rien n’est marqué comme une correction`)
    assert.equal(await marques(autre), 0, `${etape} : rien n’est marqué chez l’autre personne`)
  }
  const d = fr.link_toolbar
  // Créer.
  await choisirMot(page, 'site')
  await page.keyboard.press('ControlOrMeta+k')
  await page.locator('.mantine-Popover-dropdown input').first().waitFor()
  await page.keyboard.type('https://exemple.fr')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('.bn-inline-content a')?.textContent === 'site')
  await autre.waitForFunction(() => document.querySelector('.bn-inline-content a')?.textContent === 'site')
  await propre('lien créé')
  // Modifier l'adresse.
  await barreDuLien(d.edit.text)
  const adresse = page.locator('.mantine-Popover-dropdown input').first()
  await adresse.fill('https://autre.fr')
  await adresse.press('Enter')
  await autre.waitForFunction(
    () => document.querySelector('.bn-inline-content a')?.getAttribute('href') === 'https://autre.fr',
  )
  assert.equal(await lien(page), 'https://autre.fr')
  await propre('lien modifié')
  // Retirer : le lien disparaît, le mot reste entier, chez les deux.
  await barreDuLien(d.delete.tooltip)
  await page.waitForFunction(() => !document.querySelector('.bn-inline-content a'))
  await autre.waitForFunction(() => !document.querySelector('.bn-inline-content a'))
  await propre('lien retiré')
  // Le même défaut touchait toute mise en forme retirée : le gras.
  await choisirMot(page, 'officiel')
  await page.keyboard.press('ControlOrMeta+b')
  await autre.waitForFunction(() => document.querySelector('.bn-inline-content strong')?.textContent === 'officiel')
  await page.keyboard.press('ControlOrMeta+b')
  await autre.waitForFunction(() => !document.querySelector('.bn-inline-content strong'))
  await propre('gras retiré')
  // Une mise en forme retirée par l'autre personne.
  await choisirMot(autre, 'Voir')
  await autre.keyboard.press('ControlOrMeta+b')
  await page.waitForFunction(() => document.querySelector('.bn-inline-content strong')?.textContent === 'Voir')
  await autre.keyboard.press('ControlOrMeta+b')
  await page.waitForFunction(() => !document.querySelector('.bn-inline-content strong'))
  await propre('gras retiré par l’autre personne')
  assert.match(await panneau(page), /Aucune correction/)
  await page.context().close()
  await autre.context().close()
})
