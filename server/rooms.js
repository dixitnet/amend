// Per-document "rooms": relays Yjs updates between connected clients and
// persists them, and relays ephemeral awareness (cursor/presence) messages
// without persisting them.
//
// Wire protocol on the WebSocket, by frame type:
//   binary frame  -> a raw Yjs update (opaque bytes, persisted + relayed)
//   text frame    -> a JSON control message, currently only:
//                    { type: 'awareness', payload: <any> } (relayed as-is)

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
}
