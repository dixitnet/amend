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
