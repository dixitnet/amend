// T5 — le back-office en fiche (Sylvain, 27/11/2026 : « Reprends le reste du back en fonction de ce design ») :
// une page sans menu, les chiffres de l'instance, puis des lignes en clair qui s'ouvrent, une à la fois.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { preparerServices, construireClient, demarrerPile, POSTGRES } from '../../exploitation/dev/pile.mjs'
import { ouvrirComptes } from '../../adaptateurs/postgres/comptes.js'
import { lancerNavigateur, attendre, confirmer } from './outils.mjs'

// L'administratrice de la pile : une vraie adresse (un compte de développement ou d'essai ne peut pas l'être).
const ADMIN = `ada-${Date.now().toString(36)}@exemple.fr`

let pile, nav
before(async () => {
  preparerServices()
  construireClient()
  process.env.V2_ADMINS = ADMIN
  pile = await demarrerPile({ port: 4375, portCollab: 4475 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** Ouvre une session par le lien envoyé à une adresse, comme la page le fait : rend le cookie de session. */
async function connexion(adresse) {
  // Le service est fermé : un lien n'est envoyé qu'à une personne connue. On l'inscrit d'abord.
  const comptes = await ouvrirComptes(POSTGRES)
  const personne = await comptes.personneOuNouvelle(adresse)
  await comptes.definirNom(personne.id, 'Ada')
  await comptes.fermer()
  const json = { method: 'POST', headers: { 'content-type': 'application/json' } }
  await fetch(`${pile.url}/api/connexion`, { ...json, body: JSON.stringify({ courriel: adresse }) })
  for (const t0 = Date.now(); Date.now() - t0 < 8000; await attendre(200)) {
    const courriers = await (await fetch(`${pile.url}/api/dev/courriers`)).json()
    const m = courriers.reverse().find((c) => c.a === adresse)
    if (!m) continue
    const r = await fetch(`${pile.url}${new URL(m.texte.match(/https?:\/\/\S+/)[0]).pathname}`, json)
    assert.equal(r.status, 200)
    return r.headers.get('set-cookie').split(';')[0]
  }
  throw new Error(`aucun courrier pour ${adresse}`)
}

test('back-office : la fiche se lit fermée, une ligne s’ouvre à la fois, #/admin/modeles ouvre les modèles', async () => {
  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const [nom, valeur] = (await connexion(ADMIN)).split('=')
  await ctx.addCookies([{ name: nom, value: valeur, url: pile.url }])
  const page = await ctx.newPage()
  await page.goto(`${pile.url}/#/admin`)
  await page.getByRole('heading', { name: 'Administration', level: 1 }).waitFor()
  // Plus de menu de rubriques ; trois rubriques, neuf lignes, chacune avec son résumé.
  assert.equal(await page.getByRole('navigation').count(), 0)
  for (const rubrique of ['L’instance', 'Les livres', 'Système'])
    await page.getByRole('heading', { name: rubrique, level: 2 }).waitFor()
  const ligne = (motif) => page.getByRole('button', { name: motif })
  for (const motif of [
    /^Apparence\s*.+, \S+/,
    /^IA \(Margo\)\s*\S+/,
    /^Connecteur Claude\s*\S+/,
    /^Modèles de mise en page\s*\d+ modèles? · par défaut.: \S+/,
    /^Polices\s*\d+ familles, \d+ proposées · /,
    /^Images\s*analyse des images orphelines/,
    /^Version\s*\S+/,
    /^Mémoire sur sept jours\s*serveur.: \d+/,
    /^Journal des sept derniers jours\s*\S+/,
  ])
    await ligne(motif).waitFor()
  // Les chiffres de l'instance, en cartes.
  for (const chiffre of ['Comptes', 'Documents', 'Équipes'])
    await page.getByText(chiffre, { exact: true }).first().waitFor()
  // Fermée, une ligne ne montre pas ses commandes ; ouverte, si. Une seule à la fois.
  assert.equal(await page.getByRole('combobox', { name: 'Couleur' }).count(), 0)
  await ligne(/^Apparence/).click()
  await page.getByRole('combobox', { name: 'Couleur' }).waitFor()
  await ligne(/^Modèles de mise en page/).click()
  await page.getByRole('button', { name: 'Nouveau modèle' }).waitFor()
  assert.equal(await page.getByRole('combobox', { name: 'Couleur' }).count(), 0)
  // La liste des modèles, à deux niveaux : le nom, qui ouvre la fiche, puis format, police et usage en clair.
  await page.getByRole('button', { name: 'Nouveau modèle' }).click()
  const nomDuModele = `Fiche ${Date.now().toString(36)}`
  await page.getByRole('textbox', { name: 'Nom du modèle' }).fill(nomDuModele)
  await page.getByRole('button', { name: 'Créer' }).click()
  await page.getByRole('link', { name: nomDuModele }).waitFor()
  await page
    .getByText(/210 × 297 mm · EB Garamond · aucun document/)
    .first()
    .waitFor()
  await ligne(/^Modèles de mise en page\s*\d+ modèles · par défaut/).waitFor()
  // Les polices : la famille, puis son usage.
  await ligne(/^Polices/).click()
  await page.getByRole('rowheader', { name: /^EB Garamond/ }).waitFor()
  // Au format S, la fiche tient dans la largeur.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'pas de défilement de côté')
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE, fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  // L'adresse des modèles ouvre leur ligne.
  await page.goto(`${pile.url}/#/admin/modeles`)
  await page.reload()
  await page.getByRole('link', { name: nomDuModele }).waitFor()
  if (process.env.CAPTURE)
    await page.screenshot({ path: process.env.CAPTURE.replace('.png', '-L.png'), fullPage: true })
  // Ménage : le modèle créé pour l'essai est supprimé.
  await page.getByRole('button', { name: `Actions pour « ${nomDuModele} »` }).click()
  await page.getByRole('menuitem', { name: 'Supprimer' }).click()
  await confirmer(page)
  await page.getByRole('link', { name: nomDuModele }).waitFor({ state: 'detached' })
  await ctx.close()
})
