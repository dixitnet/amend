// Per-document "rooms": relays Yjs updates between connected clients and
// persists them, and relays ephemeral awareness (cursor/presence) messages
// without persisting them.
//
// Wire protocol on the WebSocket, by frame type:
//   binary frame  -> a raw Yjs update (opaque bytes, persisted + relayed)
//   text frame    -> a JSON control message :
//                    { type: 'awareness', payload: <any> } (relayed as-is)
//                    { type: 'synced' } (envoyé une fois, à la fin du rejeu
//                    initial — voir join())

export class Rooms {
  constructor(storage) {
    this.storage = storage
    /** @type {Map<string, Set<{conn: import('./ws.js').WebSocketConnection, user: string}>>} */
    this.rooms = new Map()
  }

  join(docId, conn, user) {
    let members = this.rooms.get(docId)
    if (!members) {
      members = new Set()
      this.rooms.set(docId, members)
    }
    const member = { conn, user }
    members.add(member)

    // Replay the persisted history so the new client can reconstruct the
    // document by applying each update in order (Yjs updates are
    // commutative/idempotent, so exact ordering across peers doesn't matter,
    // only that every update is delivered at least once).
    for (const update of this.storage.readUpdates(docId)) {
      conn.send(update, { binary: true })
    }
    // Fin du rejeu (23/09/2026). Sans ce message, le client n'a **aucun
    // moyen** de savoir quand le document est complet : il reçoit un flot
    // d'opérations et les applique une à une, si bien que le texte se
    // recompose sous les yeux de qui ouvre la page — paragraphe après
    // paragraphe sur un gros document. C'était le défaut d'ergonomie le
    // plus voyant de l'application.
    //
    // Une ligne de plus dans le protocole, ignorée par un client ancien
    // (voir _handleText, qui laisse tomber les types inconnus) : le
    // déploiement peut donc se faire dans n'importe quel ordre.
    conn.send(JSON.stringify({ type: 'synced' }))

    conn.on('message', (data, isBinary) => this._onMessage(docId, member, data, isBinary))
    conn.on('close', () => this._leave(docId, member))
    conn.on('error', () => this._leave(docId, member))

    return member
  }

  _onMessage(docId, member, data, isBinary) {
    if (isBinary) {
      this.storage.appendUpdate(docId, data)
      this._broadcast(docId, member, data, { binary: true })
      return
    }
    // Text frames are JSON control messages (awareness/presence). Relay
    // them to everyone else in the room; never persisted.
    try {
      JSON.parse(data.toString('utf8'))
    } catch {
      return // ignore malformed control messages
    }
    this._broadcast(docId, member, data, { binary: false })
  }

  _broadcast(docId, from, data, opts) {
    const members = this.rooms.get(docId)
    if (!members) return
    for (const member of members) {
      if (member === from) continue
      member.conn.send(data, opts)
    }
  }

  _leave(docId, member) {
    const members = this.rooms.get(docId)
    if (!members) return
    members.delete(member)
    if (members.size === 0) this.rooms.delete(docId)
  }

  presenceCount(docId) {
    return this.rooms.get(docId)?.size ?? 0
  }

  /** Photo des salles occupées — pour le back-office (server/admin.js).
   * Les noms affichés sont ceux que les clients déclarent (paramètre `user`
   * de l'ouverture WebSocket), pas les adresses de session. */
  snapshot() {
    const out = []
    for (const [docId, membres] of this.rooms) {
      out.push({ docId, connectes: membres.size, noms: [...membres].map((m) => m.user) })
    }
    return out.sort((a, b) => b.connectes - a.connectes)
  }
}
