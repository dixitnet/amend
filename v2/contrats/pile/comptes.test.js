// T5 : comptes et partage dans un vrai navigateur (étape 6a) : créer un
// document, inviter une adresse nouvelle, entrer d'un clic par le courrier,
// choisir son nom, arriver avec le bon rôle ; lien de partage ; suppression ;
// dossiers personnels et Partagé avec moi (étape 6c).
// Les courriers sont lus par la route de développement (pas de clé Mailgun).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lancerNavigateur, ouvrir as ouvrirSur, attendre, attendreEtat } from './outils.mjs'

let pile, nav
before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4390, portCollab: 4490 })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

/** Le dernier lien envoyé à une adresse (chemin seulement). */
async function lienPour(adresse) {
  for (const t0 = Date.now(); Date.now() - t0 < 8000; await attendre(200)) {
    const courriers = await (await fetch(`${pile.url}/api/dev/courriers`)).json()
    const m = courriers.reverse().find((c) => c.a === adresse)
    if (m) return new URL(m.texte.match(/https?:\/\/\S+/)[0]).pathname
  }
  throw new Error(`aucun courrier pour ${adresse}`)
}

test('créer un document, inviter une adresse nouvelle : elle entre d’un clic, choisit son nom, arrive en correctrice', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  await p.goto(`${pile.url}/#`)
  await p.getByRole('button', { name: 'Nouveau document' }).click()
  await p.waitForSelector('.bn-editor')
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  assert.match(docId, /^[0-9a-f-]{36}$/, 'identifiant aléatoire')
  await p.getByRole('button', { name: 'Partager' }).click()
  const adresse = `carla-${randomUUID().slice(0, 8)}@exemple.fr`
  await p.getByLabel('Adresse de courriel').fill(adresse)
  await p.getByLabel('Rôle', { exact: true }).first().click()
  await p.getByRole('option', { name: 'correcteur' }).click()
  await p.getByRole('button', { name: 'Inviter' }).click()
  await p.getByText(`Invitation envoyée à ${adresse}.`).waitFor()

  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const c = await ctx.newPage()
  await c.goto(`${pile.url}${await lienPour(adresse)}`)
  await c.getByLabel('Votre nom').fill('Carla')
  await c.getByRole('button', { name: 'Continuer' }).click()
  await c.waitForSelector('.bn-editor')
  await attendreEtat(c, 'Synchronisé')
  assert.equal(await c.getByText('Mode suggestion').count(), 1, 'arrivée en correctrice')
  assert.equal(new URL(c.url()).hash, `#${docId}`)
  // Le lien ne sert qu'une fois.
  await c.goto(`${pile.url}${await lienPour(adresse)}`)
  await c.getByText('Ce lien de connexion n’est plus valable').waitFor()
  await ctx.close()
  await p.context().close()
})

test('lien de partage : une personne connectée qui a l’adresse entre comme lectrice ; lien fermé, plus rien', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  await p.goto(`${pile.url}/#`)
  await p.getByRole('button', { name: 'Nouveau document' }).click()
  await p.waitForSelector('.bn-editor')
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  await p.getByRole('button', { name: 'Partager' }).click()
  await p.getByLabel('Accès par le lien', { exact: true }).first().click()
  await p.getByRole('option', { name: 'lecteur' }).click()
  await p.getByLabel('Adresse à transmettre').waitFor()

  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const l = await ctx.newPage()
  await l.goto(`${pile.url}/#${docId}`)
  await l.fill('input[name=nom]', 'Léa')
  await l.click('button[type=submit]')
  await l.waitForSelector('.bn-editor')
  assert.equal(await l.getByText('Lecture seule').count(), 1)
  await p.getByLabel('Accès par le lien', { exact: true }).first().click()
  await p.getByRole('option', { name: 'Personne (lien fermé)' }).click()
  await attendre(500)
  await l.reload()
  await l.getByText('Ce document n’existe pas').waitFor()
  await ctx.close()
  await p.context().close()
})

