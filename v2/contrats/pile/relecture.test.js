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
  defilerJusquEnBas,
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
  // Le clic ouvre la colonne de droite sur l'onglet « Commentaires », où le fil se lit.
  await p.locator('.bn-threads-sidebar .bn-thread').first().waitFor({ timeout: 5000 })
  await fermer()
})

test('présence : l’éditrice voit le correcteur ; le lecteur voit sans être vu', async () => {
  const { doc, p, c, fermer } = await relecture('presence')
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  // La présence, dans le bandeau : une pastille par autre personne.
  const participants = (page) => page.locator('[role=group][aria-label="Personnes sur ce document"] button').count()
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
  // En Corriger aussi, l'éditrice voit la liste et peut arbitrer (Sylvain, 13/11/2026).
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  assert.equal(await p.getByRole('button', { name: /^Accepter\s*:/ }).count(), 1, 'on arbitre aussi en Corriger')
  // En Lire : le texte seul, ni frappe ni volet droit.
  await choisirMode(p, 'Lire')
  await attendreTexte(p, 'Il faisait nuit.')
  assert.equal(await p.locator('.bn-editor[contenteditable=true]').count(), 0, 'pas de frappe en Lire')
  assert.equal(await p.locator('section[aria-label] li').count(), 0, 'pas de volet des suggestions en Lire')
  // En Éditer : la suggestion dans le texte, et on l'accepte.
  await choisirMode(p, 'Éditer')
  assert.ok(await p.$('.bn-editor ins'), 'la suggestion se voit dans le texte')
  await attendrePanneau(p, /Paule ajoute «\s?Ajout\s?»/)
  // Sa propre suggestion, après avoir écrit en Éditer, ne s'accepte pas une à
  // une (défaut amont, veille, 12/11/2026) : « Tout accepter » la traite.
  await p.getByRole('button', { name: 'Tout accepter' }).click()
  await attendrePanneau(p, /Aucune correction/)
  await attendreTexte(p, 'Il faisait nuit. Ajout')
  await p.context().close()
})

test('Éditer au contact d’une suggestion : la frappe va dans le texte sans la prolonger (correctif de y-prosemirror#245) ; le reste est refusé et dit', async () => {
  const { doc, p, c, fermer } = await relecture('garde', 'Il faisait nuit noire sur la ville endormie.')
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  await c.click('.bn-inline-content')
  await c.keyboard.press('Home')
  await attendre(300)
  for (let i = 0; i < 10; i++) await c.keyboard.press('ArrowRight')
  await c.keyboard.type(' donc')
  await attendrePanneau(p, /Carla ajoute «\s?donc\s?»/)
  // Juste après la suggestion : la frappe va dans le texte (le lecteur la
  // voit), et la suggestion de Carla n'en est pas prolongée.
  await p.click('.bn-inline-content')
  // Le curseur à la fin de la suggestion, posé dans la page (les flèches
  // comptent la frontière d'une suggestion pour un pas).
  const finDeLaSuggestion = () =>
    p.evaluate(() => {
      const noeud = document.createTreeWalker(document.querySelector('.bn-editor ins'), NodeFilter.SHOW_TEXT)
      let dernier = null
      while (noeud.nextNode()) dernier = noeud.currentNode
      const plage = document.createRange()
      plage.setStart(dernier, dernier.textContent.length)
      plage.collapse(true)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(plage)
      document.dispatchEvent(new Event('selectionchange'))
    })
  await finDeLaSuggestion()
  await attendre(500)
  // Deux lettres : le curseur suit la première, replacée dans le texte.
  await p.keyboard.type('QR')
  await attendreTexte(l, 'Il faisait QRnuit noire sur la ville endormie.')
  assert.equal(
    // Sans l'étiquette du curseur de Carla, que l'éditeur glisse dans le texte.
    await p.evaluate(() =>
      [...document.querySelectorAll('.bn-editor ins')]
        .map((e) => e.textContent.replace(/\u2060[^\u2060]*\u2060/g, ''))
        .join('|'),
    ),
    'donc ',
    'la suggestion n’est pas prolongée',
  )
  // Effacer ce qu'on vient de taper, juste après la suggestion : libre (24/11/2026).
  await p.keyboard.press('Backspace')
  await p.keyboard.press('Backspace')
  await attendreTexte(l, 'Il faisait nuit noire sur la ville endormie.')
  // À la fin de la suggestion de Carla, un Retour arrière la rognerait : refusé, le message le dit.
  await finDeLaSuggestion()
  await attendre(500)
  await p.keyboard.press('Backspace')
  await p.getByText('toucherait une correction en attente').waitFor()
  await attendre(800)
  await attendrePanneau(p, /Carla ajoute «\s?donc\s?»/)
  await attendreTexte(l, 'Il faisait nuit noire sur la ville endormie.')
  // Loin de la suggestion : la frappe va dans le texte (le lecteur la voit).
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type(' Fin.')
  await attendreTexte(l, 'Il faisait nuit noire sur la ville endormie. Fin.')
  // Carla pose une suggestion juste après « Fin. » ; l'éditrice annule sa dernière frappe (le « . », au
  // contact de la suggestion) : libre depuis le 24/11/2026, la suggestion n'est pas touchée.
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Encore')
  await attendrePanneau(p, /Carla ajoute «\s?Encore\s?»/)
  await p.click('.bn-inline-content')
  await p.keyboard.press('Control+z')
  // Ce que l'annulation retire dépend du regroupement de la frappe par ProseMirror : on ne le fige pas.
  await attendre(1500)
  // Les suggestions de Carla sont intactes, à son nom.
  await attendrePanneau(p, /Carla ajoute «\s?donc\s?»/)
  assert.equal(await p.locator('section[aria-label] li').count(), 2, 'deux suggestions')
  assert.doesNotMatch(await panneau(p), /QR/)
  await l.context().close()
  await fermer()
})

