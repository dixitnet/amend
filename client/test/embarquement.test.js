// Embarquer un testeur depuis le back-office et la page de la liste
// d'attente (01/10/2026, src/embarquement.js, src/admin.js, src/inscrits.js),
// montés dans jsdom avec un faux serveur. Ce qui s'y teste : le bloc du
// haut ne montre que ceux qui attendent ; **rien ne part au premier clic** ;
// le courrier ne part qu'une fois même après plusieurs redessins ; les
// refus du serveur se lisent ; le bouton « Traiter » des retours n'attrape
// pas les boutons d'embarquement qui portent la même classe.

import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountAdmin } from '../src/admin.js'
import { mountInscrits } from '../src/inscrits.js'

function installer() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="racine"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true })
  const w = dom.window
  globalThis.window = w
  globalThis.document = w.document
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true, writable: true })
  for (const k of ['HTMLElement', 'Event']) globalThis[k] = w[k]
  return dom
}

const vide = () => new Promise((r) => setImmediate(r))
async function laisser(n = 6) {
  for (let i = 0; i < n; i++) await vide()
}

function apercu(file) {
  const surListe = file.filter((l) => l.statut === 'attente')
  return {
    genereLe: Date.UTC(2026, 9, 1, 12),
    utilisateurs: { total: 3, actifs: 2, enAttente: 1, liste: [], invitationsEnAttente: [], invitationsPar: {} },
    documents: {
      total: 0, crees30j: 0, partCollaborative: null, aPlusieursParticipants: 0, actifs7j: 0,
      journaux: { octetsTotal: 0, plusGrosOctets: 0, aCompacter: 0, sansHorodatage: 0 },
      sansControleDacces: 0, liste: [],
    },
    flux: {
      connexions: { actifs7j: 0, actifs30j: 0, collaboration30j: { moments: 0, documents: 0 } },
      support: { aTraiter: [], traites: [], recus7j: 0, recus30j: 0 },
      ia: { coutEuros30j: 0, coutEuros7j: 0, coutEuros24h: 0, appels30j: 0, appels7j: 0, tokensEntree30j: 0, tokensSortie30j: 0, parPersonne: [], tarif: null },
      mail: { envois30j: 0, echecs30j: 0, parType: {}, dernierEchec: null },
    },
    serveur: {
      rssMo: 100, uptimeSec: 10, pid: 1, connexionsEnCours: [], repliques: [], dataDirOctets: 0, sauvegardeDistante: null,
      listeAttente: { total: surListe.length, dernier: null },
    },
  }
}

/** Un faux serveur à deux routes utiles, qui trace tout ce qu'on lui demande.
 * `refus` : statut à répondre à l'embarquement (sinon succès). */
function fauxServeur({ file, refus = null, sansAttente = false } = {}) {
  const etat = { file: file.map((l) => ({ ...l })), appels: [], refus }
  globalThis.fetch = async (url, options = {}) => {
    const methode = options.method || 'GET'
    const corps = options.body ? JSON.parse(options.body) : null
    etat.appels.push({ url, methode, corps })
    const repondre = (status, data) => ({ ok: status < 400, status, json: async () => data })
    if (url === '/api/admin/overview') return repondre(200, apercu(etat.file))
    if (url === '/api/admin/waitlist') {
      if (sansAttente) return repondre(500, {})
      return repondre(200, {
        inscrits: etat.file,
        file: etat.file,
        enAttente: etat.file.filter((l) => l.statut === 'attente').length,
      })
    }
    if (url === '/api/admin/embarquer' && methode === 'POST') {
      if (etat.refus) return repondre(etat.refus, { error: 'refus' })
      const l = etat.file.find((x) => x.email === corps.email)
      if (l) {
        l.statut = 'embarque'
        l.embarque = { ts: Date.now(), docId: 'doc-neuf', par: 'admin@example.com' }
      }
      return repondre(200, { email: corps.email, docId: 'doc-neuf', titre: 'Bienvenue sur amend.ink', surListe: Boolean(l) })
    }
    return repondre(404, {})
  }
  return etat
}

const FILE = [
  { email: 'ancienne@example.com', ts: 1000, inscriptions: 1, embarque: null, rang: 1, statut: 'attente' },
  { email: 'deja@example.com', ts: 2000, inscriptions: 1, embarque: null, rang: 2, statut: 'acces' },
  { email: 'trois@example.com', ts: 3000, inscriptions: 3, embarque: null, rang: 3, statut: 'attente' },
  { email: 'fait@example.com', ts: 4000, inscriptions: 1, embarque: { ts: 5000, docId: 'd', par: 'a' }, rang: 4, statut: 'embarque' },
]

const embarquements = (etat) => etat.appels.filter((a) => a.url === '/api/admin/embarquer')

