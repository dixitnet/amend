// La corbeille (12/10/2026, server/corbeille.js, claude/conception-dossiers-corbeille.md §6).
// Ce qui est vérifié : un document à la corbeille n'est plus lisible par
// personne mais n'est pas effacé ; il se restaure tel quel ; il ne se
// supprime pour de bon que depuis la corbeille, et seul son propriétaire y
// touche ; il ne compte pas dans le quota de documents ; ses voisins (salle,
// agents, page publiée) sont coupés.

import test from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancerInstance } from '../../tools/instance-test.js'
import { Storage } from '../storage.js'
import { mettreALaCorbeille, supprimerDefinitivement } from '../corbeille.js'

const PROPRIO = 'proprio@test.local'
const EDITEUR = 'editeur@test.local'
const TIERS = 'tiers@test.local'

// --- Le registre, sans serveur ----------------------------------------------

test('storage : à la corbeille, plus de rôle pour personne, plus dans les listes, hors quota', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-corbeille-'))
  process.on('exit', () => rmSync(dossier, { recursive: true, force: true }))
  const s = new Storage(dossier)
  const d = s.createDoc('Thèse', PROPRIO)
  s.grantAccess(d.id, EDITEUR, 'editeur')
  assert.equal(s.roleFor(d.id, EDITEUR), 'editeur')
  assert.equal(s.listDocs(PROPRIO).length, 1)
  assert.equal(s.documentsDe(PROPRIO).length, 1)

  s.mettreALaCorbeille(d.id, PROPRIO)
  assert.equal(s.roleFor(d.id, PROPRIO), null)
  assert.equal(s.roleFor(d.id, EDITEUR), null)
  assert.deepEqual(s.listDocs(PROPRIO), [])
  assert.deepEqual(s.listDocs(EDITEUR), [])
  assert.equal(s.documentsDe(PROPRIO).length, 0, 'hors quota de documents')
  assert.equal(s.documentsDe(PROPRIO, { avecCorbeille: true }).length, 1, 'mais compté pour le disque')
  assert.ok(s.getDoc(d.id), 'la fiche est toujours là')
  assert.equal(s.estALaCorbeille(d.id), true)
  assert.deepEqual(s.listCorbeille(PROPRIO).map((x) => x.id), [d.id])
  assert.deepEqual(s.listCorbeille(EDITEUR), [], 'la corbeille est celle du propriétaire')

  s.restaurerDeLaCorbeille(d.id)
  assert.equal(s.roleFor(d.id, EDITEUR), 'editeur')
  assert.equal(s.listDocs(PROPRIO).length, 1)
  assert.equal(s.restaurerDeLaCorbeille(d.id), null, 'on ne restaure pas ce qui n’y est pas')
})

test('storage : une invitation en attente ne s’ouvre pas sur un document à la corbeille', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-corbeille-'))
  process.on('exit', () => rmSync(dossier, { recursive: true, force: true }))
  const s = new Storage(dossier)
  const d = s.createDoc('Doc', PROPRIO)
  const { token } = s.inviteEmail(d.id, TIERS, 'lecteur', PROPRIO)
  assert.ok(s.findInvitation(token))
  s.mettreALaCorbeille(d.id, PROPRIO)
  assert.equal(s.findInvitation(token), null)
  s.restaurerDeLaCorbeille(d.id)
  assert.ok(s.findInvitation(token), 'elle reprend à la restauration')
})

test('storage : enCorbeilleDepuis dit ce qui y est depuis longtemps (pour une purge future)', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-corbeille-'))
  process.on('exit', () => rmSync(dossier, { recursive: true, force: true }))
  const s = new Storage(dossier)
  const a = s.createDoc('Ancien', PROPRIO)
  const b = s.createDoc('Récent', PROPRIO)
  s.createDoc('Gardé', PROPRIO)
  s.mettreALaCorbeille(a.id, PROPRIO)
  s.mettreALaCorbeille(b.id, PROPRIO)
  const trente = 30 * 24 * 3600 * 1000
  assert.deepEqual(s.enCorbeilleDepuis(trente), [])
  assert.deepEqual(s.enCorbeilleDepuis(trente, Date.now() + trente + 1000).sort(), [a.id, b.id].sort())
})

// --- Les effets sur les voisins du document ------------------------------------

