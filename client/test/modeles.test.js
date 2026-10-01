// La page « Gérer mes modèles » (01/10/2026, src/modeles.js), montée dans
// jsdom avec un faux serveur : les trois familles, ce que chacun peut faire
// (livré : dupliquer seulement ; modèle de l'instance : administrateurs ;
// les siens : tout), la duplication, le refus de supprimer un modèle
// utilisé, la suppression en deux clics, et l'avertissement avant de
// modifier un modèle partagé.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountModeles } from '../src/modeles.js'
import { fusionner } from '../../shared/style.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="racine"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Event']) globalThis[k] = w[k]
}
const laisser = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r))
}

const modele = (id, nom, portee, extra = {}) => ({
  id, nom, portee, description: null, defaut: false, style: fusionner({}), modifiable: false, supprimable: false, utilisePar: 0, ...extra,
})

function base(admin) {
  return [
    modele('defaut', 'Par défaut', 'instance', { defaut: true, modifiable: admin, utilisePar: 5 }),
    modele('livre', 'Livre', 'livre', { description: 'Un livre', style: fusionner({ page: { size: 'A5' } }) }),
    modele('maison', 'Maison', 'instance', { modifiable: admin, supprimable: admin }),
    modele('m-00000001', 'Mon essai', 'perso', { modifiable: true, supprimable: true }),
    modele('m-00000002', 'Utilisé', 'perso', { modifiable: true, supprimable: true, utilisePar: 2 }),
  ]
}

function fauxServeur({ admin = false, refus = null } = {}) {
  const etat = { modeles: base(admin), appels: [] }
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    const corps = options.body ? JSON.parse(options.body) : null
    etat.appels.push({ url, methode, corps })
    const rep = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (url === '/api/modeles' && methode === 'GET') return rep(200, { modeles: etat.modeles, admin })
    if (refus && methode !== 'GET') return rep(refus, { error: 'refus du serveur' })
    if (url === '/api/modeles' && methode === 'POST') {
      const m = modele('m-99999999', corps.nom, corps.portee === 'instance' ? 'instance' : 'perso', { modifiable: true, supprimable: true })
      etat.modeles.push(m)
      return rep(200, m)
    }
    const id = url.replace('/api/modeles/', '')
    if (methode === 'DELETE') {
      etat.modeles = etat.modeles.filter((m) => m.id !== id)
      return rep(200, { ok: true })
    }
    if (methode === 'PUT') {
      const m = etat.modeles.find((x) => x.id === id)
      if (corps.nom) m.nom = corps.nom
      return rep(200, m)
    }
    return rep(404, {})
  }
  return etat
}

async function monter(options) {
  installer()
  const etat = fauxServeur(options)
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  return { etat, racine }
}
const carte = (racine, id) => racine.querySelector(`[data-modele="${id}"]`)
const boutons = (c) => [...c.querySelectorAll('button')].map((b) => b.textContent)
const clic = (c, texte) => [...c.querySelectorAll('button')].find((b) => b.textContent === texte).click()
const appels = (etat, methode) => etat.appels.filter((a) => a.methode === methode)

test('trois familles, le format de chaque modèle et son usage', async () => {
  const { racine } = await monter()
  assert.deepEqual([...racine.querySelectorAll('h2')].map((h) => h.textContent), ['Livrés avec amend.ink', 'De l’instance', 'Mes modèles'])
  assert.ok(carte(racine, 'livre').textContent.includes('A5'))
  assert.ok(carte(racine, 'defaut').textContent.includes('Utilisé par 5 documents'))
  assert.ok(carte(racine, 'maison').textContent.includes('Aucun document ne l’utilise'))
})

test('un modèle livré : dupliquer seulement', async () => {
  const { racine } = await monter()
  assert.deepEqual(boutons(carte(racine, 'livre')), ['Dupliquer'])
})

test('un utilisateur ordinaire : rien à faire sur ceux de l’instance, sauf les dupliquer', async () => {
  const { racine } = await monter({ admin: false })
  assert.deepEqual(boutons(carte(racine, 'maison')), ['Dupliquer'])
  assert.deepEqual(boutons(carte(racine, 'defaut')), ['Dupliquer'])
})

test('un administrateur : modifie « Par défaut » sans pouvoir le renommer ni le supprimer, gère ceux de l’instance', async () => {
  const { racine } = await monter({ admin: true })
  assert.deepEqual(boutons(carte(racine, 'defaut')), ['Dupliquer', 'Modifier'])
  assert.deepEqual(boutons(carte(racine, 'maison')), ['Dupliquer', 'Modifier', 'Renommer', 'Supprimer'])
})

