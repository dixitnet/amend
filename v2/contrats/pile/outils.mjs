// Gestes communs des tests T5 (pile complète dans un navigateur).
// Le moteur se choisit par NAVIGATEUR=chromium|webkit|firefox (chromium par défaut).
import assert from 'node:assert/strict'
import * as playwright from 'playwright'

export const NAVIGATEUR = process.env.NAVIGATEUR || 'chromium'
export const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
export const lancerNavigateur = () => playwright[NAVIGATEUR].launch()
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
