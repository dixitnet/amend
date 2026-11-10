// T5 : les exports Markdown et PDF dans un vrai navigateur (étape 7) : le
// bouton propose un fichier, le texte de base y est (pas les suggestions), le
// PDF est au format du modèle « TàT - Poche ».
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte } from './outils.mjs'

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

/** Clique un bouton d'export et rend le fichier téléchargé. */
async function telecharger(page, libelle) {
  const [fichier] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page
      .getByRole('button', { name: 'Autres actions' })
      .click()
      .then(() => page.getByRole('menuitem', { name: libelle }).click()),
  ])
  return { nom: fichier.suggestedFilename(), contenu: await readFile(await fichier.path()) }
}

test('Markdown : le texte du document, titre compris, sous le nom du document', async () => {
  const page = await ouvrir('Alice', docTest('md'))
  await page.click('.bn-editor')
  await page.keyboard.type('# Premier chapitre')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Un été sans fin.')
  await attendreTexte(page, 'Premier chapitre\nUn été sans fin.')
  const { nom, contenu } = await telecharger(page, 'Exporter en Markdown')
  assert.match(nom, /\.md$/)
  const md = contenu.toString('utf8')
  assert.match(md, /^# Premier chapitre/m)
  assert.ok(md.includes('Un été sans fin.'))
  assert.equal(md, md.normalize('NFC'))
})

test('PDF : un livre au format du modèle, compilé dans le navigateur', async () => {
  const page = await ouvrir('Alice', docTest('pdf'))
  await page.click('.bn-editor')
  await page.keyboard.type('# Petit conte immoral')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Le second conte est parfaitement immoral.')
  await attendreTexte(page, 'Petit conte immoral\nLe second conte est parfaitement immoral.')
  const { nom, contenu } = await telecharger(page, 'Exporter en PDF')
  assert.match(nom, /\.pdf$/)
  const brut = contenu.toString('latin1')
  assert.ok(brut.startsWith('%PDF-'))
  // 120 × 180 mm, police du modèle incorporée.
  assert.match(brut, /MediaBox ?\[0 0 340\.157\d* 510\.236\d*\]/)
  assert.match(brut, /EBGaramond/)
})