test('ses propres modèles : tout, mais pas supprimer s’il est utilisé — et le bouton dit pourquoi', async () => {
  const { racine } = await monter()
  assert.deepEqual(boutons(carte(racine, 'm-00000001')), ['Dupliquer', 'Modifier', 'Renommer', 'Supprimer'])
  const utilise = [...carte(racine, 'm-00000002').querySelectorAll('button')].find((b) => b.textContent === 'Supprimer')
  assert.equal(utilise.disabled, true)
  assert.ok(utilise.title.includes('2 documents'))
})

test('dupliquer : le nom proposé, puis création à partir du modèle choisi', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'livre')
  clic(c, 'Dupliquer')
  const champ = c.querySelector('input[type=text]')
  assert.equal(champ.value, 'Livre (copie)')
  champ.value = 'Mon livre'
  clic(c, 'Créer')
  await laisser()
  assert.deepEqual(appels(etat, 'POST').map((a) => a.corps), [{ nom: 'Mon livre', depuis: 'livre', portee: 'perso' }])
  assert.ok(racine.textContent.includes('« Mon livre » créé'))
  assert.ok(racine.querySelector('[data-modele="m-99999999"]'))
})

test('un administrateur choisit la portée d’un nouveau modèle ; un autre ne la voit pas', async () => {
  const a = await monter({ admin: true })
  const c = carte(a.racine, 'livre')
  clic(c, 'Dupliquer')
  c.querySelector('select').value = 'instance'
  clic(c, 'Créer')
  await laisser()
  assert.equal(appels(a.etat, 'POST')[0].corps.portee, 'instance')

  const b = await monter({ admin: false })
  clic(carte(b.racine, 'livre'), 'Dupliquer')
  assert.equal(carte(b.racine, 'livre').querySelector('select'), null)
})

test('un nom refusé par le serveur se lit, sans rien perdre', async () => {
  const { racine } = await monter({ refus: 400 })
  const c = carte(racine, 'livre')
  clic(c, 'Dupliquer')
  clic(c, 'Créer')
  await laisser()
  assert.ok(c.textContent.includes('refus du serveur'))
  assert.equal(carte(racine, 'livre').querySelector('input[type=text]') !== null, true)
})

test('renommer : le formulaire ouvert sous la carte envoie le nouveau nom, et la liste se recharge', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'm-00000001')
  clic(c, 'Renommer') // ouvre le formulaire
  const champ = c.querySelector('.modele-formulaire input[type=text]')
  assert.equal(champ.value, 'Mon essai')
  champ.value = 'Nouveau nom'
  c.querySelector('.modele-formulaire').querySelector('button').click() // son bouton « Renommer »
  await laisser()
  assert.deepEqual(appels(etat, 'PUT').map((a) => [a.url, a.corps]), [['/api/modeles/m-00000001', { nom: 'Nouveau nom' }]])
  assert.ok(racine.textContent.includes('Renommé en « Nouveau nom »'))
  assert.ok(carte(racine, 'm-00000001').textContent.includes('Nouveau nom'))
})

test('supprimer : deux clics, le premier ne part pas', async () => {
  const { etat, racine } = await monter()
  const c = carte(racine, 'm-00000001')
  clic(c, 'Supprimer')
  await laisser()
  assert.equal(appels(etat, 'DELETE').length, 0)
  clic(c, 'Confirmer la suppression')
  await laisser()
  assert.deepEqual(appels(etat, 'DELETE').map((a) => a.url), ['/api/modeles/m-00000001'])
  assert.equal(racine.querySelector('[data-modele="m-00000001"]'), null)
  assert.ok(racine.textContent.includes('supprimé'))
})

test('modifier : l’avertissement dit combien de documents suivront', async () => {
  const { racine } = await monter()
  clic(carte(racine, 'm-00000002'), 'Modifier')
  assert.ok(racine.textContent.includes('utilisé par 2 documents'))
  assert.ok(racine.querySelector('.style-form'), 'le formulaire complet')
})

test('modifier puis enregistrer envoie la feuille complète, et revient à la liste', async () => {
  const { etat, racine } = await monter()
  clic(carte(racine, 'm-00000001'), 'Modifier')
  assert.ok(racine.textContent.includes('Aucun document ne l’utilise'))
  const enregistrer = [...racine.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer')
  enregistrer.click()
  await laisser()
  const put = appels(etat, 'PUT')[0]
  assert.equal(put.url, '/api/modeles/m-00000001')
  assert.ok(put.corps.style.page && put.corps.style.blocs.body)
  assert.ok(racine.querySelector('.modele-carte'), 'retour à la liste')
})

test('non connecté : un message, pas une page vide', async () => {
  installer()
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) })
  const racine = document.getElementById('racine')
  await mountModeles(racine)
  assert.ok(racine.textContent.includes('Connexion requise'))
})

test('fin : nettoyage', () => {
  setTimeout(() => process.exit(0), 100)
})
