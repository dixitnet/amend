// Gestes communs des tests T5 (pile complète dans un navigateur).
// Le moteur se choisit par NAVIGATEUR=chromium|webkit|firefox (chromium par défaut).
import assert from 'node:assert/strict'
import * as playwright from 'playwright'

export const NAVIGATEUR = process.env.NAVIGATEUR || 'chromium'
export const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
// Firefox : le presse-papiers de la page (écriture sans geste ni autorisation,
// pour coller pour de vrai dans les essais ; campagne du 14/11/2026).
const PREFS_FIREFOX = {
  'dom.events.asyncClipboard.clipboardItem': true,
  'dom.events.testing.asyncClipboard': true,
  'dom.events.asyncClipboard.readText': true,
}
export const lancerNavigateur = () =>
  playwright[NAVIGATEUR].launch(NAVIGATEUR === 'firefox' ? { firefoxUserPrefs: PREFS_FIREFOX } : undefined)
export const docTest = (nom) => `t5-${nom}-${Date.now().toString(36)}`

/** Le cookie de session du propriétaire de chaque document ouvert par ces
 * outils : la première personne qui ouvre un document le crée (client en
 * développement), puis donne un rôle aux suivantes. */
const proprietaires = new Map()
const cle = (base, docId) => `${base} ${docId}`

/** Le propriétaire d'un document donne `role` (ou retire, `null`) à `nom`. */
export async function donnerRole(base, docId, nom, role) {
  const r0 = await fetch(`${base}/api/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom }),
  })
  const { id } = await r0.json()
  const r = await fetch(`${base}/api/dev/acces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: proprietaires.get(cle(base, docId)) },
    body: JSON.stringify({ document: docId, personne: id, role }),
  })
  assert.equal(r.status, 200, `rôle ${role} pour ${nom} sur ${docId}`)
}

/** Une personne connectée sur un document ; le créateur en est propriétaire,
 * les suivantes reçoivent `role` (éditeur par défaut). `contexte` : options
 * du navigateur (taille, écran tactile). */
export async function ouvrir(nav, base, nom, docId, { locale = 'fr-FR', role = 'editeur', contexte = {} } = {}) {
  if (proprietaires.has(cle(base, docId))) await donnerRole(base, docId, nom, role)
  const ctx = await nav.newContext({ locale, ...contexte })
  // Les connexions WebSocket de la page, pour pouvoir les couper : `setOffline`
  // ne ferme pas celles qui sont ouvertes sous Firefox et WebKit, ni ne bloque
  // les nouvelles (campagne du 14/11/2026). `__amendCoupe` : plus aucune
  // connexion ne reste ouverte ni ne s'ouvre.
  await ctx.addInitScript(() => {
    const Natif = window.WebSocket
    window.__amendSockets = []
    window.__amendCoupe = false
    class Coupable extends Natif {
      constructor(...args) {
        super(...args)
        window.__amendSockets.push(this)
        if (window.__amendCoupe) setTimeout(() => this.close(), 0)
      }
      send(donnees) {
        if (!window.__amendCoupe) super.send(donnees)
      }
    }
    window.WebSocket = Coupable
  })
  const page = await ctx.newPage()
  await page.goto(`${base}/#${docId}`)
  await page.waitForSelector('input[name=nom], .bn-editor')
  if (await page.$('input[name=nom]')) {
    await page.fill('input[name=nom]', nom)
    await page.click('button[type=submit]')
  }
  await page.waitForSelector('.bn-editor')
  if (!proprietaires.has(cle(base, docId))) {
    const c = (await ctx.cookies(base)).find((x) => x.name === 'amend2_session')
    proprietaires.set(cle(base, docId), `${c.name}=${c.value}`)
  }
  await attendreEtat(page, 'connecte')
  return page
}

/** L'état de la connexion (`connecte`, `connexion`, `deconnecte`), porté en
 * attribut par la coquille : rien n'est affiché, hors ligne mis à part. */
export async function attendreEtat(page, attendu, delai = 20000) {
  await page.waitForFunction((a) => document.querySelector('[data-connexion]')?.dataset.connexion === a, attendu, {
    timeout: delai,
  })
}

