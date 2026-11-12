// T5 : les exports Markdown et PDF dans un vrai navigateur (étape 7) : la
// fenêtre « Exporter » propose un fichier, le texte de base y est (pas les
// suggestions), le PDF est au format du modèle « A4 simple », ou d'un
// modèle d'équipe réglé par son gestionnaire (ADR 0011).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, docTest, ouvrir as ouvrirSur, attendreTexte, attendreEtat, menuDe } from './outils.mjs'

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

/** Ouvre la fenêtre « Exporter », choisit le format (et le modèle), et rend le fichier téléchargé. */
async function telecharger(page, format, { modele, retenir = false } = {}) {
  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Exporter…' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Exporter' })
  await fenetre.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: format, exact: true }).click()
  if (modele) {
    await fenetre.getByRole('combobox', { name: 'Modèle de mise en page' }).click()
    await page.getByRole('option', { name: modele, exact: true }).click()
  }
  if (retenir) await fenetre.getByRole('checkbox', { name: 'Retenir ce modèle pour le document' }).check()
  const [fichier] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    fenetre.getByRole('button', { name: 'Exporter', exact: true }).click(),
  ])
  await fenetre.waitFor({ state: 'detached' })
  return { nom: fichier.suggestedFilename(), contenu: await readFile(await fichier.path()) }
}

test('Markdown : le texte du document, titre compris, sous le nom du document', async () => {
  const page = await ouvrir('Alice', docTest('md'))
  await page.click('.bn-editor')
  await page.keyboard.type('# Premier chapitre')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Un été sans fin.')
  await attendreTexte(page, 'Premier chapitre\nUn été sans fin.')
  const { nom, contenu } = await telecharger(page, 'Markdown')
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
  const { nom, contenu } = await telecharger(page, 'PDF', { modele: 'A4 simple' })
  assert.match(nom, /\.pdf$/)
  const brut = contenu.toString('latin1')
  assert.ok(brut.startsWith('%PDF-'))
  // 210 × 297 mm (le modèle du code, choisi ici : le défaut de l'instance
  // dépend de la base), police du modèle incorporée.
  assert.match(brut, /MediaBox ?\[0 0 595\.27\d* 841\.88\d*\]/)
  assert.match(brut, /EBGaramond/)
})

test('modèle d’équipe : le gestionnaire le règle, l’export l’applique et le retient pour le document', async () => {
  const page = await ouvrir('Gaëlle', docTest('modele'))
  const api = (methode, chemin, corps) =>
    page.evaluate(
      async ([m, c, b]) => {
        const r = await fetch(c, {
          method: m,
          headers: { 'content-type': 'application/json' },
          body: b === undefined ? undefined : JSON.stringify(b),
        })
        return r.json()
      },
      [methode, chemin, corps],
    )
  const nomEquipe = `Éditions ${Date.now().toString(36)}`
  const equipe = await api('POST', '/api/equipes', { nom: nomEquipe })
  const doc = await api('POST', '/api/documents', { titre: 'Livre', equipe: equipe.id })
  await page.evaluate((id) => (location.hash = `#${id}`), doc.id)
  await page.waitForSelector('.bn-editor')
  await attendreEtat(page, 'connecte')
  await page.click('.bn-editor')
  await page.keyboard.type('Le premier mot.')
  await attendreTexte(page, 'Le premier mot.')

  // Le gestionnaire crée le modèle et le règle, dans la fenêtre de l'équipe.
  await menuDe(page, { nom: nomEquipe })
  await page.getByRole('menuitem', { name: 'Modèles de mise en page' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Modèles de mise en page' })
  await fenetre.getByRole('textbox', { name: 'Nom du modèle' }).fill('Collection')
  await fenetre.getByRole('button', { name: 'Créer' }).click()
  await fenetre.getByRole('button', { name: 'Régler « Collection »' }).click()
  await fenetre.getByRole('textbox', { name: 'Largeur de la page (mm)' }).fill('135')
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click()
  await fenetre.getByText('Modèle enregistré.').waitFor()
  await fenetre.getByRole('button', { name: 'Fermer' }).click()

  // L'export le propose, l'applique (135 mm de large, sur l'A4 de départ) et le retient.
  const { contenu } = await telecharger(page, 'PDF', { modele: 'Collection', retenir: true })
  assert.match(contenu.toString('latin1'), /MediaBox ?\[0 0 382\.677\d* 841\.88\d*\]/)
  const vue = await api('GET', `/api/documents/${doc.id}/modeles`)
  assert.equal(vue.choisi, vue.modeles.find((m) => m.nom === 'Collection').id)
  assert.equal(vue.retenu, vue.choisi)
})
