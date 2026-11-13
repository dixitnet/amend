// T5 : la relecture dans un vrai navigateur (étape 5) : suggestions du
// correcteur, panneau de l'éditeur, commentaire ancré par le serveur,
// présence, historique.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreTexte,
  texte,
  attendre,
  choisirMode,
  modeChoisi,
  panneau,
} from './outils.mjs'

let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4370, portCollab: 4470 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** Le panneau d'une éditrice (il liste les corrections en Éditer et en Corriger). */
async function attendrePanneau(page, motif, delai = 10000) {
  for (const t0 = Date.now(); Date.now() - t0 < delai; await attendre(200)) if (motif.test(await panneau(page))) return
  assert.match(await panneau(page), motif)
}
/** Une éditrice qui a écrit un paragraphe, et un correcteur sur le même document. */
async function relecture(nom, paragraphe = 'Il faisait nuit sur la ville.') {
  const doc = docTest(nom)
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type(paragraphe)
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendreTexte(c, paragraphe)
  return { doc, p, c, fermer: async () => (await p.context().close(), await c.context().close()) }
}

test('suggestion : l’éditrice la voit avec son auteur, l’accepte ; le texte converge et survit au rechargement', async () => {
  const { p, c, fermer } = await relecture('accepter')
  // Le correcteur est toujours en suivi : il n'a pas d'interrupteur (10/11/2026).
  assert.equal(await c.getByRole('switch').count(), 0)
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout')
  await attendrePanneau(p, /Carla ajoute «\s?Ajout\s?»/)
  await p
    .getByRole('button', { name: /^Accepter\s*:/ })
    .first()
    .click()
  await attendrePanneau(p, /Aucune correction/)
  await attendreTexte(c, 'Il faisait nuit sur la ville. Ajout')
  await p.reload()
  await attendreTexte(p, 'Il faisait nuit sur la ville. Ajout')
  await fermer()
})

test('suggestion : un nouveau paragraphe du correcteur reste intact chez les deux', async () => {
  // Fin puis Entrée : ProseMirror lit la sélection du navigateur de façon
  // asynchrone ; sans attente, la coupure tomberait où le clic a placé le curseur.
  const { p, c, fermer } = await relecture('paragraphe', 'Premier paragraphe.')
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.press('Enter')
  await c.keyboard.type('Nouveau paragraphe.')
  await attendre(3500)
  // L'éditrice voit la proposition en relecture (en Modifier, le texte seul).
  await attendrePanneau(p, /Carla ajoute «\s?Nouveau paragraphe\.\s?»/)
  await attendreTexte(p, 'Premier paragraphe.\nNouveau paragraphe.')
  await attendreTexte(c, 'Premier paragraphe.\nNouveau paragraphe.')
  await fermer()
})

test('suggestion refusée : le texte revient tel quel chez les deux', async () => {
  const { p, c, fermer } = await relecture('refuser')
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout')
  await attendrePanneau(p, /Carla ajoute/)
  await p.getByRole('button', { name: 'Tout refuser' }).click()
  await attendrePanneau(p, /Aucune correction/)
  await attendreTexte(c, 'Il faisait nuit sur la ville.')
  await fermer()
})