test('mettre à la corbeille coupe la salle, révoque les agents, retire la page publiée', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'amend-corbeille-'))
  process.on('exit', () => rmSync(dossier, { recursive: true, force: true }))
  const storage = new Storage(dossier)
  const d = storage.createDoc('Doc', PROPRIO)
  const appels = []
  const ctx = {
    storage,
    rooms: { expulser: (id, email, raison) => appels.push(['expulser', id, email, raison]) },
    agents: { lister: () => [{ id: 'ag-1' }], revoquerDocument: (id) => appels.push(['revoquer', id]) },
    presenceAgents: { retirer: (id) => appels.push(['presence', id]) },
    publications: { depublier: (id) => (appels.push(['depublier', id]), true) },
    metrics: { log: (flux, ev) => appels.push(['log', flux, ev.geste || ev.retiree]) },
    uploads: { supprimerDocument: (id) => appels.push(['images', id]) },
    versions: { supprimerDocument: (id) => appels.push(['versions', id]) },
  }
  mettreALaCorbeille(ctx, d.id, PROPRIO)
  const noms = appels.map((a) => a[0])
  for (const attendu of ['expulser', 'presence', 'revoquer', 'depublier']) assert.ok(noms.includes(attendu), attendu)
  assert.ok(!noms.includes('images') && !noms.includes('versions'), 'les images et les versions restent')
  assert.equal(storage.estALaCorbeille(d.id), true)

  appels.length = 0
  assert.equal(supprimerDefinitivement(ctx, d.id, PROPRIO), true)
  const apres = appels.map((a) => a[0])
  assert.ok(apres.includes('images') && apres.includes('versions'), 'la suppression définitive emporte tout')
  assert.equal(storage.getDoc(d.id), null)
})

// --- Les routes, sur un vrai serveur ---------------------------------------------

let inst
let doc

const api = (chemin, qui, opts = {}) => inst.api(chemin, { cookie: inst.cookies[qui], ...opts })

async function nouveauDocument(titre) {
  const c = await api('/api/docs', PROPRIO, { methode: 'POST', corps: { title: titre } })
  assert.equal(c.status, 201)
  const inv = await api(`/api/docs/${c.json.id}/invitations`, PROPRIO, { methode: 'POST', corps: { email: EDITEUR, role: 'editeur' } })
  assert.equal(inv.status, 200)
  const courriers = await (await fetch(`${inst.fauxMailgun}/courriers`)).json()
  const jeton = /#\/invite\/([A-Za-z0-9_-]+)/.exec([...courriers].reverse().find((x) => x.to === EDITEUR && x.text.includes('#/invite/')).text)[1]
  assert.equal((await inst.api(`/api/invitations/${jeton}`, { methode: 'POST', cookie: inst.cookies[EDITEUR] })).status, 200)
  return c.json.id
}

test('démarrage', async () => {
  inst = await lancerInstance({ port: 19930, comptes: [PROPRIO, EDITEUR, TIERS], admin: TIERS, env: { DOCUMENTS_MAX_PAR_COMPTE: '2' } })
  doc = await nouveauDocument('Mémoire')
})

test('« supprimer » met à la corbeille : le document disparaît pour tous, sans rien effacer', async () => {
  assert.equal((await api(`/api/docs/${doc}`, EDITEUR, { methode: 'DELETE' })).status, 403, 'un éditeur ne jette pas')
  const r = await api(`/api/docs/${doc}`, PROPRIO, { methode: 'DELETE' })
  assert.equal(r.status, 200)
  assert.equal(r.json.corbeille, true)
  for (const qui of [PROPRIO, EDITEUR]) {
    assert.deepEqual((await api('/api/docs', qui)).json.docs, [], `la liste de ${qui} est vide`)
    assert.equal((await api(`/api/docs/${doc}`, qui)).status, 403)
  }
  // Toute porte qui s'ouvre sur un document passe par roleFor.
  for (const chemin of ['/versions', '/history', '/history/raw', '/style', '/access', '/publication', '/agents']) {
    const res = await api(`/api/docs/${doc}${chemin}`, PROPRIO)
    assert.ok([403, 404].includes(res.status), `${chemin} : ${res.status}`)
  }
  assert.equal((await api(`/api/docs/${doc}/star`, PROPRIO, { methode: 'PATCH', corps: { starred: true } })).status, 403)
  assert.equal((await api(`/api/docs/${doc}`, PROPRIO, { methode: 'DELETE' })).status, 404, 'on ne jette pas deux fois')
})

