// T5 : robustesse de la pile complète dans un navigateur (scénarios de
// l'étape 1, docs/v2-tests/etape-1-scenarios.md) : coupures de y/hub et du
// réseau, accessibilité, adresses, secrets absents des journaux.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { preparerServices, construireClient, demarrerPile } from '../../exploitation/dev/pile.mjs'
import { lireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'
import {
  attendre,
  lancerNavigateur,
  docTest,
  ouvrir as ouvrirSur,
  attendreEtat,
  attendreTexte,
  donnerRole,
  session,
} from './outils.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
let pile, nav
const ouvrir = (nom, docId, o) => ouvrirSur(nav, pile.url, nom, docId, o)

before(async () => {
  preparerServices()
  construireClient()
  pile = await demarrerPile({ port: 4320, portCollab: 4420, delaiPersistance: 500, capturer: true })
  nav = await lancerNavigateur()
})
after(async () => {
  await nav?.close()
  await pile?.arreter()
})

const lecteurs = new Set()
async function texteCoteServeur(docId) {
  if (!lecteurs.has(docId)) await donnerRole(pile.url, docId, 'Lecteur', 'lecteur')
  lecteurs.add(docId)
  const r = await fetch(`${pile.collab}/collaboration/ydoc/v1/amend/${docId}`, {
    headers: { cookie: await session(pile.url, 'Lecteur'), accept: 'application/json' },
  })
  return texteDesBlocs(lireBlocs(Buffer.from((await r.json()).doc, 'base64')))
}

test('y/hub arrêté puis relancé : l’interface ne dit plus « Synchronisé », puis le redit, et la frappe faite entre-temps arrive', async () => {
  const doc = docTest('coupure')
  const a = await ouvrir('Alice', doc)
  const b = await ouvrir('Bruno', doc)
  await pile.arreterCollab()
  try {
    // Le client passe un instant par « Hors ligne », puis retente sans fin :
    // « Connexion… ». Les deux disent la perte de synchronisation.
    await a.waitForFunction(
      () => ['Hors ligne', 'Connexion…'].includes(document.querySelector('[role=status]')?.textContent),
      null,
      { timeout: 15000 },
    )
    await a.click('.bn-editor')
    await a.keyboard.type('Écrit pendant la coupure.')
  } finally {
    // Relancé même si une vérification échoue : les tests suivants en ont besoin.
    await pile.relancerCollab()
  }
  await attendreEtat(a, 'Synchronisé', 20000)
  await attendreTexte(b, 'Écrit pendant la coupure.', 15000)
  await a.context().close()
  await b.context().close()
})

test('y/hub tué net en pleine frappe : rien n’est perdu après reconnexion', async () => {
  const doc = docTest('kill')
  const a = await ouvrir('Alice', doc)
  await a.click('.bn-editor')
  await a.keyboard.type('Avant. ')
  await attendre(300)
  await pile.arreterCollab('SIGKILL')
  try {
    await a.keyboard.type('Pendant. ')
  } finally {
    await pile.relancerCollab()
  }
  await attendreEtat(a, 'Synchronisé', 20000)
  await a.keyboard.type('Après.')
  const attendu = 'Avant. Pendant. Après.'
  let lu = ''
  for (let t0 = Date.now(); Date.now() - t0 < 15000 && lu !== attendu; await attendre(250))
    lu = await texteCoteServeur(doc)
  assert.equal(lu, attendu, 'le serveur a tout reçu')
  const c = await ouvrir('Chloé', doc)
  await attendreTexte(c, attendu)
  await a.context().close()
  await c.context().close()
})

test('réseau coupé côté navigateur pendant la frappe : tout arrive au retour, sans doublon', async () => {
  const doc = docTest('horsligne')
  const a = await ouvrir('Alice', doc)
  const b = await ouvrir('Bruno', doc)
  await a.context().setOffline(true)
  await a.click('.bn-editor')
  await a.keyboard.type('Tapé hors ligne.')
  await attendre(1000)
  await a.context().setOffline(false)
  await attendreTexte(b, 'Tapé hors ligne.', 20000)
  await attendre(1000)
  await attendreTexte(b, 'Tapé hors ligne.')
  await a.context().close()
  await b.context().close()
})

test('adresse : un nom de document refusé affiche un message, un autre nom ouvre un autre document', async () => {
  const doc = docTest('adresse')
  const a = await ouvrir('Alice', doc)
  await a.click('.bn-editor')
  await a.keyboard.type('Premier document.')
  await attendre(500)
  await a.evaluate(() => (location.hash = '#autre-document'))
  await a.waitForFunction(() => /autre-document/.test(document.querySelector('h1')?.textContent || ''))
  await attendreEtat(a, 'Synchronisé')
  await attendreTexte(a, '')
  const refuse = await a.context().newPage()
  await refuse.goto(`${pile.url}/#e%CC%81te%CC%81`)
  await refuse.waitForFunction(() =>
    /lettres et chiffres sans accent/.test(document.querySelector('[role=status]')?.textContent || ''),
  )
  await a.context().close()
})

/** Point ouvert, décidé par Sylvain le 08/11/2026 (ADR 0008, « Points
 * ouverts ») : le bouton et le badge de Mantine par défaut (blanc sur bleu,
 * 3,56:1) sont sous le contraste minimal ; à traiter avec le travail sur
 * l'interface. Seuls ces deux éléments sont exclus, et seulement du contrôle
 * de contraste ; tout autre défaut fait échouer le test. */
const CONTRASTE_EN_ATTENTE = /mantine-(Button|Badge)-label/

async function violations(page, { avecEnAttente = false } = {}) {
  await page.addScriptTag({ content: AXE })
  const r = await page.evaluate(
    async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations,
  )
  return r
    .filter((v) => ['serious', 'critical'].includes(v.impact))
    .map((v) => ({
      ...v,
      nodes:
        v.id === 'color-contrast' && !avecEnAttente
          ? v.nodes.filter((n) => !CONTRASTE_EN_ATTENTE.test(n.html))
          : v.nodes,
    }))
    .filter((v) => v.nodes.length)
    .map((v) => `${v.id} (${v.nodes.length})`)
}

test('accessibilité (axe-core) : aucun défaut sérieux sur l’écran de connexion et sur la page d’un document', async () => {
  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const p = await ctx.newPage()
  await p.goto(`${pile.url}/#${docTest('axe')}`)
  await p.waitForSelector('input[name=nom]')
  assert.deepEqual(await violations(p), [], 'écran de connexion')
  await p.fill('input[name=nom]', 'Alice')
  await p.click('button[type=submit]')
  await p.waitForSelector('.bn-editor')
  await attendreEtat(p, 'Synchronisé')
  assert.deepEqual(await violations(p), [], 'page d’un document')
  await ctx.close()
})

test('les secrets n’apparaissent jamais dans les journaux', () => {
  const j = pile.journaux()
  assert.ok(!j.includes(pile.secrets.jetonInterne), 'jeton interne')
  assert.ok(!j.includes(pile.secrets.secret), 'secret de session')
})

test('point ouvert : le contraste du bouton Mantine par défaut est toujours en défaut (retirer l’exclusion quand il sera réglé)', async () => {
  const ctx = await nav.newContext({ locale: 'fr-FR' })
  const p = await ctx.newPage()
  await p.goto(`${pile.url}/#${docTest('axe-attente')}`)
  await p.waitForSelector('input[name=nom]')
  assert.deepEqual(
    await violations(p, { avecEnAttente: true }),
    ['color-contrast (1)'],
    'si ce test échoue parce que le défaut a disparu : retirer CONTRASTE_EN_ATTENTE et le point ouvert de l’ADR 0008',
  )
  await ctx.close()
})
