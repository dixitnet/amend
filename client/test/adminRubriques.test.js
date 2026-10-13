// Les rubriques du back-office (14/10/2026, src/adminCommun.js, src/admin.js) :
// chacune a son adresse, la synthèse rassemble les indicateurs clés, les
// pastilles disent ce qui attend, et « Traiter » redessine la rubrique où l'on
// est — pas la synthèse. Montées dans jsdom avec un faux serveur.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountAdmin } from '../src/admin.js'
import { ONGLETS, ongletDeLAdresse, pastilles, barreOnglets } from '../src/adminCommun.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="racine"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Event']) globalThis[k] = w[k]
  return document.getElementById('racine')
}

const periode = (n) => ({ appels: n, entree: n * 10, sortie: n, cacheLu: 0, cacheEcrit: 0 })
const retour = (cle, traite = false) => ({ cle, ts: 1000, email: `${cle}@example.com`, intention: 'avis', message: `Message ${cle}`, traite })

function apercu({ retours = [retour('r1'), retour('r2')], echecs = 0 } = {}) {
  return {
    genereLe: Date.UTC(2026, 9, 14, 12),
    utilisateurs: { total: 12, actifs: 9, enAttente: 3, liste: [{ email: 'alice@example.com', nom: 'Alice', documents: 2, editeur: 2, statut: 'actif', depuis: 1000 }], invitationsEnAttente: [], invitationsPar: {} },
    documents: {
      total: 40, crees30j: 5, partCollaborative: 25, aPlusieursParticipants: 10, actifs7j: 8, corbeille: null,
      journaux: { octetsTotal: 1000, plusGrosOctets: 500, aCompacter: 0, sansHorodatage: 0 },
      sansControleDacces: 0, liste: [{ id: 'd1', titre: 'Mon texte', proprietaire: 'alice@example.com', participants: 1, enLigne: '', operations: 3, octets: 100, modifieLe: 2000 }],
    },
    flux: {
      connexions: { actifs7j: 6, actifs30j: 9, collaboration30j: { moments: 4, documents: 2 } },
      support: { aTraiter: retours, traites: [], recus7j: 2, recus30j: 7 },
      tokens: { barreLaterale: { '24h': periode(1), '7j': periode(5), '30j': periode(21) }, fenetre: { '24h': periode(1), '7j': periode(2), '30j': periode(13), parModele: [], parPersonne: [] } },
      ia: { coutEuros30j: 1.5, coutEuros7j: 0.5, coutEuros24h: 0.1, appels30j: 21, appels7j: 5, tokensEntree30j: 60, tokensSortie30j: 6, parPersonne: [], tarif: null },
      mail: { envois30j: 30, echecs30j: echecs, parType: {}, dernierEchec: null },
    },
    serveur: {
      rssMo: 321, uptimeSec: 90000, pid: 7, connexionsEnCours: [], repliques: [], dataDirOctets: 2048, sauvegardeDistante: null, sauvegardeProton: null,
      listeAttente: { total: 4, dernier: null },
    },
  }
}

function fauxServeur(options = {}) {
  const etat = { appels: [], retours: options.retours }
  globalThis.fetch = async (url, init = {}) => {
    etat.appels.push({ url: String(url), methode: init.method || 'GET' })
    const rep = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (url === '/api/admin/overview') return rep(200, apercu(options))
    if (url === '/api/admin/waitlist') {
      const file = [{ email: 'attend@example.com', ts: 1000, inscriptions: 1, embarque: null, rang: 1, statut: 'attente' }]
      return rep(200, { inscrits: file, file, enAttente: 1 })
    }
    if (String(url).startsWith('/api/admin/support/')) return rep(200, { ok: true })
    return rep(404, {})
  }
  return etat
}

const titres = (racine) => [...racine.querySelectorAll('h2')].map((h) => h.textContent)
const actif = (racine) => racine.querySelector('.bo-onglet.actif').textContent.replace(/\s+\d+$/, '').trim()
const laisser = () => new Promise((r) => setTimeout(r, 30))

test('les six rubriques ont chacune leur adresse, l’adresse nue étant la synthèse', () => {
  assert.deepEqual(ONGLETS.map((o) => o.libelle), ['Synthèse', 'Utilisateurs', 'Retours', 'Documents', 'IA', 'Système'])
  assert.equal(ongletDeLAdresse('#/admin'), 'synthese')
  assert.equal(ongletDeLAdresse('#/admin/ia'), 'ia')
  assert.equal(ongletDeLAdresse('#/admin/systeme'), 'systeme')
  assert.equal(ongletDeLAdresse('#/admin/n-importe-quoi'), null)
  const barre = barreOnglets('retours')
  assert.match(barre, /<a class="bo-onglet actif" href="#\/admin\/retours" aria-current="page">Retours/)
  assert.equal((barre.match(/aria-current/g) || []).length, 1)
})