test('accepter aussitôt après une frappe : la liste a une frappe de retard, le geste vise la bonne suggestion', async () => {
  const { p, c, fermer } = await relecture('aussitot', 'Il faisait nuit sur la ville. Le vent soufflait.')
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Fin')
  await attendrePanneau(p, /Carla ajoute «\s?Fin\s?»/)
  // L'éditrice tape au début (loin de la suggestion) et accepte dans la foulée.
  await p.click('.bn-inline-content')
  await p.keyboard.press('Home')
  await attendre(300)
  await p.keyboard.type('Ce soir-là, ')
  await p
    .getByRole('button', { name: /^Accepter\s*:/ })
    .first()
    .click()
  await attendrePanneau(p, /Aucune correction/)
  await attendreTexte(c, 'Ce soir-là, Il faisait nuit sur la ville. Le vent soufflait. Fin')
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
  await attendrePanneau(p, /Aucune correction/)
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

/** Une éditrice (Paule) qui a écrit une phrase, une autre éditrice (Edith) et une lectrice (Lucie, qui ne voit que le texte de base). */
async function propositionEntreEditrices(nom, { texteDe }) {
  const doc = docTest(nom)
  const phrase = 'Il faisait nuit sur la ville.'
  const premiere = texteDe === 'Edith' ? await ouvrir('Edith', doc) : await ouvrir('Paule', doc)
  await premiere.click('.bn-editor')
  await premiere.keyboard.type(phrase)
  const p = texteDe === 'Edith' ? await ouvrir('Paule', doc, { role: 'editeur' }) : premiere
  const e = texteDe === 'Edith' ? premiere : await ouvrir('Edith', doc, { role: 'editeur' })
  const l = await ouvrir('Lucie', doc, { role: 'lecteur' })
  await attendreTexte(e, phrase)
  await attendreTexte(p, phrase)
  await attendreTexte(l, phrase)
  await choisirMode(p, 'Corriger')
  await p.click('.bn-inline-content')
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.type(' Ajout.')
  await attendre(1500)
  await attendrePanneau(e, /Paule ajoute «\s?Ajout\.\s?»/)
  await e
    .getByRole('button', { name: /^Accepter\s*:/ })
    .first()
    .click()
  return { p, e, l, phrase, fermer: async () => Promise.all([p, e, l].map((x) => x.context().close())) }
}

test('une éditrice propose à la suite du texte d’une autre ; cette autre l’accepte : le texte de base change chez la lectrice', async () => {
  const { l, phrase, fermer } = await propositionEntreEditrices('editrice-propose-b', { texteDe: 'Edith' })
  await attendreTexte(l, `${phrase} Ajout.`)
  await fermer()
})

// DÉFAUT CONNU (14/11/2026, campagne B10) : quand l'éditrice qui propose est
// aussi l'auteure du texte voisin, « Accepter » par une autre éditrice ne fait
// rien (la commande rend « vrai », le texte de base ne change pas) ; « Tout
// accepter » fonctionne. Les cas voisins passent (correctrice qui propose, ou
// texte voisin écrit par l'autre éditrice). Voir docs/v2-veille.md.
test(
  'une éditrice propose à la suite de son propre texte ; une autre éditrice l’accepte : le texte de base change chez la lectrice',
  { todo: 'acceptChanges d’une plage ne s’applique pas quand le texte voisin est de la même auteure' },
  async () => {
    const { l, phrase, fermer } = await propositionEntreEditrices('editrice-propose-a', { texteDe: 'Paule' })
    try {
      await attendreTexte(l, `${phrase} Ajout.`)
    } finally {
      await fermer()
    }
  },
)

test('une correctrice propose ; une éditrice qui n’a pas écrit le texte l’accepte', async () => {
  const doc = docTest('correctrice-edith')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit sur la ville.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  const e = await ouvrir('Edith', doc, { role: 'editeur' })
  await attendreTexte(c, 'Il faisait nuit sur la ville.')
  await c.click('.bn-inline-content')
  await c.keyboard.press('End')
  await attendre(300)
  await c.keyboard.type(' Ajout.')
  await attendre(1500)
  await attendrePanneau(e, /Carla ajoute «\s?Ajout\.\s?»/)
  await e
    .getByRole('button', { name: /^Accepter\s*:/ })
    .first()
    .click()
  await attendrePanneau(e, /Aucune correction/)
  await p.context().close()
  await c.context().close()
  await e.context().close()
})

/** Un document de `n` lignes, chacune corrigée par une correctrice : `n` suggestions. */
async function documentAvecSuggestions(nom, n) {
  const doc = docTest(nom)
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  for (let i = 0; i < n; i++) {
    await p.keyboard.type(`Ligne numero ${i}.`)
    if (i < n - 1) await p.keyboard.press('Enter')
  }
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendre(3000)
  await c.click('.bn-editor .bn-block-content >> nth=0')
  await c.keyboard.press('Control+Home')
  for (let i = 0; i < n; i++) {
    await c.keyboard.press('End')
    await c.keyboard.type(' x')
    if (i < n - 1) await c.keyboard.press('ArrowDown')
  }
  await attendre(2500)
  return { doc, p, c }
}
test('suggestions : « Tout accepter » et « Tout refuser » restent visibles quand la liste défile (Sylvain, 15/11/2026)', async () => {
  const { p, c } = await documentAvecSuggestions('suggestions-collees', 14)
  const bouton = p.getByRole('button', { name: 'Tout accepter' })
  await bouton.waitFor()
  const haut = (await p.locator('[role=tabpanel]:visible').first().boundingBox()).y
  await defilerJusquEnBas(bouton)
  await attendre(400)
  const apres = (await bouton.boundingBox()).y
  assert.ok(
    apres >= haut - 1 && apres < haut + 60,
    `le bouton reste en haut du volet (${apres} px, volet à ${haut} px)`,
  )
  assert.ok(await p.getByRole('button', { name: 'Tout refuser' }).isVisible(), '« Tout refuser » aussi')
  await c.context().close()
  await p.context().close()
})

test('commentaires : le filtre ne propose que « Ouverts » et « Résolus » (Sylvain, 15/11/2026)', async () => {
  const p = await ouvrir('Paule', docTest('filtre-fils'))
  await p.click('.bn-editor')
  const volet = p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' })
  if ((await volet.getAttribute('aria-expanded')) === 'false') await volet.click()
  const onglet = p.locator('[role=tab][aria-label="Commentaires"]')
  await onglet.click()
  await p.getByText('Ouverts', { exact: true }).waitFor()
  const filtre = p.locator('[role=tabpanel]:visible').getByRole('radio')
  assert.equal(await filtre.count(), 2, 'deux choix')
  assert.equal(await p.getByText('Tous', { exact: true }).count(), 0, 'pas de « Tous »')
  await p.context().close()
})

test('suggestions : un clic sur la carte, hors boutons, mène au passage (Sylvain, 15/11/2026)', async () => {
  const doc = docTest('carte-cliquable')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  await p.keyboard.type('Il faisait nuit.')
  const c = await ouvrir('Carla', doc, { role: 'correcteur' })
  await attendre(2500)
  await c.click('.bn-editor .bn-inline-content')
  await c.keyboard.press('End')
  await c.keyboard.type(' Ajout.')
  await attendre(2500)
  const carte = p.locator('.amend-suggestions-liste > li').first()
  await carte.waitFor()
  assert.equal(await carte.getAttribute('data-active'), null, 'aucune carte active au départ')
  const boite = await carte.boundingBox()
  // Un coin de la carte : ni le nom, ni le passage, ni les boutons.
  await p.mouse.click(boite.x + 3, boite.y + boite.height - 3)
  await carte.evaluate((el) => el.hasAttribute('data-active') || new Promise((r) => setTimeout(r, 400)))
  assert.notEqual(await carte.getAttribute('data-active'), null, 'la carte devient active : l’éditeur va au passage')
  await c.context().close()
  await p.context().close()
})

test('clic sur un passage commenté : le volet s’ouvre sur « Commentaires », la liste défile jusqu’au fil, qui est en surbrillance (20/11/2026)', async () => {
  const doc = docTest('fil-choisi')
  const p = await ouvrir('Paule', doc)
  await p.click('.bn-editor')
  const N = 9
  for (let i = 1; i <= N; i++) {
    await p.keyboard.type(`Paragraphe numero${i} du texte.`)
    if (i < N) await p.keyboard.press('Enter')
  }
  // Un commentaire sur le mot « numeroN » de chaque paragraphe.
  for (let i = 1; i <= N; i++) {
    await p.evaluate((mot) => {
      const t = [...document.querySelectorAll('.bn-editor .bn-inline-content')]
        .flatMap((e) => [...e.childNodes])
        .find((n) => n.textContent.includes(mot))
      const cible = t.nodeType === 3 ? t : t.firstChild
      const d = cible.textContent.indexOf(mot)
      const r = document.createRange()
      r.setStart(cible, d)
      r.setEnd(cible, d + mot.length)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
      document.dispatchEvent(new Event('selectionchange'))
    }, `numero${i}`)
    await attendre(700)
    await p.locator('.bn-formatting-toolbar button[aria-label="Ajouter un commentaire"]').click()
    await attendre(300)
    await p.keyboard.type(`Remarque ${i}, assez longue pour que la carte prenne de la place dans la liste des fils.`)
    await p.keyboard.press('Control+Enter')
    for (const t0 = Date.now(); Date.now() - t0 < 8000 && (await p.locator('.bn-thread-mark').count()) < i;)
      await attendre(150)
  }
  assert.equal(await p.locator('.bn-thread-mark').count(), N)
  const etat = () =>
    p.evaluate(() => {
      const liste = document.querySelector('.bn-threads-sidebar')
      const choisi = liste?.querySelector('.bn-thread.selected')
      const visible = (e) => {
        if (!e) return false
        const r = e.getBoundingClientRect()
        // Le conteneur qui défile : le premier ancêtre dont le contenu dépasse.
        let c = e.parentElement
        while (c && !(c.scrollHeight > c.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(c).overflowY)))
          c = c.parentElement
        const b = (c ?? document.documentElement).getBoundingClientRect()
        return r.top >= b.top - 1 && r.bottom <= b.bottom + 1
      }
      return {
        liste: Boolean(liste && liste.offsetParent),
        choisi: choisi?.innerText.match(/Remarque \d+/)?.[0] ?? null,
        visible: visible(choisi),
        fond: choisi ? getComputedStyle(choisi).backgroundColor : null,
        ordinaire: liste ? getComputedStyle(liste.querySelector('.bn-thread:not(.selected)')).backgroundColor : null,
      }
    })
  const cliquer = async (i) => {
    await p.locator('.bn-thread-mark', { hasText: `numero${i}` }).click()
    // On attend l'état voulu (volet ouvert, ce fil choisi et visible) plutôt qu'un délai fixe.
    for (const t0 = Date.now(); Date.now() - t0 < 8000; await attendre(200)) {
      const vu = await etat()
      if ((await voletOuvert()) && vu.choisi === `Remarque ${i}` && vu.visible) break
    }
    // La carte finit de s'agrandir et le défilement de se poser.
    await attendre(600)
    return { ...(await etat()), liste: await voletOuvert() }
  }
  const boutonVolet = p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' })
  // Ouvert ou fermé : ce que dit le bouton du volet (replié, son contenu reste dans la page).
  const voletOuvert = async () => (await boutonVolet.getAttribute('aria-expanded')) === 'true'
  const fermerLeVolet = async () => {
    if (await voletOuvert()) await boutonVolet.click()
    await attendre(400)
    assert.equal(await voletOuvert(), false, 'le volet est fermé')
  }
  const attendu = (i) => ({ liste: true, choisi: `Remarque ${i}`, visible: true })
  const constat = ({ liste, choisi, visible }) => ({ liste, choisi, visible })
  // Volet fermé : le clic l'ouvre sur « Commentaires », la liste défile jusqu'au dernier fil.
  await fermerLeVolet()
  const dernier = await cliquer(N)
  assert.deepEqual(constat(dernier), attendu(N))
  assert.notEqual(dernier.fond, dernier.ordinaire, 'la carte du fil choisi se distingue des autres')
  // Sa couleur : le fond clair de la couleur de l'interface, lue dans le thème de l'application.
  const fondVoulu = await p.evaluate(() => {
    const e = document.createElement('i')
    e.style.backgroundColor = 'var(--mantine-primary-color-light)'
    document.querySelector('.amend-fils').append(e)
    const c = getComputedStyle(e).backgroundColor
    e.remove()
    return c
  })
  assert.equal(dernier.fond, fondVoulu)
  // Un autre passage : la liste remonte jusqu'à son fil.
  assert.deepEqual(constat(await cliquer(1)), attendu(1))
  assert.deepEqual(constat(await cliquer(N)), attendu(N))
  // Volet refermé, le même passage cliqué de nouveau : il se rouvre sur le même fil.
  await fermerLeVolet()
  assert.deepEqual(constat(await cliquer(N)), attendu(N))
  if (process.env.CAPTURE) await p.screenshot({ path: `${process.env.CAPTURE}/fil-choisi.png` })
  await p.context().close()
})

test('clic sur une correction dans le texte : le volet s’ouvre sur « Corrections », la liste défile jusqu’à sa carte, qui est en surbrillance (22/11/2026)', async () => {
  const N = 14
  const { p, c } = await documentAvecSuggestions('correction-choisie', N)
  const cartes = p.locator('.amend-suggestions-liste > li')
  for (const t0 = Date.now(); Date.now() - t0 < 10000 && (await cartes.count()) < N;) await attendre(200)
  assert.equal(await cartes.count(), N)
  const boutonVolet = p.getByRole('button', { name: 'Corrections, commentaires et Margo (IA)' })
  const voletOuvert = async () => (await boutonVolet.getAttribute('aria-expanded')) === 'true'
  const etat = () =>
    p.evaluate(() => {
      const liste = document.querySelector('.amend-suggestions-liste')
      const active = liste?.querySelector('[data-active]')
      const cartes = [...(liste?.children ?? [])]
      const visible = (e) => {
        if (!e) return false
        let d = e.parentElement
        while (d && !(d.scrollHeight > d.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(d).overflowY)))
          d = d.parentElement
        const b = (d ?? document.documentElement).getBoundingClientRect()
        const r = e.getBoundingClientRect()
        return r.top >= b.top - 1 && r.bottom <= b.bottom + 1
      }
      return {
        rang: active ? cartes.indexOf(active) : null,
        visible: visible(active),
        fond: active ? getComputedStyle(active).backgroundColor : null,
        ordinaire: cartes.find((x) => x !== active)
          ? getComputedStyle(cartes.find((x) => x !== active)).backgroundColor
          : null,
      }
    })
  // Les corrections de Carla sont les « x » ajoutés en fin de chaque ligne, dans l'ordre du texte.
  const marques = p.locator('.bn-editor ins .bn-suggestion-mark')
  const cliquer = async (i) => {
    await marques.nth(i).click()
    for (const t0 = Date.now(); Date.now() - t0 < 8000; await attendre(200)) {
      const vu = await etat()
      if ((await voletOuvert()) && vu.rang === i && vu.visible) break
    }
    await attendre(400)
    return { ...(await etat()), ouvert: await voletOuvert() }
  }
  const attendu = (i) => ({ ouvert: true, rang: i, visible: true })
  const constat = ({ ouvert, rang, visible }) => ({ ouvert, rang, visible })
  // Volet fermé, onglet « Commentaires » laissé ouvert avant : le clic rouvre le volet sur « Corrections ».
  await p.getByRole('tab', { name: /Commentaires/ }).click()
  if (await voletOuvert()) await boutonVolet.click()
  await attendre(400)
  assert.equal(await voletOuvert(), false)
  const derniere = await cliquer(N - 1)
  assert.deepEqual(constat(derniere), attendu(N - 1))
  assert.notEqual(derniere.fond, derniere.ordinaire, 'la carte choisie se distingue des autres')
  assert.equal(await p.getByRole('tab', { name: /Corrections/ }).getAttribute('aria-selected'), 'true')
  // Une autre correction, en haut du texte : la liste remonte jusqu'à sa carte.
  assert.deepEqual(constat(await cliquer(0)), attendu(0))
  // Une sélection étendue jusqu'à une correction (majuscule + clic) n'ouvre rien : le volet reste fermé.
  await boutonVolet.click()
  await attendre(400)
  assert.equal(await voletOuvert(), false)
  await p.locator('.bn-editor .bn-inline-content').first().click()
  await attendre(300)
  await marques.nth(3).click({ modifiers: ['Shift'] })
  await attendre(1200)
  assert.equal(await voletOuvert(), false, 'une sélection étendue n’ouvre pas le volet')
  if (process.env.CAPTURE) await p.screenshot({ path: `${process.env.CAPTURE}/correction-choisie.png` })
  await p.context().close()
  await c.context().close()
})