test('commentaire du correcteur : l’ancre, posée par le serveur, se voit chez l’éditrice', async () => {
  const { p, c, fermer } = await relecture('commentaire')
  await c.evaluate(() => {
    const t = document.querySelector('.bn-inline-content').firstChild
    const i = t.textContent.indexOf('nuit')
    const r = document.createRange()
    r.setStart(t, i)
    r.setEnd(t, i + 4)
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(r)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await attendre(800)
  await c.locator('.bn-formatting-toolbar button[aria-label="Ajouter un commentaire"]').click()
  await attendre(400)
  await c.keyboard.type('Pourquoi la nuit ?')
  await c.keyboard.press('Control+Enter')
  for (const t0 = Date.now(); Date.now() - t0 < 10000; await attendre(200))
    if ((await p.locator('.bn-thread-mark').count()) > 0) break
  assert.deepEqual(
    await p.evaluate(() => [...document.querySelectorAll('.bn-thread-mark')].map((e) => e.textContent)),
    ['nuit'],
  )
  assert.equal(await texte(p), 'Il faisait nuit sur la ville.', 'le texte ne change pas')
  // Le fil ne s'ouvre que dans la colonne de droite : pas de bulle au clic
  // sur le passage commenté (Sylvain, 12/11/2026).
  await p.locator('.bn-thread-mark').first().click()
  await attendre(600)
  assert.equal(
    await p.evaluate(
      () => [...document.querySelectorAll('.bn-thread')].filter((e) => !e.closest('.bn-threads-sidebar')).length,
    ),
    0,
    'pas de bulle',
  )
  await fermer()
})

test('présence : l’éditrice voit le correcteur ; le lecteur voit sans être vu', async () => {
  const { doc, p, c, fermer } = await relecture('presence')
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  // La présence, dans le bandeau : une pastille par autre personne.
  const participants = (page) =>
    page.locator('[role=list][aria-label="Personnes sur ce document"] [role=listitem]').count()
  await attendre(1500)
  assert.equal(await participants(p), 1, 'l’éditrice voit le correcteur')
  assert.equal(await participants(l), 2, 'le lecteur voit l’éditrice et le correcteur')
  await c.click('.bn-inline-content')
  await attendre(1000)
  assert.ok(await p.getByText('Carla', { exact: true }).count(), 'le curseur du correcteur, avec son nom')
  await l.context().close()
  await fermer()
})

test('historique : ouvert pour tous ; nommer une version seulement pour l’éditrice', async () => {
  const { p, c, fermer } = await relecture('historique')
  await attendre(1500)
  for (const page of [p, c]) {
    await page.getByRole('button', { name: 'Autres actions' }).click()
    await page.getByRole('menuitem', { name: 'Historique' }).click()
    await page.getByText('Début du document').waitFor()
  }
  const boutonsEnTete = (page) =>
    page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.closest('[class*=ersioning]')).length)
  assert.ok((await boutonsEnTete(p)) > (await boutonsEnTete(c)), 'le correcteur a moins d’actions')
  await fermer()
})

test('trois modes : en Corriger, la frappe de l’éditrice est une correction ; en Éditer, elle écrit en la voyant et l’accepte ; en Lire, ni correction ni frappe', async () => {
  const doc = docTest('modes')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  assert.equal(await modeChoisi(p), 'Éditer', 'Éditer à l’ouverture')
  await choisirMode(p, 'Corriger')
  await p.click('.bn-inline-content')
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type(' Ajout')
  // En Corriger, l'éditrice voit sa correction dans le texte et dans le volet.
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  assert.ok(await p.$('.bn-editor ins'), 'la correction se voit en Corriger')
  // En Lire : le texte seul, sans frappe possible.
  await choisirMode(p, 'Lire')
  await attendreTexte(p, 'Il faisait nuit.')
  assert.equal(await p.locator('.bn-editor ins').count(), 0, 'pas de correction en Lire')
  assert.equal(await p.locator('.bn-editor [contenteditable=true]').count(), 0, 'pas de frappe en Lire')
  // En Éditer : la correction se voit, on écrit contre elle sans la prolonger
  // (correctif temporaire de y-prosemirror#245), et on l'accepte.
  await choisirMode(p, 'Éditer')
  await p.locator('.bn-editor ins').first().waitFor()
  await p.click('.bn-inline-content')
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type(' Suite')
  await attendre(1500)
  assert.equal(
    await p.evaluate(() => [...document.querySelectorAll('.bn-editor ins')].map((e) => e.textContent).join('|')),
    ' Ajout',
    'la frappe en Éditer ne prolonge pas la correction',
  )
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  await p
    .locator('section[aria-label] li')
    .first()
    .getByRole('button', { name: /^Accepter\s*:/ })
    .click()
  await attendrePanneau(p, /Aucune correction/)
  const fin = await texte(p)
  assert.ok(fin.includes('Ajout') && fin.includes('Suite') && fin.startsWith('Il faisait nuit.'), fin)
  await p.context().close()
})