async function monterAdmin(options) {
  const dom = installer()
  const etat = fauxServeur({ file: FILE, ...options })
  const racine = document.getElementById('racine')
  await mountAdmin(racine)
  return { dom, etat, racine }
}

test('le bloc du haut compte ceux qui attendent et ne liste qu’eux, avant les retours', async () => {
  const { racine } = await monterAdmin()
  const h2 = [...racine.querySelectorAll('h2')].map((h) => h.textContent)
  assert.equal(h2[0], "Liste d'attente (2)")
  const boutons = [...racine.querySelectorAll('[data-embarquer]')].map((b) => b.dataset.embarquer)
  assert.deepEqual(boutons, ['ancienne@example.com', 'trois@example.com'])
  assert.ok(racine.textContent.includes('×3'), 'les doublons se voient')
  assert.ok(!racine.textContent.includes('fait@example.com'))
})

test('personne n’attend : le bloc le dit, sans tableau', async () => {
  installer()
  fauxServeur({ file: FILE.filter((l) => l.statut !== 'attente') })
  const racine = document.getElementById('racine')
  await mountAdmin(racine)
  assert.ok(racine.textContent.includes("Liste d'attente (0)"))
  assert.ok(racine.textContent.includes("Personne n'attend."))
  assert.equal(racine.querySelectorAll('[data-embarquer]').length, 0)
})

test('la liste d’attente en panne n’emporte pas le back-office', async () => {
  installer()
  fauxServeur({ file: FILE, sansAttente: true })
  const racine = document.getElementById('racine')
  await mountAdmin(racine)
  assert.ok(racine.textContent.includes('Back-office'))
  assert.ok(!racine.textContent.includes("Liste d'attente ("))
  assert.ok(racine.querySelector('form[data-embarquer-form]'), 'le champ libre reste là')
})

test('le premier clic arme, ne poste rien ; le second embarque et redessine', async () => {
  const { etat, racine } = await monterAdmin()
  const bouton = racine.querySelector('[data-embarquer="ancienne@example.com"]')
  bouton.click()
  await laisser()
  assert.equal(embarquements(etat).length, 0, 'rien n’est parti au premier clic')
  assert.equal(bouton.textContent, 'Confirmer ?')
  assert.ok(racine.textContent.includes('envoyer l\'invitation à ancienne@example.com'))

  bouton.click()
  await laisser(12)
  const posts = embarquements(etat)
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0].corps, { email: 'ancienne@example.com' })
  // Page redessinée : l'adresse n'attend plus, un message le dit.
  assert.ok(racine.textContent.includes("Liste d'attente (1)"))
  assert.ok(racine.textContent.includes('invitation envoyée à ancienne@example.com'))
  assert.equal(racine.querySelector('[data-embarquer="ancienne@example.com"]'), null)
})

test('après plusieurs redessins, un clic ne poste qu’une fois', async () => {
  const { etat, racine } = await monterAdmin()
  for (const adresse of ['ancienne@example.com', 'trois@example.com']) {
    const b = racine.querySelector(`[data-embarquer="${adresse}"]`)
    b.click()
    b.click()
    await laisser(12)
  }
  const adresses = embarquements(etat).map((a) => a.corps.email)
  assert.deepEqual(adresses, ['ancienne@example.com', 'trois@example.com'], 'un envoi par adresse, pas un de plus')
})

test('le bouton « Traiter » des retours n’attrape pas un bouton d’embarquement', async () => {
  const { etat, racine } = await monterAdmin()
  const bouton = racine.querySelector('[data-embarquer]')
  bouton.click()
  await laisser()
  assert.equal(etat.appels.filter((a) => a.url.includes('/support/')).length, 0)
})

test('l’armement retombe au bout de cinq secondes', async () => {
  const { etat, racine } = await monterAdmin()
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const bouton = racine.querySelector('[data-embarquer]')
    bouton.click()
    assert.equal(bouton.dataset.arme, 'oui')
    mock.timers.tick(5001)
    assert.equal(bouton.dataset.arme, undefined)
    assert.equal(bouton.textContent, 'Embarquer')
    bouton.click() // à nouveau le premier clic : toujours rien de posté
    assert.equal(embarquements(etat).length, 0)
  } finally {
    mock.timers.reset()
  }
})

test('refus 409 : le message se lit, le bouton est rendu', async () => {
  const { racine } = await monterAdmin({ refus: 409 })
  const bouton = racine.querySelector('[data-embarquer]')
  bouton.click()
  bouton.click()
  await laisser(12)
  assert.ok(racine.textContent.includes('a déjà accès'))
  assert.equal(bouton.disabled, false)
  assert.equal(bouton.textContent, 'Embarquer')
})

test('refus 502 : on lit que rien n’a été créé', async () => {
  const { racine } = await monterAdmin({ refus: 502 })
  const bouton = racine.querySelector('[data-embarquer]')
  bouton.click()
  bouton.click()
  await laisser(12)
  assert.ok(racine.textContent.includes('rien n\'a été créé'))
})

