// T5 : l'éditeur du livre dans un vrai navigateur (étape 4) : typographie à
// la frappe et au collage, Retour arrière, schéma du livre (menus et collage).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fr } from '@blocknote/core/locales'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreTexte,
  texte,
  attendre,
  NAVIGATEUR,
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
  ])
    assert.ok(titres.includes(libelle(cle)), `${cle} (${libelle(cle)}) proposé : ${tout}`)
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
  // Chez l'éditrice : le texte principal, plus les suggestions marquées comme telles.
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
