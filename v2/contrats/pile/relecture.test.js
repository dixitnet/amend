// T5 : la relecture dans un vrai navigateur (étape 5) : suggestions du
// correcteur, panneau de l'éditeur, commentaire ancré par le serveur,
// présence, historique.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, texte, attendre } from './outils.mjs'

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

/** Le panneau des suggestions, en une ligne. */
const panneau = (page) =>
  page.evaluate(() => document.querySelector('section[aria-label]')?.innerText.replace(/\n+/g, ' / ') ?? '')
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
  await p.getByRole('button', { name: 'Accepter', exact: true }).first().click()
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
  await attendreTexte(p, 'Premier paragraphe.\nNouveau paragraphe.')
  await attendreTexte(c, 'Premier paragraphe.\nNouveau paragraphe.')
  await attendrePanneau(p, /Carla ajoute «\s?Nouveau paragraphe\.\s?»/)
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

test('suivi des modifications : l’éditrice l’active, ce qu’elle tape devient une suggestion ; arrêté, elle la retrouve et l’accepte', async () => {
  const doc = docTest('interrupteur')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  const interrupteur = p.getByRole('switch', { name: 'Suivi des modifications' })
  assert.equal(await interrupteur.isChecked(), false, 'arrêté à l’ouverture')
  await interrupteur.click()
  await p.getByText('Mode suggestion').waitFor()
  await p.click('.bn-inline-content')
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type(' Ajout')
  await attendre(1500)
  await interrupteur.click()
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  // « Tout accepter » : l'acceptation une à une d'une suggestion faite par un
  // éditeur ne marche pas encore (10/11/2026, à examiner ; celle d'un correcteur marche).
  await p.getByRole('button', { name: 'Tout accepter' }).click()
  await attendrePanneau(p, /Aucune suggestion/)
  await attendreTexte(p, 'Il faisait nuit. Ajout')
  await p.context().close()
})