test('serveur muet : le message dit de vérifier la liste avant de réessayer', async () => {
  const { etat, racine } = await monterAdmin()
  const normal = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (url === '/api/admin/embarquer') throw new Error('réseau')
    return normal(url, options)
  }
  const bouton = racine.querySelector('[data-embarquer]')
  bouton.click()
  bouton.click()
  await laisser(12)
  assert.ok(racine.textContent.includes('regardez la liste'))
  assert.equal(embarquements(etat).length, 0)
})

test('le champ libre : adresse invalide, aucun armement ni envoi', async () => {
  const { etat, racine } = await monterAdmin()
  const form = racine.querySelector('form[data-embarquer-form]')
  const champ = form.querySelector('input[name=email]')
  const bouton = form.querySelector('button[type=submit]')
  champ.value = 'pas-une-adresse'
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  await laisser()
  assert.ok(form.textContent.includes('adresse valide'))
  assert.equal(bouton.dataset.arme, undefined)
  assert.equal(embarquements(etat).length, 0)
})

test('le champ libre : deux validations pour envoyer, et changer l’adresse désarme', async () => {
  const { etat, racine } = await monterAdmin()
  const form = racine.querySelector('form[data-embarquer-form]')
  const champ = form.querySelector('input[name=email]')
  const bouton = form.querySelector('button[type=submit]')
  const soumettre = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))

  champ.value = 'quelquun@example.com'
  soumettre()
  assert.equal(bouton.dataset.arme, 'oui')
  assert.equal(embarquements(etat).length, 0)

  // Une faute corrigée : la confirmation portait sur l'ancienne adresse.
  champ.value = 'quelquun@exemple.com'
  champ.dispatchEvent(new window.Event('input', { bubbles: true }))
  assert.equal(bouton.dataset.arme, undefined)
  soumettre()
  assert.equal(embarquements(etat).length, 0, 'il faut reconfirmer')

  soumettre()
  await laisser(12)
  const posts = embarquements(etat)
  assert.equal(posts.length, 1)
  assert.deepEqual(posts[0].corps, { email: 'quelquun@exemple.com' })
  assert.ok(racine.textContent.includes('invitation envoyée à quelquun@exemple.com'))
})

// --- Page de la liste d'attente (#/inscrits) ------------------------------

async function monterInscrits(options) {
  installer()
  const etat = fauxServeur({ file: FILE, ...options })
  const racine = document.getElementById('racine')
  await mountInscrits(racine)
  return { etat, racine }
}

test('la page des inscrits : une ligne par adresse, la file d’abord, un bouton pour ceux qui attendent', async () => {
  const { racine } = await monterInscrits()
  const lignes = [...racine.querySelectorAll('tbody tr')].map((tr) => tr.children[0].textContent.trim())
  assert.deepEqual(lignes, ['ancienne@example.com', 'trois@example.com ×3', 'deja@example.com', 'fait@example.com'])
  assert.equal(racine.querySelectorAll('[data-embarquer]').length, 2)
  const statuts = [...racine.querySelectorAll('tbody tr')].map((tr) => tr.children[3].textContent)
  assert.ok(statuts[2].includes('a déjà accès'))
  assert.ok(statuts[3].includes('embarquée le'))
  assert.ok(racine.querySelector('.subtitle').textContent.includes('4 adresses pour 6 inscriptions'))
  assert.ok(racine.querySelector('.subtitle').textContent.includes('2 en attente'))
})

test('la page des inscrits : deux clics embarquent, et la page se redessine', async () => {
  const { etat, racine } = await monterInscrits()
  const bouton = racine.querySelector('[data-embarquer="trois@example.com"]')
  bouton.click()
  await laisser()
  assert.equal(embarquements(etat).length, 0)
  bouton.click()
  await laisser(12)
  assert.equal(embarquements(etat).length, 1)
  assert.equal(racine.querySelectorAll('[data-embarquer]').length, 1)
  assert.ok(racine.textContent.includes('invitation envoyée à trois@example.com'))
})

test('passer du back-office à la page des inscrits : la page montée en dernier se redessine', async () => {
  const { etat, racine } = await monterInscrits()
  await mountAdmin(racine) // même racine, l'autre page par-dessus
  await mountInscrits(racine)
  const bouton = racine.querySelector('[data-embarquer="ancienne@example.com"]')
  bouton.click()
  bouton.click()
  await laisser(14)
  assert.equal(embarquements(etat).length, 1)
  assert.ok(racine.textContent.includes('Liste d\'attente'), 'redessinée')
  assert.ok(racine.querySelector('.inscrits-table'), 'c’est la page des inscrits qui est revenue, pas le back-office')
})

test('fin : nettoyage', () => {
  setTimeout(() => process.exit(0), 100)
})