test('la corbeille est celle du propriétaire', async () => {
  const liste = (await api('/api/corbeille', PROPRIO)).json.documents
  assert.deepEqual(liste.map((d) => [d.id, d.title]), [[doc, 'Mémoire']])
  assert.equal(typeof liste[0].corbeille.le, 'number')
  assert.deepEqual((await api('/api/corbeille', EDITEUR)).json.documents, [])
  assert.equal((await api('/api/corbeille', undefined)).status, 401)
  assert.equal((await api(`/api/corbeille/${doc}/restauration`, EDITEUR, { methode: 'POST' })).status, 404)
  assert.equal((await api(`/api/corbeille/${doc}`, EDITEUR, { methode: 'DELETE' })).status, 404)
  assert.equal((await api(`/api/corbeille/${doc}`, TIERS, { methode: 'DELETE' })).status, 404)
})

test('restaurer rend le document tel quel, à tous ses membres', async () => {
  const r = await api(`/api/corbeille/${doc}/restauration`, PROPRIO, { methode: 'POST' })
  assert.equal(r.status, 200)
  assert.equal(r.json.title, 'Mémoire')
  assert.equal((await api(`/api/docs/${doc}`, EDITEUR)).status, 200)
  assert.deepEqual((await api('/api/corbeille', PROPRIO)).json.documents, [])
  assert.equal((await api(`/api/corbeille/${doc}/restauration`, PROPRIO, { methode: 'POST' })).status, 404, 'plus dans la corbeille')
})

test('on ne supprime pour de bon que depuis la corbeille', async () => {
  assert.equal((await api(`/api/corbeille/${doc}`, PROPRIO, { methode: 'DELETE' })).status, 404, 'un document vivant ne se supprime pas par là')
  await api(`/api/docs/${doc}`, PROPRIO, { methode: 'DELETE' })
  const r = await api(`/api/corbeille/${doc}`, PROPRIO, { methode: 'DELETE' })
  assert.equal(r.status, 200)
  assert.deepEqual((await api('/api/corbeille', PROPRIO)).json.documents, [])
  assert.equal((await api(`/api/corbeille/${doc}/restauration`, PROPRIO, { methode: 'POST' })).status, 404, 'plus rien à restaurer')
})

test('la corbeille ne compte pas dans le quota, la restauration s’y soumet', async () => {
  // Plafond de 2 documents dans cette instance.
  const a = await nouveauDocument('A')
  const b = await nouveauDocument('B')
  assert.equal((await api('/api/docs', PROPRIO, { methode: 'POST', corps: { title: 'C' } })).status, 403, 'plafond atteint')
  await api(`/api/docs/${a}`, PROPRIO, { methode: 'DELETE' })
  const c = await api('/api/docs', PROPRIO, { methode: 'POST', corps: { title: 'C' } })
  assert.equal(c.status, 201, 'jeter libère de la place')
  assert.equal((await api(`/api/corbeille/${a}/restauration`, PROPRIO, { methode: 'POST' })).status, 403, 'restaurer redonne le plafond')
  await api(`/api/docs/${b}`, PROPRIO, { methode: 'DELETE' })
  assert.equal((await api(`/api/corbeille/${a}/restauration`, PROPRIO, { methode: 'POST' })).status, 200)
})

test('vider la corbeille supprime tout ce qu’elle contient, et rien d’autre', async () => {
  const vivants = (await api('/api/docs', PROPRIO)).json.docs.map((d) => d.id)
  const avant = (await api('/api/corbeille', PROPRIO)).json.documents.length
  assert.ok(avant >= 1)
  const r = await api('/api/corbeille', PROPRIO, { methode: 'DELETE' })
  assert.equal(r.json.supprimes, avant)
  assert.deepEqual((await api('/api/corbeille', PROPRIO)).json.documents, [])
  assert.deepEqual((await api('/api/docs', PROPRIO)).json.docs.map((d) => d.id), vivants)
})

test('mettre à la corbeille ferme les connexions ouvertes', async () => {
  for (const d of (await api('/api/docs', PROPRIO)).json.docs) await api(`/api/docs/${d.id}`, PROPRIO, { methode: 'DELETE' }) // sous le plafond
  const id = await nouveauDocument('Salle')
  const ws = new WebSocket(`${inst.base.replace(/^http/, 'ws')}/ws/${id}?user=essai`, { headers: { cookie: inst.cookies[EDITEUR] } })
  const ferme = new Promise((resolve) => ws.on('close', () => resolve(true)))
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  await new Promise((r) => setTimeout(r, 150))
  await api(`/api/docs/${id}`, PROPRIO, { methode: 'DELETE' })
  assert.equal(await Promise.race([ferme, new Promise((r) => setTimeout(() => r(false), 2000))]), true)
})

test.after(async () => {
  if (inst) await inst.arreter()
})