test('suppression : le propriétaire supprime ; le document disparaît de la liste', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  await p.goto(`${pile.url}/#`)
  await p.getByRole('button', { name: 'Nouveau document' }).click()
  await p.waitForSelector('.bn-editor')
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  p.once('dialog', (d) => d.accept())
  await p.getByRole('button', { name: 'Supprimer' }).click()
  await p.getByRole('heading', { name: 'Tous les documents' }).waitFor()
  assert.equal(await p.locator(`a[href="#${docId}"]`).count(), 0)
  await p.context().close()
})

test('dossiers : créer, y créer un document, le déplacer à la racine, supprimer le dossier vide', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  await p.goto(`${pile.url}/#`)
  const nom = `Livres ${randomUUID().slice(0, 4)}`
  p.once('dialog', (d) => d.accept(nom))
  await p.getByRole('button', { name: 'Nouveau dossier' }).click()
  await p.getByRole('link', { name: nom }).click()
  await p.getByText('Ce dossier est vide.').waitFor()
  assert.match(new URL(p.url()).hash, /^#\/dossiers\//)
  const adresseDossier = p.url()
  await p.getByRole('button', { name: 'Nouveau document' }).click()
  await p.waitForSelector('.bn-editor')
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  await p.goto(adresseDossier)
  await p.locator(`a[href="#${docId}"]`).waitFor()
  // À la racine, il n'y est pas ; on l'y déplace.
  await p.getByRole('navigation', { name: 'Emplacement' }).getByRole('link', { name: 'Mes documents' }).click()
  await p
    .getByRole('row')
    .filter({ has: p.getByRole('link', { name: nom }) })
    .waitFor()
  assert.equal(await p.locator(`a[href="#${docId}"]`).count(), 0)
  await p.goto(adresseDossier)
  await p.getByLabel('Déplacer Sans titre').first().click()
  await p.getByRole('option', { name: 'Mes documents', exact: true }).click()
  await p.getByText('Ce dossier est vide.').waitFor()
  await p.goto(`${pile.url}/#`)
  await p.locator(`a[href="#${docId}"]`).waitFor()
  const ligne = p.getByRole('row').filter({ has: p.getByRole('link', { name: nom }) })
  p.once('dialog', (d) => d.accept())
  await ligne.getByRole('button', { name: 'Supprimer' }).click()
  for (const t0 = Date.now(); Date.now() - t0 < 5000; await attendre(100))
    if (!(await p.getByRole('link', { name: nom }).count())) break
  assert.equal(await p.getByRole('link', { name: nom }).count(), 0)
  await p.context().close()
})

test('partagé avec moi : le document, qui l’a partagé ; je m’en retire', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  await p.goto(`${pile.url}/#`)
  await p.getByRole('button', { name: 'Nouveau document' }).click()
  await p.waitForSelector('.bn-editor')
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  const b = await ouvrirSur(nav, pile.url, 'Bruno', `t5-attente-${Date.now().toString(36)}`)
  const bruno = await b.evaluate(() => fetch('/api/moi').then((r) => r.json()))
  const r = await p.evaluate(
    ([document, personne]) =>
      fetch('/api/dev/acces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document, personne, role: 'lecteur' }),
      }).then((x) => x.status),
    [docId, bruno.id],
  )
  assert.equal(r, 200)
  await b.goto(`${pile.url}/#/partages`)
  const ligne = b.getByRole('row').filter({ has: b.locator(`a[href="#${docId}"]`) })
  await ligne.waitFor()
  assert.match(await ligne.innerText(), /lecteur/)
  b.once('dialog', (d) => d.accept())
  await ligne.getByRole('button', { name: 'Me retirer' }).click()
  for (const t0 = Date.now(); Date.now() - t0 < 5000; await attendre(100))
    if (!(await b.locator(`a[href="#${docId}"]`).count())) break
  assert.equal(await b.locator(`a[href="#${docId}"]`).count(), 0)
  await b.context().close()
  await p.context().close()
})
