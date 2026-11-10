// T5 : comptes et partage dans un vrai navigateur (étape 6a) : créer un
// document, inviter une adresse nouvelle, entrer d'un clic par le courrier,
// choisir son nom, arriver avec le bon rôle ; lien de partage ; suppression ;
// dossiers personnels et Partagé avec moi (étape 6c).
// Les courriers sont lus par la route de développement (pas de clé Mailgun).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import {
  lancerNavigateur,
  ouvrir as ouvrirSur,
  attendre,
  attendreEtat,
  confirmer,
  voletDocuments,
  nouveauDocument,
  menuDe,
} from './outils.mjs'

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
  const docId = await nouveauDocument(p)
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
  await attendreEtat(c, 'connecte')
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
  const docId = await nouveauDocument(p)
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

test('suppression : le propriétaire supprime ; le document disparaît du volet', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  const docId = await nouveauDocument(p)
  // « Annuler » : rien ne se passe (10/11/2026).
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Supprimer' }).click()
  await p.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click()
  await p.getByRole('dialog').waitFor({ state: 'detached' })
  await p.waitForSelector('.bn-editor')
  await p.getByRole('button', { name: 'Autres actions' }).click()
  await p.getByRole('menuitem', { name: 'Supprimer' }).click()
  await confirmer(p)
  // Plus de page « Mes documents » : l'accueil ouvre un autre document.
  await p.waitForFunction((d) => location.hash && decodeURIComponent(location.hash.slice(1)) !== d, docId)
  await p.waitForSelector('.bn-editor')
  const volet = await voletDocuments(p)
  await volet.getByRole('button', { name: 'Mes documents' }).waitFor()
  assert.equal(await volet.locator(`a[href="#${docId}"]`).count(), 0)
  await p.context().close()
})

test('dossiers (volet) : créer, y créer un document, le déplacer à la racine, supprimer le dossier vide', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  const nom = `Livres ${randomUUID().slice(0, 4)}`
  await (await voletDocuments(p)).getByRole('button', { name: 'Nouveau dossier' }).click()
  await p.getByRole('textbox', { name: 'Nom du dossier' }).fill(nom)
  await p.getByRole('button', { name: 'Valider' }).click()
  await (await voletDocuments(p)).getByRole('button', { name: nom, exact: true }).waitFor()
  // Un document dans le dossier, par son menu.
  await menuDe(p, { nom })
  const avant = p.url()
  await p.getByRole('menuitem', { name: 'Nouveau document' }).click()
  await p.waitForFunction((a) => location.href !== a, avant)
  await p.waitForSelector('.bn-editor')
  const docId = decodeURIComponent(new URL(p.url()).hash.slice(1))
  const dossier = (await voletDocuments(p))
    .locator('li', { has: p.getByRole('button', { name: nom, exact: true }) })
    .last()
  await dossier.locator(`a[href="#${docId}"]`).waitFor()
  // Déplacé à la racine de Mes documents.
  await menuDe(p, { id: docId })
  await p.getByRole('menuitem', { name: 'Déplacer…' }).click()
  await p.getByRole('dialog').getByLabel('Destination').click()
  await p.getByRole('option', { name: 'Mes documents', exact: true }).click()
  await p.getByRole('dialog').getByRole('button', { name: 'Valider' }).click()
  for (const t0 = Date.now(); Date.now() - t0 < 5000; await attendre(100))
    if (!(await dossier.locator(`a[href="#${docId}"]`).count())) break
  assert.equal(await dossier.locator(`a[href="#${docId}"]`).count(), 0, 'plus dans le dossier')
  await (await voletDocuments(p)).locator(`a[href="#${docId}"]`).first().waitFor()
  // Le dossier vide se supprime.
  await menuDe(p, { nom })
  await p.getByRole('menuitem', { name: 'Supprimer' }).click()
  await confirmer(p)
  await (await voletDocuments(p)).getByRole('button', { name: nom, exact: true }).waitFor({ state: 'detached' })
  await p.context().close()
})

