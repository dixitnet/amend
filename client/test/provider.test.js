// SimpleProvider (client/src/provider.js) : la connexion WebSocket du
// document, avec un faux WebSocket. Point 55 de la feuille de route : le
// module qui décide de ce qui part, quand, et ce qu'on montre quand ça ne
// part pas n'avait aucun test direct.

import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'

class FauxWS extends EventTarget {
  static instances = []
  static OPEN = 1
  constructor(url) {
    super()
    this.url = url
    this.readyState = 0
    this.envoyes = []
    FauxWS.instances.push(this)
  }
  send(x) {
    this.envoyes.push(x)
  }
  close() {
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }
  // --- côté « serveur » ---
  ouvrir() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }
  recevoir(data) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
  couper() {
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }
  get textes() {
    return this.envoyes.filter((x) => typeof x === 'string').map((x) => JSON.parse(x))
  }
  get binaires() {
    return this.envoyes.filter((x) => typeof x !== 'string')
  }
}

const ecouteursFenetre = []
globalThis.WebSocket = FauxWS
globalThis.window = {
  addEventListener: (nom, f) => ecouteursFenetre.push([nom, f]),
  removeEventListener: (nom, f) => {
    const i = ecouteursFenetre.findIndex(([n, g]) => n === nom && g === f)
    if (i >= 0) ecouteursFenetre.splice(i, 1)
  },
}
globalThis.location = { protocol: 'https:', host: 'amend.test' }
const { SimpleProvider } = await import('../src/provider.js')

const USER = { name: 'Alice & Co', color: '#3d5a80' }

function creer() {
  FauxWS.instances.length = 0
  const ydoc = new Y.Doc()
  const p = new SimpleProvider(ydoc, 'doc1', USER)
  const evenements = []
  for (const nom of ['status', 'synced', 'refuse', 'title']) p.addEventListener(nom, (e) => evenements.push([nom, e.detail]))
  return { ydoc, p, ws: () => FauxWS.instances.at(-1), evenements }
}
const synced = (ws, sv = '') => ws.recevoir(JSON.stringify({ type: 'synced', sv }))
const svDe = (ydoc) => Buffer.from(Y.encodeStateVector(ydoc)).toString('base64')

test('l’adresse porte le document, le nom (encodé) et le vecteur d’état', () => {
  const { ydoc, p, ws } = creer()
  ydoc.getText('t').insert(0, 'bonjour')
  const url = new URL(ws().url.replace('wss:', 'https:'))
  assert.equal(url.host, 'amend.test')
  assert.equal(url.pathname, '/ws/doc1')
  assert.equal(url.searchParams.get('user'), 'Alice & Co')
  assert.equal(url.searchParams.get('sv'), Buffer.from(Y.encodeStateVector(new Y.Doc())).toString('base64'), 'vecteur à la création : document vide')
  p.destroy()
})

test('à l’ouverture : connecté, présence annoncée ; rien d’autre ne part avant « synced »', () => {
  const { ydoc, p, ws, evenements } = creer()
  ws().ouvrir()
  assert.equal(p.connected, true)
  assert.equal(p.synced, false)
  assert.equal(ws().textes.length, 1)
  assert.equal(ws().textes[0].type, 'awareness')
  // Une frappe entre l'ouverture et « synced » attend : elle n'est pas envoyée.
  ydoc.getText('t').insert(0, 'x')
  assert.equal(ws().binaires.length, 0)
  assert.equal(p.hasPendingLocalChanges, true)
  assert.ok(evenements.some(([n]) => n === 'status'))
  p.destroy()
})

test('« synced » : envoie ce qui manque au serveur, lève le masque une seule fois', () => {
  const { ydoc, p, ws, evenements } = creer()
  ws().ouvrir()
  ydoc.getText('t').insert(0, 'hors ligne')
  // Le serveur annonce son vecteur : il n'a rien (document vide).
  synced(ws(), svDe(new Y.Doc()))
  assert.equal(ws().binaires.length, 1, 'la différence part')
  const reflet = new Y.Doc()
  Y.applyUpdate(reflet, ws().binaires[0])
  assert.equal(reflet.getText('t').toString(), 'hors ligne')
  assert.equal(p.synced, true)
  assert.equal(p.hasPendingLocalChanges, false)
  assert.equal(evenements.filter(([n]) => n === 'synced').length, 1)
  // Une reconnexion renvoie « synced » : pas de deuxième masque à lever.
  synced(ws(), svDe(ydoc))
  assert.equal(evenements.filter(([n]) => n === 'synced').length, 1)
  p.destroy()
})

test('« synced » avec un serveur à jour : rien n’est renvoyé', () => {
  const { ydoc, p, ws } = creer()
  ydoc.getText('t').insert(0, 'déjà là')
  ws().ouvrir()
  synced(ws(), svDe(ydoc))
  assert.equal(ws().binaires.length, 0)
  p.destroy()
})