/** Le texte des blocs, un par ligne, sans les étiquettes des curseurs distants. */
export const texte = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.bn-editor .bn-inline-content')]
      .map((el) => {
        const copie = el.cloneNode(true)
        copie.querySelectorAll('.ProseMirror-widget').forEach((c) => c.remove())
        return copie.textContent.replace(/\u2060/g, '')
      })
      .filter((l, i, tout) => l || i < tout.length - 1)
      .join('\n'),
  )
export async function attendreTexte(page, attendu, delai = 10000) {
  for (const t0 = Date.now(); Date.now() - t0 < delai; await attendre(100)) if ((await texte(page)) === attendu) return
  assert.equal(await texte(page), attendu)
}

export async function session(base, nom) {
  const r = await fetch(`${base}/api/dev/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nom }),
  })
  assert.equal(r.status, 200)
  return r.headers.get('set-cookie').split(';')[0]
}

/** Clique l'action de la fenêtre de confirmation ouverte : son dernier bouton (« Annuler » vient d'abord, comme dans Docs). */
export async function confirmer(page) {
  const fenetre = page.getByRole('dialog')
  await fenetre.waitFor()
  await fenetre.getByRole('button').last().click()
  await fenetre.waitFor({ state: 'detached' })
}

/** L'onglet « Documents » du volet gauche (formats L et M) : son contenu. */
export async function voletDocuments(page) {
  await page.getByRole('tab', { name: 'Documents' }).click()
  const panneau = page.getByRole('tabpanel', { name: 'Documents' })
  await panneau.getByRole('searchbox').waitFor()
  return panneau
}

/** « Nouveau document » du volet : rend l'identifiant du document créé. */
export async function nouveauDocument(page) {
  const avant = page.url()
  await (await voletDocuments(page)).getByRole('button', { name: 'Nouveau', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Nouveau document' }).click()
  await page.waitForFunction((a) => location.href !== a, avant)
  await page.waitForSelector('.bn-editor')
  return decodeURIComponent(new URL(page.url()).hash.slice(1))
}

/** Ouvre le menu « … » de l'entrée qui mène au document `id`, ou de l'entrée nommée `nom` (dossier, équipe). */
export async function menuDe(page, { id, nom }) {
  const panneau = await voletDocuments(page)
  const ligne = id
    ? panneau.locator(`div:has(> div > a[href="#${id}"])`).first()
    : panneau.locator('div:has(> div > button)', { has: page.getByRole('button', { name: nom, exact: true }) }).last()
  await ligne
    .locator('> div')
    .first()
    .getByRole('button', { name: /^Actions sur/ })
    .click()
}

/** Le mode (« Éditer », « Corriger », « Lire ») : le sélecteur du bandeau (format L). */
const selecteurDeMode = (page) => page.getByRole('radiogroup', { name: 'Mode', exact: true })
export async function choisirMode(page, libelle) {
  const choix = selecteurDeMode(page).getByText(libelle, { exact: true })
  await choix.click()
  await page.waitForFunction(
    (l) =>
      [...document.querySelectorAll('input[type=radio]')].some((i) => i.checked && i.labels?.[0]?.textContent === l),
    libelle,
  )
  await attendre(300)
}
/** Le mode coché du sélecteur, ou `null` sans sélecteur. */
export const modeChoisi = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[aria-label="Mode"] input[type=radio]')].find((i) => i.checked)?.labels?.[0]
        ?.textContent ?? null,
  )

/** Attend que le mode coché soit `libelle`. */
export async function attendreMode(page, libelle, delai = 15000) {
  for (const t0 = Date.now(); Date.now() - t0 < delai; await attendre(100))
    if ((await modeChoisi(page)) === libelle) return
  assert.equal(await modeChoisi(page), libelle)
}

/** Le panneau des suggestions, en une ligne. */
export const panneau = (page) =>
  page.evaluate(() => {
    const section = document.querySelector('section[aria-label]')
    if (!section) return ''
    // Chaque carte cite le passage ; sa phrase complète est son nom accessible.
    const cartes = [...section.querySelectorAll('[data-amend-carte]')].map((b) => b.getAttribute('aria-label'))
    return [section.innerText.replace(/\n+/g, ' / '), ...cartes].join(' / ')
  })