test('partagé avec moi (volet) : le document apparaît ; je m’en retire', async () => {
  const p = await ouvrirSur(nav, pile.url, 'Paule', `t5-attente-${Date.now().toString(36)}`)
  const docId = await nouveauDocument(p)
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
  await b.reload()
  await b.waitForSelector('.bn-editor')
  const volet = await voletDocuments(b)
  await volet.getByRole('button', { name: 'Partagé avec moi' }).click()
  await volet.locator(`a[href="#${docId}"]`).waitFor()
  await menuDe(b, { id: docId })
  await b.getByRole('menuitem', { name: 'Me retirer' }).click()
  await confirmer(b)
  await volet.locator(`a[href="#${docId}"]`).waitFor({ state: 'detached' })
  await b.context().close()
  await p.context().close()
})

test('équipe (volet) : la créer, y faire entrer un document, inviter une correctrice, qui arrive sur ce document', async () => {
  const g = await ouvrirSur(nav, pile.url, 'Gaëlle', `t5-attente-${Date.now().toString(36)}`)
  const nom = `Éditions ${randomUUID().slice(0, 4)}`
  await (await voletDocuments(g)).getByRole('button', { name: 'Nouvelle équipe' }).click()
  await g.getByRole('textbox', { name: 'Nom de l’équipe' }).fill(nom)
  await g.getByRole('button', { name: 'Valider' }).click()
  await (await voletDocuments(g)).getByRole('button', { name: nom, exact: true }).waitFor()
  // Un document de Mes documents entre dans l'équipe.
  const docId = await nouveauDocument(g)
  await menuDe(g, { id: docId })
  await g.getByRole('menuitem', { name: 'Déplacer…' }).click()
  await g.getByRole('dialog').getByLabel('Destination').click()
  await g.getByRole('option', { name: new RegExp(`Équipe\\s+«\\s*${nom}\\s*»`) }).click()
  await g.getByRole('dialog').getByRole('button', { name: 'Valider' }).click()
  await confirmer(g)
  const boutonEquipe = (await voletDocuments(g)).getByRole('button', { name: nom, exact: true })
  if ((await boutonEquipe.getAttribute('aria-expanded')) !== 'true') await boutonEquipe.click()
  const equipe = (await voletDocuments(g))
    .locator('li', { has: g.getByRole('button', { name: nom, exact: true }) })
    .last()
  await equipe.locator(`a[href="#${docId}"]`).waitFor()
  // Inviter une adresse nouvelle comme correctrice, depuis la fenêtre des membres.
  await menuDe(g, { nom })
  await g.getByRole('menuitem', { name: 'Membres' }).click()
  const adresse = `carla-${randomUUID().slice(0, 8)}@exemple.fr`
  await g.getByLabel('Adresse de courriel').fill(adresse)
  await g.getByLabel('Rôle', { exact: true }).first().click()
  await g.getByRole('option', { name: 'correcteur' }).click()
  await g.getByRole('button', { name: 'Inviter' }).click()
  await g.getByText(`Invitation envoyée à ${adresse}.`).waitFor()

  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const c = await ctx.newPage()
  await c.goto(`${pile.url}${await lienPour(adresse)}`)
  await c.getByLabel('Votre nom').fill('Carla')
  await c.getByRole('button', { name: 'Continuer' }).click()
  // Son seul document : celui de l'équipe, qui s'ouvre, en correctrice.
  await c.waitForFunction((d) => decodeURIComponent(location.hash.slice(1)) === d, docId)
  await c.getByText('Mode suggestion').waitFor()
  await menuDe(c, { nom })
  assert.equal(
    await c.getByRole('menuitem', { name: 'Nouveau dossier' }).count(),
    0,
    'une correctrice ne crée rien ici',
  )
  await ctx.close()
  await g.context().close()
})