test('« synced » sans vecteur (ancien serveur) : l’état entier part seulement s’il y a des modifications en attente', () => {
  const a = creer()
  a.ws().ouvrir()
  synced(a.ws())
  assert.equal(a.ws().binaires.length, 0, 'rien en attente : rien à envoyer')
  a.p.destroy()

  const b = creer()
  b.ws().ouvrir()
  b.ydoc.getText('t').insert(0, 'en attente')
  synced(b.ws())
  assert.equal(b.ws().binaires.length, 1)
  b.p.destroy()
})

test('une fois synchronisé, la frappe part tout de suite et l’indicateur « enregistrement » retombe', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { ydoc, p, ws } = creer()
    ws().ouvrir()
    synced(ws(), svDe(ydoc))
    ydoc.getText('t').insert(0, 'a')
    assert.equal(ws().binaires.length, 1)
    assert.equal(p.saving, true)
    mock.timers.tick(499)
    assert.equal(p.saving, true)
    mock.timers.tick(1)
    assert.equal(p.saving, false)
    p.destroy()
  } finally {
    mock.timers.reset()
  }
})

test('une mise à jour venue du serveur s’applique sans repartir', () => {
  const { ydoc, p, ws } = creer()
  ws().ouvrir()
  synced(ws(), svDe(ydoc))
  const autre = new Y.Doc()
  autre.getText('t').insert(0, 'des autres')
  const octets = Y.encodeStateAsUpdate(autre)
  ws().recevoir(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength))
  assert.equal(ydoc.getText('t').toString(), 'des autres')
  assert.equal(ws().binaires.length, 0, 'pas d’écho vers le serveur')
  p.destroy()
})

test('messages de contrôle : refus et titre sont relayés, le reste est ignoré sans casser', () => {
  const { p, ws, evenements } = creer()
  ws().ouvrir()
  ws().recevoir(JSON.stringify({ type: 'refuse', raison: 'lecteur' }))
  ws().recevoir(JSON.stringify({ type: 'title', title: 'Nouveau titre' }))
  ws().recevoir('pas du json')
  ws().recevoir(JSON.stringify({ type: 'inconnu' }))
  ws().recevoir(JSON.stringify({ type: 'awareness', data: '%%%pas-du-base64' }))
  assert.deepEqual(evenements.find(([n]) => n === 'refuse')[1], { raison: 'lecteur' })
  assert.deepEqual(evenements.find(([n]) => n === 'title')[1], { title: 'Nouveau titre' })
  p.destroy()
})

test('trois échecs de suite avant toute ouverture : accès probablement refusé ; une ouverture remet à zéro', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { p, ws } = creer()
    ws().couper()
    assert.equal(p.likelyRejected, false)
    mock.timers.tick(1000)
    assert.equal(FauxWS.instances.length, 2, 'reconnexion après 1 s')
    ws().couper()
    mock.timers.tick(1700)
    assert.equal(FauxWS.instances.length, 3, 'puis 1,7 s')
    ws().couper()
    assert.equal(p.likelyRejected, true)
    mock.timers.tick(2890)
    assert.equal(FauxWS.instances.length, 4, 'puis 2,89 s')
    ws().ouvrir()
    assert.equal(p.likelyRejected, false)
    // Délai remis à 1 s après une ouverture réussie.
    ws().couper()
    mock.timers.tick(1000)
    assert.equal(FauxWS.instances.length, 5)
    p.destroy()
  } finally {
    mock.timers.reset()
  }
})

test('le délai de reconnexion plafonne à 10 s', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { p, ws } = creer()
    for (let i = 0; i < 12; i++) {
      ws().couper()
      mock.timers.tick(10_000)
    }
    const avant = FauxWS.instances.length
    ws().couper()
    mock.timers.tick(9_999)
    assert.equal(FauxWS.instances.length, avant, 'pas avant 10 s')
    mock.timers.tick(1)
    assert.equal(FauxWS.instances.length, avant + 1)
    p.destroy()
  } finally {
    mock.timers.reset()
  }
})

test('destroy : plus de reconnexion, plus d’écoute du document, écouteur de fenêtre retiré', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const avant = ecouteursFenetre.length
    const { ydoc, p, ws } = creer()
    assert.equal(ecouteursFenetre.length, avant + 1)
    ws().ouvrir()
    synced(ws(), svDe(ydoc))
    const dernier = FauxWS.instances.length
    p.destroy()
    mock.timers.tick(60_000)
    assert.equal(FauxWS.instances.length, dernier, 'aucune reconnexion')
    const envoyesAvant = ws().envoyes.length
    ydoc.getText('t').insert(0, 'après')
    assert.equal(ws().envoyes.length, envoyesAvant, 'le document n’est plus relayé')
    assert.equal(ecouteursFenetre.length, avant, 'pas d’écouteur de fenêtre laissé derrière')
  } finally {
    mock.timers.reset()
  }
})

test('sendTitle : un message texte, et rien hors ligne', () => {
  const { p, ws } = creer()
  p.sendTitle('Avant ouverture')
  assert.equal(ws().textes.length, 0)
  ws().ouvrir()
  p.sendTitle('Titre')
  assert.deepEqual(ws().textes.at(-1), { type: 'title', title: 'Titre' })
  p.destroy()
})