test('suivi : cliquer une carte fait défiler le texte jusqu’à la suggestion ; les nombres en pastille', async () => {
  const doc = docTest('defiler')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  for (let i = 1; i <= 40; i++) {
    await p.keyboard.type(`Paragraphe ${i}.`)
    await p.keyboard.press('Enter')
  }
  await p.keyboard.type('Dernier paragraphe.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && !/Dernier paragraphe\.$/.test(await texte(c));)
    await attendre(200)
  await c.locator('.bn-inline-content', { hasText: 'Dernier paragraphe.' }).click()
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Fin')
  // Hors relecture, le nombre est compté à l'ouverture : on rouvre.
  await attendre(2000)
  await p.reload()
  await p.waitForSelector('.bn-editor')
  const pastille = () =>
    p.evaluate(() => document.querySelector('header .mantine-Indicator-indicator')?.textContent ?? '')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && (await pastille()) !== '1';) await attendre(200)
  assert.equal(await pastille(), '1', 'le total des tâches sur le bouton du volet droit, hors relecture')
  await attendrePanneau(p, /Carla ajoute «\s?Fin\s?»/)
  await p.evaluate(() => document.querySelector('.amend-coquille-defilement').scrollTo(0, 0))
  await attendre(300)
  await p.locator('section[aria-label] [data-amend-carte]').first().click()
  await attendre(1200)
  const visible = await p.evaluate(() => {
    const ins = [...document.querySelectorAll('.bn-editor ins')].find((e) => e.textContent.includes('Fin'))
    const r = ins?.getBoundingClientRect()
    return Boolean(r) && r.top >= 0 && r.bottom <= window.innerHeight
  })
  assert.ok(visible, 'la suggestion est dans l’écran')
  await p.context().close()
  await c.context().close()
})

test('notes et relecture : le correcteur lit une note sans la modifier, en ajoute une, l’éditrice l’accepte seule', async () => {
  const { p, c, fermer } = await relecture('notes')
  // L'éditrice pose une note.
  await p.click('.bn-inline-content')
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type('/note')
  await p.waitForSelector('.bn-suggestion-menu-item')
  await p.keyboard.press('Enter')
  await p.getByRole('dialog').getByRole('textbox', { name: 'Texte de la note' }).fill('Note de l’éditrice.')
  await p.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  for (const t0 = Date.now(); Date.now() - t0 < 10000; await attendre(200))
    if ((await c.locator('.bn-editor [data-amend-note]').count()) === 1) break
  // Le correcteur la lit, sans champ pour la modifier.
  await c.locator('.bn-editor [data-amend-note]').click()
  assert.equal(await c.getByRole('dialog').getByRole('textbox').count(), 0, 'lecture seule en Suggérer')
  assert.match(await c.getByRole('dialog').innerText(), /Note de l’éditrice\./)
  await c.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click()
  // Il ajoute une note, par la palette.
  await c.click('.bn-inline-content')
  await c.keyboard.press('Home')
  await c.keyboard.press('Shift+End')
  await attendre(500)
  await c.locator('.bn-formatting-toolbar button[aria-label="Note de bas de page"]').click()
  await c.getByRole('dialog').getByRole('textbox', { name: 'Texte de la note' }).fill('Note du correcteur.')
  await c.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await attendrePanneau(p, /Carla ajoute une note\s?:\s?«\s?Note du correcteur\.\s?»/)
  await p
    .getByRole('button', { name: /^Accepter\s*:/ })
    .first()
    .click()
  await attendrePanneau(p, /Aucune correction/)
  for (const t0 = Date.now(); Date.now() - t0 < 10000; await attendre(200))
    if ((await p.locator('.bn-editor [data-amend-note]').count()) === 2) break
  assert.deepEqual(
    await p.evaluate(() =>
      [...document.querySelectorAll('.bn-editor [data-amend-note]')].map((n) => n.getAttribute('data-texte')),
    ),
    ['Note de l’éditrice.', 'Note du correcteur.'],
  )
  await fermer()
})
