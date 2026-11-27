// T5 : les exports Markdown et PDF dans un vrai navigateur (étape 7) : la
// fenêtre « Exporter » propose un fichier, le texte de base y est (pas les
// suggestions), le PDF est au format du modèle « A4 simple », ou d'un
// modèle d'équipe réglé par son gestionnaire (ADR 0011).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
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
async function telecharger(page, format, { modele } = {}) {
  await page.getByRole('button', { name: 'Autres actions' }).click()
  await page.getByRole('menuitem', { name: 'Exporter…' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Exporter' })
  await fenetre.getByRole('combobox', { name: 'Format' }).click()
  await page.getByRole('option', { name: format, exact: true }).click()
  if (modele) {
    await fenetre.getByRole('combobox', { name: 'Modèle de mise en page' }).click()
    await page.getByRole('option', { name: modele, exact: true }).click()
  }
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
  await fenetre.getByRole('button', { name: 'Nouveau modèle' }).click()
  await fenetre.getByRole('textbox', { name: 'Nom du modèle' }).fill('Collection')
  await fenetre.getByRole('button', { name: 'Créer' }).click()
  // Le nom du modèle mène à sa page de réglage (13/11/2026).
  await fenetre.getByRole('link', { name: 'Collection' }).click()
  await page.getByRole('heading', { name: 'Régler « Collection »' }).waitFor()
  // La fiche (27/11/2026) : le modèle se lit en clair, une ligne par réglage ; une ligne s'ouvre pour être réglée.
  const ligne = (nom) => page.getByRole('button', { name: nom })
  await ligne(/^Format\s*210 × 297 mm/).click()
  await page.getByRole('textbox', { name: 'Largeur de la page (mm)' }).fill('135')
  await ligne(/^Format\s*135 × 297 mm/).waitFor()
  // Une seule ligne ouverte à la fois : ouvrir le titre 3 referme le format, sans perdre ce qu'on a réglé.
  await ligne(/^Titre 3\s*11 pt, italique · 1 avant, 0 après/).click()
  assert.equal(await page.getByRole('textbox', { name: 'Largeur de la page (mm)' }).count(), 0)
  await page.getByText('Sur une ligne, ce titre occupe 1 ligne de la grille').waitFor()
  // L'aperçu suit ce qu'on règle : la page courante, le titre 3 encadré.
  const apercu = page.getByRole('region', { name: 'Aperçu de la page' })
  assert.equal(await apercu.getByRole('radio', { name: 'Page courante' }).isChecked(), true)
  await page.locator('.amend-apercu [data-ouvert]', { hasText: 'Compter plutôt que mesurer' }).waitFor()
  // Une taille plus grande : le titre occupe deux lignes ; un blanc d'une demi-ligne seul : une demi-ligne est ajoutée.
  await page.getByRole('textbox', { name: 'Corps (pt)' }).fill('13')
  await page.getByText('Sur une ligne, ce titre occupe 2 lignes de la grille').waitFor()
  await page.getByRole('textbox', { name: 'Blanc avant (lignes)' }).fill('1,5')
  await page.getByText(/une demi-ligne est ajoutée avant/).waitFor()
  await page.locator('.amend-apercu-vide[data-sorte="ajout"]').first().waitFor({ state: 'attached' })
  await page.getByRole('textbox', { name: 'Blanc après (lignes)' }).fill('0,5')
  await ligne(/^Titre 3\s*13 pt, italique · 1 ½ avant, ½ après/).waitFor()
  assert.equal(await page.getByText(/une demi-ligne est ajoutée avant/).count(), 0)
  // Un style peut avoir sa police (Sylvain, 27/11/2026) : par défaut, celle du texte.
  const police = page.getByRole('combobox', { name: 'Police' })
  assert.equal(await police.inputValue(), 'Même police que le texte')
  await police.click()
  await page.getByRole('option', { name: 'Inter', exact: true }).click()
  await ligne(/^Titre 3\s*Inter, 13 pt, italique · 1 ½ avant, ½ après/).waitFor()
  // L'aperçu compose ce titre dans sa police.
  await page.waitForFunction(() => {
    const titre = document.querySelector('.amend-apercu [data-ouvert]')
    return titre && getComputedStyle(titre).fontFamily.startsWith('Inter')
  })
  // Dans l'aperçu, chaque paragraphe commence sur une ligne de la grille.
  const ecart = await page.evaluate(() => {
    const zone = document.querySelector('.amend-apercu-zone')
    const pas = parseFloat(getComputedStyle(zone).lineHeight)
    const haut = zone.getBoundingClientRect().top
    return Math.max(
      ...[...zone.querySelectorAll('p')].map((p) => {
        const n = (p.getBoundingClientRect().top - haut) / pas
        return Math.abs(n - Math.round(n))
      }),
    )
  })
  assert.ok(ecart < 0.02, `un paragraphe de l’aperçu est hors grille (${ecart})`)
  // Au format S, pas d'aperçu (Sylvain, 27/11/2026) : la fiche seule, sans défilement de côté.
  const ecran = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 844 })
  await apercu.waitFor({ state: 'hidden' })
  await page.getByRole('textbox', { name: 'Blanc avant (lignes)' }).waitFor()
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'la fiche tient dans la largeur',
  )
  await page.setViewportSize(ecran)
  await apercu.waitFor()
  // Le titre 2 peut ouvrir une page comme le titre 1 : son début est dans sa fiche.
  await ligne(/^Titre 2\s*11 pt, italique/).click()
  await page
    .getByRole('radiogroup', { name: /Titre 2.: début/ })
    .getByText('Belle page (page de droite)')
    .click()
  await ligne(/^Titre 2\s*belle page \(page de droite\) · 11 pt/).waitFor()
  await page.getByText(/son blanc avant se compte depuis la première ligne de la page/).waitFor()
  // Le numéro de page se règle alors pour ce niveau aussi ; les en-têtes ont leur allure.
  await ligne(/^Numéros de page/).click()
  await page.getByRole('switch', { name: 'Numéro de page sur une page ouverte par un titre 2' }).waitFor()
  await ligne(/^En-têtes\s*à gauche.: rien · à droite.: rien/).click()
  await page.getByRole('group', { name: 'Allure' }).getByText('Petites capitales').waitFor()
  // Plus de lignes que la page n'en contient : le modèle est impossible, la fiche le dit.
  await ligne(/^Hauteur du texte\s*50 lignes par page · pied de/).click()
  await page.getByRole('textbox', { name: 'Lignes par page' }).fill('90')
  await page.getByText(/Ce modèle de mise en page est impossible/).waitFor()
  await page.getByRole('textbox', { name: 'Lignes par page' }).fill('48')
  await ligne(/^Hauteur du texte\s*48 lignes par page · pied de/).waitFor()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  // De retour : le document, avec la liste des modèles rouverte.
  const liste = page.getByRole('dialog', { name: 'Modèles de mise en page' })
  await liste.getByRole('link', { name: 'Collection' }).waitFor()
  await liste.getByText('135 × 297 mm').waitFor()
  await liste.getByRole('button', { name: 'Fermer' }).click()

  // L'export le propose, l'applique (135 mm de large, sur l'A4 de départ) et le
  // retient pour le document, sans case à cocher : le dernier modèle utilisé.
  const { contenu } = await telecharger(page, 'PDF', { modele: 'Collection' })
  assert.match(contenu.toString('latin1'), /MediaBox ?\[0 0 382\.677\d* 841\.88\d*\]/)
  const vue = await api('GET', `/api/documents/${doc.id}/modeles`)
  assert.equal(vue.choisi, vue.modeles.find((m) => m.nom === 'Collection').id)
  const regle = (await api('GET', `/api/equipes/${equipe.id}`)).modeles.find((m) => m.nom === 'Collection').complet
  assert.equal(regle.ouverture2.debut, 'belle-page', 'le début du titre 2 est enregistré')
  assert.deepEqual(
    [
      regle.grille.lignes,
      regle.styles.titre3.police,
      regle.styles.titre3.corps,
      regle.styles.titre3.blancAvant,
      regle.styles.titre3.blancApres,
    ],
    [48, 'Inter', 13, 1.5, 0.5],
    'les lignes par page, la police et les blancs du titre 3 sont enregistrés',
  )
  assert.equal(vue.retenu, vue.choisi)
})

