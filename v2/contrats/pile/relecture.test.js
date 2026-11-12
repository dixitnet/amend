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

/** Le panneau des suggestions (en Éditer ou en Corriger, où il les liste). */
async function attendrePanneau(page, motif, delai = 10000) {
  if ((await modeChoisi(page)) === 'Lire') await choisirMode(page, 'Éditer')
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
  // Le correcteur s'ouvre en Corriger ; il n'a que Corriger et Lire (12/11/2026).
  assert.equal(await modeChoisi(c), 'Corriger')
  assert.deepEqual(
    await c.evaluate(() => [...document.querySelectorAll('[aria-label="Mode"] label')].map((l) => l.textContent)),
    ['Corriger', 'Lire'],
  )
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout')
  await attendrePanneau(p, /Carla ajoute «\s?Ajout\s?»/)
  await p
    .getByRole('button', { name: /^Accepter\s*:/ })
    .first()
    .click()
  await attendrePanneau(p, /Aucune suggestion/)
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
  // L'éditrice voit la proposition, en Éditer, dans le texte et dans le panneau.
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
  await attendrePanneau(p, /Aucune suggestion/)
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

test('trois modes : l’éditrice corrige, sa frappe devient une suggestion ; en Éditer, elle la voit et l’accepte ; en Lire, le texte seul', async () => {
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
  await attendre(1500)
  // En Corriger, l'éditrice voit la liste, sans Accepter (on arbitre en Éditer).
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  assert.equal(await p.getByRole('button', { name: /^Accepter\s*:/ }).count(), 0, 'pas d’arbitrage en Corriger')
  // En Lire : le texte seul, ni frappe ni volet droit.
  await choisirMode(p, 'Lire')
  await attendreTexte(p, 'Il faisait nuit.')
  assert.equal(await p.locator('.bn-editor[contenteditable=true]').count(), 0, 'pas de frappe en Lire')
  assert.equal(await p.locator('section[aria-label] li').count(), 0, 'pas de volet des suggestions en Lire')
  // En Éditer : la suggestion dans le texte, et on l'accepte.
  await choisirMode(p, 'Éditer')
  assert.ok(await p.$('.bn-editor ins'), 'la suggestion se voit dans le texte')
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  await p
    .locator('section[aria-label] li')
    .first()
    .getByRole('button', { name: /^Accepter\s*:/ })
    .click()
  await attendrePanneau(p, /Aucune suggestion/)
  await attendreTexte(p, 'Il faisait nuit. Ajout')
  await p.context().close()
})

test('garde-fou d’Éditer : au contact d’une suggestion, la frappe est refusée et dite ; ailleurs, elle va dans le texte', async () => {
  const { doc, p, c, fermer } = await relecture('garde', 'Il faisait nuit noire sur la ville endormie.')
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  await c.click('.bn-inline-content')
  await c.keyboard.press('Home')
  await attendre(300)
  for (let i = 0; i < 10; i++) await c.keyboard.press('ArrowRight')
  await c.keyboard.type(' donc')
  await attendrePanneau(p, /Carla ajoute «\s?donc\s?»/)
  // Juste après la suggestion : refusé, le message le dit, rien ne change.
  await p.click('.bn-inline-content')
  await p.keyboard.press('Home')
  await attendre(300)
  for (let i = 0; i < 15; i++) await p.keyboard.press('ArrowRight')
  await p.keyboard.type('Q')
  await p.getByText('ne se modifie pas au contact d’une suggestion').waitFor()
  // Loin de la suggestion : la frappe va dans le texte (le lecteur la voit).
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type(' Fin.')
  await attendreTexte(l, 'Il faisait nuit noire sur la ville endormie. Fin.')
  // La suggestion de Carla est intacte, à son nom.
  await attendrePanneau(p, /^1 suggestion.*Carla ajoute «\s?donc\s?»/)
  assert.doesNotMatch(await panneau(p), /Q/)
  await l.context().close()
  await fermer()
})

test('le correcteur voit toute la liste, sans Accepter ni Refuser', async () => {
  const { doc, p, c, fermer } = await relecture('liste-correcteur')
  const d = await ouvrir('Dario', doc, { role: 'correcteur' })
  await d.click('.bn-inline-content')
  await d.keyboard.press('End')
  await attendre(300)
  await d.keyboard.type(' Ajout')
  await attendrePanneau(p, /Dario ajoute/)
  // Un autre correcteur (Carla) voit la suggestion de Dario dans sa liste.
  await attendrePanneau(c, /Dario ajoute/)
  assert.equal(await c.getByRole('button', { name: /^(Tout )?(Accepter|Refuser)/ }).count(), 0)
  await d.context().close()
  await fermer()
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
  await attendre(2000)
  await p.reload()
  await p.waitForSelector('.bn-editor')
  const pastille = () =>
    p.evaluate(() => document.querySelector('header .mantine-Indicator-indicator')?.textContent ?? '')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && (await pastille()) !== '1';) await attendre(200)
  assert.equal(await pastille(), '1', 'le total des tâches sur le bouton du volet droit')
  await attendrePanneau(p, /Carla ajoute «\s?Fin\s?»/)
  await p.evaluate(() => window.scrollTo(0, 0))
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
  assert.equal(await c.getByRole('dialog').getByRole('textbox').count(), 0, 'lecture seule en Corriger')
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
  await attendrePanneau(p, /Aucune suggestion/)
  await choisirMode(p, 'Lire')
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
