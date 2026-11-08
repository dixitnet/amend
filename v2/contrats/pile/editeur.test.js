// T5 : l'éditeur du livre dans un vrai navigateur (étape 4) : typographie à
// la frappe et au collage, Retour arrière, schéma du livre (menus et collage).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, texte, attendre } from './outils.mjs'

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

test('collage : texte brut et HTML typographiés et en NFC ; adresse d’un lien intacte', async () => {
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
  const page = await pageEcriture('menu')
  await page.keyboard.type('/')
  await page.waitForSelector('.bn-suggestion-menu')
  const items = await page.$$eval('.bn-suggestion-menu-item', (els) => els.map((e) => e.textContent))
  const tout = items.join(' | ')
  for (const present of ['Titre 1', 'Titre 3', 'Citation', 'Liste à puces', 'Liste numérotée', 'Tableau', 'Image'])
    assert.ok(new RegExp(present, 'i').test(tout), `${present} proposé : ${tout}`)
  for (const absent of ['Titre 4', 'Vidéo', 'Audio', 'Fichier', 'Code', 'cocher', 'repliable'])
    assert.ok(!new RegExp(absent, 'i').test(tout), `${absent} absent : ${tout}`)
  await page.context().close()
})

test('schéma du livre : un HTML collé perd ce que le livre n’a pas, garde le reste', async () => {
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

test('lecture seule : la typographie n’ouvre aucune écriture au correcteur', async () => {
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
  await attendre(1000)
  assert.equal(await texte(p), 'Texte.')
  await p.context().close()
  await c.context().close()
})

/** Le texte des notes, tel que la liste en fin de document l'affiche. */
const listeNotes = (page) => page.$$eval('aside ol li', (els) => els.map((e) => e.textContent))
async function attendreNotes(page, attendu, delai = 10000) {
  for (const t0 = Date.now(); Date.now() - t0 < delai; await attendre(100))
    if (JSON.stringify(await listeNotes(page)) === JSON.stringify(attendu)) return
  assert.deepEqual(await listeNotes(page), attendu)
}
/** Insère une note au curseur par le menu « / », et y tape son texte. */
async function insererNote(page, texte) {
  await page.keyboard.type('/note')
  await page.waitForSelector('.bn-suggestion-menu-item')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-note][data-ouverte]')
  await page.keyboard.type(texte)
}
const ouvertes = (page) => page.$$eval('[data-note]', (els) => els.map((e) => e.hasAttribute('data-ouverte')))
const visibles = (page) =>
  page.$$eval('[data-note-texte]', (els) => els.map((e) => getComputedStyle(e).display !== 'none'))

test('notes : insertion par le menu, ouverte au curseur, repliée hors du curseur, listée en fin de document', async () => {
  const page = await pageEcriture('notes')
  await page.keyboard.type('Il faisait nuit')
  await insererNote(page, "Voir la gare d'Orléans.")
  assert.deepEqual(await ouvertes(page), [true])
  assert.deepEqual(await visibles(page), [true])
  // La typographie vaut aussi dans la note.
  await attendreNotes(page, ['Voir la gare d’Orléans.'])
  // Le curseur sort de la note : elle se replie, l'appel reste.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(' à Nantes.')
  await page.waitForFunction(() => !document.querySelector('[data-note]').hasAttribute('data-ouverte'))
  assert.deepEqual(await visibles(page), [false])
  assert.match(await texte(page), /^Il faisait nuit.* à Nantes\.$/)
  await page.context().close()
})

test('notes : une note insérée avant les autres est la première de la liste ; tout survit au rechargement', async () => {
  const doc = docTest('notes-ordre')
  const page = await ouvrir('Alice', doc)
  await page.click('.bn-editor')
  await page.keyboard.type('Fin')
  await insererNote(page, 'Note B.')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Home')
  await page.keyboard.type('Début')
  await insererNote(page, 'Note A.')
  await attendreNotes(page, ['Note A.', 'Note B.'])
  await attendre(1500)
  await page.reload()
  await page.waitForSelector('.bn-editor [data-note]')
  await attendreNotes(page, ['Note A.', 'Note B.'])
  await page.context().close()
})

test('notes : deux navigateurs voient la même note, chacun la modifie', async () => {
  const doc = docTest('notes-deux')
  const a = await ouvrir('Alice', doc)
  await a.click('.bn-editor')
  await a.keyboard.type('Texte')
  await insererNote(a, 'Note commune.')
  const b = await ouvrir('Bruno', doc)
  await attendreNotes(b, ['Note commune.'])
  // Bruno entre dans la note (elle s'ouvre chez lui) et la complète.
  await b.evaluate(() => {
    const el = document.querySelector('[data-note-texte]')
    const sel = getSelection()
    sel.collapse(el.firstChild, el.firstChild.length)
  })
  await attendre(300)
  await b.keyboard.type(' Complétée.')
  await attendreNotes(a, ['Note commune. Complétée.'])
  await a.context().close()
  await b.context().close()
})

test('notes : le correcteur voit les notes, sans pouvoir en insérer', async () => {
  const doc = docTest('notes-correcteur')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Texte')
  await insererNote(p, 'Note.')
  const c = await ouvrir('Carl', doc, { role: 'correcteur' })
  await attendreNotes(c, ['Note.'])
  await c.click('.bn-inline-content')
  await c.keyboard.type('/note')
  await attendre(500)
  assert.equal(await c.$('.bn-suggestion-menu-item'), null, 'pas de menu en lecture seule')
  assert.deepEqual(await listeNotes(p), ['Note.'])
  await p.context().close()
  await c.context().close()
})

test('notes : les flèches entrent dans une note repliée et en sortent, dans les deux sens', async () => {
  // ProseMirror suit le curseur du navigateur de façon asynchrone : des
  // touches espacées comme sous les doigts, pas en rafale.
  const gauche = async (n) => {
    for (let i = 0; i < n; i++) {
      await page.keyboard.press('ArrowLeft')
      await attendre(60)
    }
  }
  const page = await pageEcriture('notes-fleches')
  await page.keyboard.type('Avant')
  await insererNote(page, 'N')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(' après')
  await page.waitForFunction(() => !document.querySelector('[data-note]').hasAttribute('data-ouverte'))
  // Depuis la fin du paragraphe, la flèche gauche ramène dans la note, qui s'ouvre.
  await gauche(' après'.length + 1)
  await page.waitForSelector('[data-note][data-ouverte]')
  await page.keyboard.type('ote')
  // Puis tout à gauche de la note, et en dehors.
  await gauche('Note'.length + 1)
  await page.keyboard.type('!')
  await attendreNotes(page, ['Note'])
  assert.match(await texte(page), /^Avant!Note après$/)
  await page.context().close()
})

test('notes : un passage copié avec sa note se colle avec elle', async () => {
  const page = await pageEcriture('notes-copie')
  await page.keyboard.type('Phrase')
  await insererNote(page, 'Sa note.')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(' finie.')
  // Copier tout le paragraphe : on garde ce que l'éditeur met au presse-papiers.
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await attendre(400) // ProseMirror lit la sélection du navigateur de façon asynchrone
  const donnees = await page.evaluate(() => {
    const dt = new DataTransfer()
    document
      .querySelector('.bn-editor')
      .dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }))
    return Object.fromEntries(dt.types.map((type) => [type, dt.getData(type)]))
  })
  assert.ok(donnees['text/html'], 'du HTML est copié')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await coller(page, donnees)
  await attendreNotes(page, ['Sa note.', 'Sa note.'])
  await page.context().close()
})
