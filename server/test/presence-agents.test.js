// La présence de Claude, sans réseau (30/09/2026, server/presenceAgents.js) :
// une fausse salle qui garde les messages, une vraie awareness Yjs qui les
// lit comme le ferait un navigateur.

import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness'
import { PresenceAgents } from '../presenceAgents.js'

const AGENT = { id: 'ag-00000001', docId: 'doc1', nom: 'Claude (pour Sylvain)' }
const VERT = '#5f7a4a'

function monter(options = {}) {
  let t = 1_000_000
  const messages = []
  const rooms = { diffuserTexte: (docId, texte) => messages.push({ docId, texte }) }
  const horloge = { avancer: (ms) => (t += ms) }
  const presence = new PresenceAgents(rooms, { maintenant: () => t, pas: 60_000_000, ...options })
  // Un navigateur qui écoute la salle.
  const client = new Awareness(new Y.Doc())
  // L'awareness renouvelle son état dans un intervalle : il ne doit pas
  // retenir le processus de test.
  if (client._checkInterval && client._checkInterval.unref) client._checkInterval.unref()
  const lire = () => {
    for (const m of messages.splice(0)) {
      const msg = JSON.parse(m.texte)
      assert.equal(msg.type, 'awareness')
      applyAwarenessUpdate(client, Buffer.from(msg.data, 'base64'), 'test')
    }
  }
  const etats = () => [...client.getStates().entries()].filter(([id]) => id !== client.clientID).map(([, e]) => e)
  return { presence, messages, horloge, client, lire, etats }
}

test('un appel d’outil pose la présence : nom, couleur du vert de l’IA, marque « agent »', () => {
  const { presence, lire, etats } = monter()
  presence.signaler(AGENT, { couleur: VERT })
  lire()
  assert.equal(etats().length, 1)
  assert.deepEqual(etats()[0].user, { name: 'Claude (pour Sylvain)', color: VERT })
  assert.equal(etats()[0].agent, true)
  assert.equal(etats()[0].cursor, undefined, 'pas de bloc désigné : pas de curseur')
  presence.arreter()
})

test('le curseur suit le dernier bloc touché, et reste là quand un outil n’en désigne pas', () => {
  const { presence, lire, etats } = monter()
  const ancre = { type: null, tname: 'x', item: null, assoc: 0 }
  presence.signaler(AGENT, { couleur: VERT, ancre })
  lire()
  assert.deepEqual(etats()[0].cursor, { anchor: ancre, head: ancre })
  presence.signaler(AGENT, { couleur: VERT }) // un `plan`, par exemple
  lire()
  assert.deepEqual(etats()[0].cursor.head, ancre, 'le curseur ne disparaît pas')
  presence.arreter()
})

test('la présence est renouvelée tant que Claude travaille, puis retirée après deux minutes', () => {
  const { presence, messages, horloge, lire, etats } = monter()
  presence.signaler(AGENT, { couleur: VERT })
  lire()
  horloge.avancer(60_000)
  presence._tic()
  assert.equal(messages.length, 1, 'un renouvellement part vers la salle')
  lire()
  assert.equal(etats().length, 1)

  horloge.avancer(61_000) // 2 min 01 après le dernier appel
  presence._tic()
  lire()
  assert.equal(etats().length, 0, 'plus de pastille : les navigateurs la retirent')
  assert.equal(presence.messagesPour('doc1').length, 0)
})

test('un participant qui arrive reçoit les agents déjà là, et seulement ceux de son document', () => {
  const { presence } = monter()
  presence.signaler(AGENT, { couleur: VERT })
  presence.signaler({ id: 'ag-00000002', docId: 'doc2', nom: 'Claude (pour Marie)' }, { couleur: VERT })
  assert.equal(presence.messagesPour('doc1').length, 1)
  assert.equal(presence.messagesPour('doc2').length, 1)
  assert.equal(presence.messagesPour('doc3').length, 0)
  presence.arreter()
})

test('retirer (révocation) fait disparaître la pastille tout de suite', () => {
  const { presence, lire, etats } = monter()
  presence.signaler(AGENT, { couleur: VERT })
  lire()
  assert.equal(etats().length, 1)
  presence.retirer(AGENT.id)
  lire()
  assert.equal(etats().length, 0)
  presence.retirer(AGENT.id) // deux fois ne casse rien
})
