// Vérifie le keep-alive du WebSocket maison : une socket qui ne répond
// plus aux pings doit être coupée par le serveur, sans attendre
// l'expiration TCP. C'est ce mécanisme qui garantit qu'un participant
// disparu libère sa place dans la salle (voir rooms.js, presenceCount).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { connect } from 'node:net'
import { WebSocketConnection } from '../ws.js'

/** Monte une paire de sockets connectées en local et enveloppe le côté
 * serveur dans une WebSocketConnection au keep-alive accéléré. */
function paire({ pingIntervalMs, repondreAuPing }) {
  return new Promise((resolve) => {
    const srv = createServer((sockServeur) => {
      const conn = new WebSocketConnection(sockServeur, { pingIntervalMs })
      resolve({ srv, conn, client })
    })
    let client
    srv.listen(0, '127.0.0.1', () => {
      client = connect(srv.address().port, '127.0.0.1')
      client.on('data', (buf) => {
        // 0x89 = FIN + opcode PING ; on répond par un PONG masqué (0x8a)
        if (repondreAuPing && buf[0] === 0x89) {
          const masque = Buffer.from([0x01, 0x02, 0x03, 0x04])
          client.write(Buffer.concat([Buffer.from([0x8a, 0x80]), masque]))
        }
      })
      client.on('error', () => {})
    })
  })
}

test('une socket qui ne répond plus aux pings est coupée', async () => {
  const { srv, conn, client } = await paire({ pingIntervalMs: 40, repondreAuPing: false })
  const ferme = await new Promise((resolve) => {
    conn.on('close', () => resolve(true))
    setTimeout(() => resolve(false), 1000)
  })
  client.destroy()
  srv.close()
  assert.equal(ferme, true, 'la connexion muette aurait dû être coupée par le keep-alive')
})

test('une socket qui répond aux pings reste connectée', async () => {
  const { srv, conn, client } = await paire({ pingIntervalMs: 40, repondreAuPing: true })
  const ferme = await new Promise((resolve) => {
    conn.on('close', () => resolve(true))
    setTimeout(() => resolve(false), 500)
  })
  client.destroy()
  srv.close()
  assert.equal(ferme, false, 'une connexion qui pongue ne doit pas être coupée')
})

test('un pair qui coupe net (FIN sans trame de fermeture) libère aussitôt sa place', async () => {
  // Les sockets d'une montée en version HTTP sont semi-ouvertes : sans
  // gestionnaire de `end`, la connexion restait comptée dans la salle
  // jusqu'au ping suivant. Serveur de test en allowHalfOpen, comme http.
  const { conn, client, srv } = await new Promise((resolve) => {
    const srv = createServer({ allowHalfOpen: true }, (sock) => {
      resolve({ srv, conn: new WebSocketConnection(sock, { pingIntervalMs: 60000 }), client })
    })
    let client
    srv.listen(0, '127.0.0.1', () => {
      client = connect(srv.address().port, '127.0.0.1')
      client.on('error', () => {})
    })
  })
  const ferme = new Promise((resolve) => {
    conn.on('close', () => resolve(true))
    setTimeout(() => resolve(false), 1000)
  })
  client.end() // FIN, rien d'autre
  assert.equal(await ferme, true, 'la connexion coupée net aurait dû être libérée sans attendre le ping')
  client.destroy()
  srv.close()
})

// --- Plafond de taille (audit du 10/10/2026, S3) ---

function trameMasquee(opcode, payload, fin = true) {
  const masque = Buffer.from([1, 2, 3, 4])
  const len = payload.length
  let entete
  if (len < 126) entete = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | len])
  else if (len < 65536) {
    entete = Buffer.alloc(4)
    entete[0] = (fin ? 0x80 : 0) | opcode
    entete[1] = 0x80 | 126
    entete.writeUInt16BE(len, 2)
  } else {
    entete = Buffer.alloc(10)
    entete[0] = (fin ? 0x80 : 0) | opcode
    entete[1] = 0x80 | 127
    entete.writeBigUInt64BE(BigInt(len), 2)
  }
  const corps = Buffer.from(payload)
  for (let i = 0; i < corps.length; i++) corps[i] ^= masque[i % 4]
  return Buffer.concat([entete, masque, corps])
}

function paireAvecPlafond(maxMessageBytes) {
  return new Promise((resolve) => {
    const srv = createServer((sockServeur) => {
      const conn = new WebSocketConnection(sockServeur, { pingIntervalMs: 60000, maxMessageBytes })
      conn.on('error', () => {}) // rooms.js en pose un ; ici, une coupure franche est attendue
      resolve({ srv, conn, client })
    })
    let client
    srv.listen(0, '127.0.0.1', () => {
      client = connect(srv.address().port, '127.0.0.1')
      client.on('error', () => {})
    })
  })
}

test('une trame annoncée au-delà du plafond ferme la connexion (1009) sans rien allouer', async () => {
  const { srv, conn, client } = await paireAvecPlafond(1024)
  const recu = []
  client.on('data', (b) => recu.push(b))
  const messages = []
  conn.on('message', (d) => messages.push(d))
  const ferme = new Promise((resolve) => conn.on('close', () => resolve(true)))
  // Seul l'en-tête : « 2 Go à venir ». Le corps n'arrive jamais.
  const entete = Buffer.alloc(10)
  entete[0] = 0x82
  entete[1] = 0x80 | 127
  entete.writeBigUInt64BE(2n * 1024n * 1024n * 1024n, 2)
  client.write(Buffer.concat([entete, Buffer.from([1, 2, 3, 4])]))
  assert.equal(await Promise.race([ferme, new Promise((r) => setTimeout(() => r(false), 1000))]), true)
  await new Promise((r) => setTimeout(r, 50))
  const brut = Buffer.concat(recu)
  assert.equal(brut[0], 0x88, 'trame CLOSE')
  assert.equal(brut.readUInt16BE(2), 1009)
  assert.equal(messages.length, 0)
  client.destroy()
  srv.close()
})

test('un message fragmenté dont le total dépasse le plafond ferme la connexion', async () => {
  const { srv, conn, client } = await paireAvecPlafond(1000)
  const messages = []
  conn.on('message', (d) => messages.push(d))
  const ferme = new Promise((resolve) => conn.on('close', () => resolve(true)))
  client.write(trameMasquee(0x2, Buffer.alloc(600, 1), false))
  client.write(trameMasquee(0x0, Buffer.alloc(600, 2), false))
  client.write(trameMasquee(0x0, Buffer.alloc(600, 3), true))
  assert.equal(await Promise.race([ferme, new Promise((r) => setTimeout(() => r(false), 1000))]), true)
  assert.equal(messages.length, 0)
  client.destroy()
  srv.close()
})

test('une grosse trame qui arrive par petits paquets est livrée entière', async () => {
  const { srv, conn, client } = await paireAvecPlafond(1024 * 1024)
  const recu = new Promise((resolve) => conn.on('message', (d, bin) => resolve({ d, bin })))
  const payload = Buffer.alloc(300000)
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251
  const trame = trameMasquee(0x2, payload)
  for (let i = 0; i < trame.length; i += 7000) client.write(trame.subarray(i, i + 7000))
  const { d, bin } = await Promise.race([
    recu,
    new Promise((_r, rej) => setTimeout(() => rej(new Error('rien reçu')), 2000)),
  ])
  assert.equal(bin, true)
  assert.equal(d.length, payload.length)
  assert.ok(d.equals(payload))
  client.destroy()
  srv.close()
})
