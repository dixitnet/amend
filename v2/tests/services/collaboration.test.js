// T2 : l'adaptateur y/hub et l'adaptateur Yjs, ensemble, contre Redis et
// PostgreSQL réels, sans navigateur ni serveur d'amend.ink (identité et droits
// simulés). Sans ces services, le fichier se déclare sauté, avec la raison.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import * as Y from '@y/y'
import { preparerServices, POSTGRES, REDIS } from '../../exploitation/dev/pile.mjs'
import { demarrerCollaboration } from '../../adaptateurs/yhub/index.js'
import { ouvrirDocument } from '../../adaptateurs/yjs/index.js'
import { lireBlocs, texteDesBlocs } from '../../adaptateurs/blocknote/serveur.js'

const PORT = 4511
const ORIGINE = 'http://127.0.0.1:4300'
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const joignable = (port) =>
  new Promise((r) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => (s.destroy(), r(true)))
    s.on('error', () => r(false))
  })

let collab
let raisonSaut = null
const appelsDroits = []
before(async () => {
  try {
    preparerServices()
  } catch (e) {
    raisonSaut = `services indisponibles : ${e.message.slice(0, 120)}`
    return
  }
  if (!(await joignable(6379)) || !(await joignable(5432))) {
    raisonSaut = 'Redis ou PostgreSQL injoignable'
    return
  }
  collab = await demarrerCollaboration({
    port: PORT,
    redis: REDIS,
    postgres: POSTGRES,
    origines: [ORIGINE],
    delaiPersistance: 300,
    // Identité simulée : le cookie `qui=<id>` ; pas de cookie, pas d'identité.
    identifier: async (cookie) => {
      const m = /qui=([\w-]+)/.exec(cookie)
      return m ? { id: m[1] } : null
    },
    droits: async (docId, id) => {
      appelsDroits.push({ docId, id })
      return id.startsWith('lecteur') ? 'lecture' : id.startsWith('banni') ? null : 'ecriture'
    },
  })
})
after(async () => collab?.fermer())

const t2 = (nom, f) => test(nom, (t) => (raisonSaut ? t.skip(raisonSaut) : f(t)))
const docId = (n) => `t2-${n}-${Date.now().toString(36)}`

/** Code HTTP d'une ouverture de WebSocket vers y/hub, sans navigateur. */
function upgrade(id, entetes = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${PORT}/collaboration/ws/v1/amend/${id}`, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': Buffer.from('amend-test-t2-v2').toString('base64'),
        ...entetes,
      },
    })
    req.on('upgrade', (res, socket) => (socket.destroy(), resolve(101)))
    req.on('response', (res) => (res.resume(), resolve(res.statusCode)))
    req.on('error', reject)
    req.end()
  })
}

t2('sans identité : 401 ; personne bannie : 403 ; personne admise : 101', async () => {
  const id = docId('acces')
  assert.equal(await upgrade(id), 401)
  assert.equal(await upgrade(id, { cookie: 'qui=banni-1' }), 403)
  assert.equal(await upgrade(id, { cookie: 'qui=alice' }), 101)
  assert.ok(
    appelsDroits.some((a) => a.docId === id && a.id === 'alice'),
    'les droits sont demandés pour ce document',
  )
})

t2('origine étrangère refusée, origine admise acceptée', async () => {
  const id = docId('origine')
  assert.equal(await upgrade(id, { cookie: 'qui=alice', origin: 'https://exemple.invalid' }), 403)
  assert.equal(await upgrade(id, { cookie: 'qui=alice', origin: ORIGINE }), 101)
})

t2('un document jamais écrit se lit vide, sans erreur', async () => {
  assert.equal(texteDesBlocs(lireBlocs(await collab.lireEtat(docId('vide')))), '')
})

/** Un client Node.js ouvert par l'adaptateur Yjs, avec l'identité simulée
 * dans un cookie (le WebSocket de Node accepte des en-têtes). */
function client(id, personne) {
  // Le WebSocket de Node n'envoie pas de cookie : on lui en fabrique un.
  const NativeWS = globalThis.WebSocket
  globalThis.WebSocket = class extends NativeWS {
    constructor(url, protocoles) {
      super(url, { protocols: protocoles, headers: { cookie: `qui=${personne}` } })
    }
  }
  try {
    return ouvrirDocument({
      url: `ws://127.0.0.1:${PORT}/collaboration/ws/v1/amend`,
      docId: id,
      personne: { id: personne, nom: personne, couleur: 'var(--auteur-1)' },
    })
  } finally {
    globalThis.WebSocket = NativeWS
  }
}
async function attendreQue(predicat, delai = 8000) {
  for (const t0 = Date.now(); Date.now() - t0 < delai; await attendre(50)) if (predicat()) return true
  return false
}

t2('deux clients de l’adaptateur Yjs convergent ; l’état et la présence se suivent', async () => {
  const id = docId('convergence')
  const a = client(id, 'alice')
  const b = client(id, 'bruno')
  const etatsA = []
  a.surEtat((e) => etatsA.push(e))
  let autresVusParA = 0
  a.surParticipants((n) => (autresVusParA = n))
  try {
    assert.ok(await attendreQue(() => etatsA.includes('connecte')), `A connecté (états : ${etatsA})`)
    const texteDe = (s) => s.contexte.doc.get('essai-t2', Y.Text).toString()
    a.contexte.doc.get('essai-t2', Y.Text).insert(0, 'Bonjour de A. ')
    b.contexte.doc.get('essai-t2', Y.Text).insert(0, 'Salut de B. ')
    assert.ok(await attendreQue(() => texteDe(a) === texteDe(b) && texteDe(a).length === 26), 'convergence')
    assert.ok(await attendreQue(() => autresVusParA === 1), 'A voit une autre personne')
  } finally {
    a.fermer()
    b.fermer()
  }
})

t2('un lecteur ne peut pas écrire : sa modification n’atteint pas les autres', async () => {
  const id = docId('lecture')
  const ecrivain = client(id, 'alice')
  const lecteur = client(id, 'lecteur-1')
  try {
    await attendre(800)
    lecteur.contexte.doc.get('essai-t2', Y.Text).insert(0, 'interdit')
    ecrivain.contexte.doc.get('essai-t2', Y.Text).insert(0, 'permis')
    await attendre(1500)
    assert.equal(ecrivain.contexte.doc.get('essai-t2', Y.Text).toString(), 'permis')
  } finally {
    ecrivain.fermer()
    lecteur.fermer()
  }
})