/** Les largeurs (en points) des images posées sur les pages d'un PDF : le `cm` qui précède un `Do`. */
function largeursDImages(pdf) {
  const largeurs = []
  let debut = 0
  for (;;) {
    const i = pdf.indexOf('stream\n', debut)
    if (i < 0) break
    const j = pdf.indexOf('\nendstream', i)
    if (j < 0) break
    debut = j + 10
    let texte
    try {
      texte = inflateSync(pdf.subarray(i + 7, j)).toString('latin1')
    } catch {
      continue
    }
    for (const m of texte.matchAll(/([\d.]+) 0 0 ([\d.]+) [-\d.]+ [-\d.]+ cm\s*\/\S+ Do/g)) largeurs.push(Number(m[1]))
  }
  return largeurs
}

test('PDF : une image occupe toute la largeur de la page hors marges (170 mm sur l’A4 simple), même lourde et large (Sylvain, 14/11/2026)', async () => {
  const page = await ouvrir('Alice', docTest('pdf-image'))
  await page.click('.bn-editor')
  // Un PNG de 3 000 × 100 pixels, plus large que la page : l'éditeur le plafonne, l'export doit le caler.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 3000
    c.height = 100
    const g = c.getContext('2d')
    g.fillRect(0, 0, 3000, 100)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  await page.keyboard.type('/')
  await page.waitForSelector('.bn-suggestion-menu')
  await page.locator('.bn-suggestion-menu-item', { hasText: 'Image' }).first().click()
  const champ = page.locator('.bn-panel input[type=file], input[type=file]').first()
  await champ.waitFor({ state: 'attached' })
  await champ.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.from(png) })
  await page.locator('.bn-editor img[src*="/images/"]').waitFor({ timeout: 15000 })
  const { contenu } = await telecharger(page, 'PDF', { modele: 'A4 simple' })
  const largeurs = largeursDImages(contenu)
  assert.ok(largeurs.length >= 1, 'une image est posée sur une page')
  // 210 mm moins deux marges de 20 mm : 170 mm, soit 481,9 pt.
  for (const l of largeurs) assert.ok(Math.abs(l - 481.89) < 1, `largeur de l'image : ${l} pt (attendu 481,9 pt)`)
  await page.context().close()
})