test('les pastilles ne montrent que ce qui attend, et rien sans vue', () => {
  assert.deepEqual(pastilles(null), {})
  assert.deepEqual(pastilles({ d: { flux: { support: { aTraiter: [] } } }, att: { enAttente: 0 } }), {})
  assert.deepEqual(pastilles({ d: { flux: { support: { aTraiter: [1, 2] } } }, att: { enAttente: 5 } }), { utilisateurs: 5, retours: 2 })
})

test('la synthèse rassemble les indicateurs clés et mène aux rubriques', async () => {
  const racine = installer()
  fauxServeur({ echecs: 2 })
  await mountAdmin(racine)
  assert.equal(racine.querySelector('h1').textContent, 'Back-office')
  assert.equal(actif(racine), 'Synthèse')
  assert.deepEqual(titres(racine), ['À traiter', 'Personnes', 'Documents', 'IA (30 jours)', 'Serveur'])
  const texte = racine.textContent.replace(/\s/g, ' ')
  assert.match(texte, /1\s*en liste d'attente/)
  assert.match(texte, /2\s*retours à traiter/)
  assert.match(texte, /2\s*échecs d'e-mail/)
  assert.ok(racine.querySelector('a.bo-chiffre.bo-alerte[href="#/admin/systeme"]'), 'les échecs de courrier se teintent')
  assert.match(texte, /12\s*personnes connues/)
  assert.match(texte, /21\s*demandes de Corrections IA/)
  assert.match(texte, /13\s*messages à Margo/)
  assert.match(texte, /1,50\s*€\s*Corrections IA/)
  assert.match(texte, /321\s*Mo\s*mémoire du process/)
  // Pas de détail : ni la table des comptes, ni celle des documents.
  assert.equal(racine.querySelectorAll('table').length, 0)
  // Les pastilles : 1 adresse en attente, 2 retours.
  assert.equal(racine.querySelector('a[href="#/admin/utilisateurs"] .bo-onglet-badge').textContent, '1')
  assert.equal(racine.querySelector('a[href="#/admin/retours"] .bo-onglet-badge').textContent, '2')
})

test('chaque rubrique montre ce qui lui revient, et seulement cela', async () => {
  const racine = installer()
  fauxServeur()
  await mountAdmin(racine, { onglet: 'utilisateurs' })
  assert.equal(actif(racine), 'Utilisateurs')
  assert.deepEqual(titres(racine), ["Liste d'attente (1)", 'Utilisateurs'])
  assert.ok(racine.textContent.includes('alice@example.com'))

  await mountAdmin(racine, { onglet: 'retours' })
  assert.deepEqual(titres(racine), ['Retours reçus'])
  assert.ok(racine.textContent.includes('Message r1'))

  await mountAdmin(racine, { onglet: 'documents' })
  assert.deepEqual(titres(racine), ['Documents'])
  assert.ok(racine.querySelector('a[href="#/doc/d1"]'))

  await mountAdmin(racine, { onglet: 'systeme' })
  assert.deepEqual(titres(racine), ['Serveur', 'Sauvegarde', 'Emails (30 jours)'])
  assert.ok(racine.querySelector('a[href="/api/admin/sauvegarde"]'))

  // Une rubrique inconnue ramène à la synthèse.
  await mountAdmin(racine, { onglet: 'nimportequoi' })
  assert.equal(actif(racine), 'Synthèse')
})

test('sans retour, la rubrique Retours le dit', async () => {
  const racine = installer()
  fauxServeur({ retours: [] })
  await mountAdmin(racine, { onglet: 'retours' })
  assert.match(racine.textContent, /Aucun retour reçu pour le moment/)
})

test('« Traiter » redessine la rubrique Retours, pas la synthèse', async () => {
  const racine = installer()
  const etat = fauxServeur()
  await mountAdmin(racine, { onglet: 'retours' })
  racine.querySelector('.bo-action[data-cle="r1"]').click()
  await laisser()
  assert.ok(etat.appels.some((a) => a.url === '/api/admin/support/r1/traite' && a.methode === 'POST'))
  assert.equal(actif(racine), 'Retours', 'on reste dans la rubrique')
  // Depuis la synthèse, puis les retours : un seul écouteur, une seule requête par clic.
  await mountAdmin(racine)
  await mountAdmin(racine, { onglet: 'retours' })
  const avant = etat.appels.filter((a) => a.url.startsWith('/api/admin/support/')).length
  racine.querySelector('.bo-action[data-cle="r2"]').click()
  await laisser()
  assert.equal(etat.appels.filter((a) => a.url.startsWith('/api/admin/support/')).length, avant + 1)
})

test('un non-administrateur est renvoyé ; une vue muette ne plante pas', async () => {
  const racine = installer()
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) })
  await mountAdmin(racine)
  assert.match(racine.textContent, /Réservé aux administrateurs/)
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  await mountAdmin(racine)
  assert.match(racine.textContent, /n'a pas répondu/)
})

test('fin : nettoyage', () => {
  setTimeout(() => process.exit(0), 100)
})