test('garde-fou réduit (24/11/2026) : un commentaire supprimé ne bloque rien ; libre à côté d’une correction ; refusé si elle serait déplacée ou rognée', async () => {
  const PHRASE = 'Il faisait nuit sur la ville endormie depuis longtemps.'
  const { p, c, fermer } = await relecture('garde-reduit', PHRASE)
  const ecran = () =>
    p.evaluate(() =>
      [...document.querySelectorAll('.bn-editor .bn-block-content')]
        .map((b) => {
          const copie = b.cloneNode(true)
          copie.querySelectorAll('.ProseMirror-widget, .bn-collaboration-cursor__base').forEach((x) => x.remove())
          return copie.textContent
        })
        .join(' ¶ '),
    )
  const curseur = async (motif, apres) => {
    await p.evaluate(
      ([motif, apres]) => {
        const parcours = document.createTreeWalker(document.querySelector('.bn-editor'), NodeFilter.SHOW_TEXT)
        for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
          const i = n.data.indexOf(motif)
          if (i < 0) continue
          const plage = document.createRange()
          plage.setStart(n, apres ? i + motif.length : i)
          plage.collapse(true)
          getSelection().removeAllRanges()
          getSelection().addRange(plage)
          document.dispatchEvent(new Event('selectionchange'))
          return
        }
        throw new Error(`motif absent : ${motif}`)
      },
      [motif, apres],
    )
    await attendre(500)
  }
  const refus = p.getByText('toucherait une correction en attente')
  // 1. Un commentaire posé puis supprimé : on efface dans le mot et autour, sans refus.
  await p.getByText('endormie', { exact: false }).first().dblclick()
  await p.locator('.bn-formatting-toolbar button[aria-label="Ajouter un commentaire"]').click()
  await attendre(400)
  await p.keyboard.type('Pourquoi ?')
  await p.keyboard.press('Control+Enter')
  await p.locator('.bn-thread-mark').first().waitFor()
  await p.locator('.bn-thread-mark').first().click()
  await p.locator('.bn-threads-sidebar .bn-thread').first().waitFor()
  await p.locator('.bn-threads-sidebar .bn-thread .bn-editor').first().hover()
  await p.locator('.bn-threads-sidebar [data-test="plusd\'actions"]').first().click()
  await p.getByRole('menuitem', { name: 'Supprimer le commentaire' }).click()
  await p.locator('.bn-threads-sidebar .bn-thread').first().waitFor({ state: 'detached' })
  await attendre(1500)
  await curseur('endorm', true)
  await p.keyboard.press('Backspace')
  await curseur('ville', true)
  await p.keyboard.press('Backspace')
  await attendreTexte(c, 'Il faisait nuit sur la vill endorie depuis longtemps.')
  assert.equal(await refus.count(), 0, 'aucun refus près d’un commentaire supprimé')
  // 2. Carla propose « très » devant « longtemps » ; à côté, l'éditrice écrit et efface librement.
  await c.click('.bn-inline-content')
  await curseurDe(c, 'longtemps')
  await c.keyboard.type('très ')
  await attendrePanneau(p, /Carla ajoute «\s?très\s?»/)
  await curseur('depuis', true)
  await p.keyboard.press('Backspace')
  await curseur('longtemp', true)
  await p.keyboard.press('Backspace')
  await attendre(800)
  assert.equal(await ecran(), 'Il faisait nuit sur la vill endorie depui très longtems.')
  assert.equal(await refus.count(), 0, 'aucun refus dans les mots voisins d’une correction')
  // 3. Entrée avant la correction (elle passerait dans un nouveau paragraphe) : refusée, et dite.
  await curseur('nuit', true)
  await p.keyboard.press('Enter')
  await refus.waitFor()
  assert.equal(await ecran(), 'Il faisait nuit sur la vill endorie depui très longtems.')
  // 4. Entrée après la correction : libre.
  await p.keyboard.press('End')
  await attendre(300)
  await p.keyboard.press('Enter')
  await p.keyboard.type('Suite.')
  await attendre(800)
  assert.equal(await ecran(), 'Il faisait nuit sur la vill endorie depui très longtems. ¶ Suite.')
  await attendrePanneau(p, /Carla ajoute «\s?très\s?»/)
  assert.equal(await p.locator('section[aria-label] li').count(), 1, 'la correction de Carla est intacte')
  await fermer()
})

/** Pose le curseur d'une page juste devant un mot. */
async function curseurDe(page, motif) {
  await page.evaluate((motif) => {
    const parcours = document.createTreeWalker(document.querySelector('.bn-editor'), NodeFilter.SHOW_TEXT)
    for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
      const i = n.data.indexOf(motif)
      if (i < 0) continue
      const plage = document.createRange()
      plage.setStart(n, i)
      plage.collapse(true)
      getSelection().removeAllRanges()
      getSelection().addRange(plage)
      document.dispatchEvent(new Event('selectionchange'))
      return
    }
    throw new Error(`motif absent : ${motif}`)
  }, motif)
  await attendre(500)
}
