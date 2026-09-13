import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'

function toBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * A minimal, dependency-free (beyond yjs/y-protocols) counterpart to the
 * server's relay in server/rooms.js:
 *   - binary WS frames carry raw Yjs document updates (persisted server-side)
 *   - text WS frames carry JSON control messages; the only one used here is
 *     { type: 'awareness', data: base64(<encoded awareness update>) },
 *     which is never persisted (cursors/presence are ephemeral).
 *
 * This intentionally does not implement the full y-websocket sync protocol
 * (sync-step1/2) — the server instead replays its whole update log to every
 * new connection, which Yjs can merge in any order.
 */
export class SimpleProvider extends EventTarget {
  constructor(ydoc, docId, user) {
    super()
    this.ydoc = ydoc
    this.docId = docId
    this.user = user
    this.awareness = new Awareness(ydoc)
    this.awareness.setLocalStateField('user', user)
    this.connected = false
    this._closedByUser = false
    this._reconnectDelay = 1000
    this._ws = null
    // Sync-state bookkeeping for the "à jour / enregistrement… /
    // modifications non envoyées" indicator (editor.js) — see _onDocUpdate,
    // _connect's 'open' handler, and the 'status' event dispatched below.
    this.hasPendingLocalChanges = false
    this.saving = false
    this._savingTimer = null
    // Set once several consecutive connection attempts in a row fail before
    // ever reaching 'open' (see _connect/_scheduleReconnect below) — the
    // signature of a rejected upgrade (e.g. the server's MAX_USERS_PER_DOC
    // cap, see server.js) rather than an ordinary transient network blip,
    // which usually still manages to open before dropping. The WebSocket
    // API doesn't expose the HTTP status of a failed handshake to JS, so
    // this is a heuristic, not a certainty — but it's enough to show
    // something more useful than an endless silent "reconnexion…".
    this.likelyRejected = false
    this._consecutiveFailedAttempts = 0

    this._onDocUpdate = (update, origin) => {
      if (origin === this) return
      if (this.connected) {
        this._sendBinary(update)
        this.saving = true
        this.dispatchEvent(new Event('status'))
        clearTimeout(this._savingTimer)
        this._savingTimer = setTimeout(() => {
          this.saving = false
          this.dispatchEvent(new Event('status'))
        }, 500)
      } else {
        // Can't reach the server right now: the edit stays safe in this
        // tab's own Yjs doc (and reaches everyone once we reconnect — see
        // the full-state resync in _connect's 'open' handler below), but it
        // hasn't gone anywhere yet. Reflected honestly in the status pill
        // rather than silently showing "reconnexion…" as if nothing were
        // at stake.
        this.hasPendingLocalChanges = true
        this.dispatchEvent(new Event('status'))
      }
    }
    this.ydoc.on('update', this._onDocUpdate)

    this._onAwarenessUpdate = ({ added, updated, removed }, origin) => {
      if (origin === this) return
      const changed = added.concat(updated, removed)
      const update = encodeAwarenessUpdate(this.awareness, changed)
      this._sendText(JSON.stringify({ type: 'awareness', data: toBase64(update) }))
    }
    this.awareness.on('update', this._onAwarenessUpdate)

    window.addEventListener('beforeunload', () => {
      removeAwarenessStates(this.awareness, [this.ydoc.clientID], 'window unload')
    })

    this._connect()
  }

  _wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/ws/${this.docId}?user=${encodeURIComponent(this.user.name)}`
  }

  _connect() {
    const ws = new WebSocket(this._wsUrl())
    ws.binaryType = 'arraybuffer'
    this._ws = ws
    let openedThisAttempt = false

    ws.addEventListener('open', () => {
      openedThisAttempt = true
      this.connected = true
      this._reconnectDelay = 1000
      this._consecutiveFailedAttempts = 0
      this.likelyRejected = false
      this.dispatchEvent(new Event('status'))
      // Announce presence once connected.
      const update = encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])
      this._sendText(JSON.stringify({ type: 'awareness', data: toBase64(update) }))
      // Re-send this tab's entire document state, not just new updates
      // going forward. Two reasons: any edit made while disconnected never
      // actually reached the server (see _onDocUpdate above — `_sendBinary`
      // is a no-op while offline), and this "replay everything" relay
      // doesn't implement sync-step1/2 to ask the server what it's
      // missing. Yjs updates are idempotent/commutative, so re-sending the
      // full state is always safe — the server and every peer just merge
      // it, whether or not they already had all of it.
      if (this.hasPendingLocalChanges) {
        this._sendBinary(Y.encodeStateAsUpdate(this.ydoc))
        this.hasPendingLocalChanges = false
        this.dispatchEvent(new Event('status'))
      }
    })

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this._handleText(event.data)
      } else {
        Y.applyUpdate(this.ydoc, new Uint8Array(event.data), this)
      }
    })

    ws.addEventListener('close', () => {
      this.connected = false
      if (!openedThisAttempt) {
        this._consecutiveFailedAttempts += 1
        // 3 in a row without ever reaching 'open': treat as a likely
        // rejection (full room, unknown doc reappearing, etc.) rather than
        // a one-off network hiccup.
        this.likelyRejected = this._consecutiveFailedAttempts >= 3
      }
      this.dispatchEvent(new Event('status'))
      if (!this._closedByUser) this._scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      // 'close' will follow; nothing extra to do here.
    })
  }

  _scheduleReconnect() {
    setTimeout(() => {
      if (this._closedByUser) return
      this._connect()
    }, this._reconnectDelay)
    this._reconnectDelay = Math.min(this._reconnectDelay * 1.7, 10000)
  }

  _handleText(text) {
    let msg
    try {
      msg = JSON.parse(text)
    } catch {
      return
    }
    if (msg.type === 'awareness' && typeof msg.data === 'string') {
      try {
        applyAwarenessUpdate(this.awareness, fromBase64(msg.data), this)
      } catch {
        // ignore malformed awareness payloads
      }
    } else if (msg.type === 'title' && typeof msg.title === 'string') {
      // Relayed, not persisted here — whoever changed it already saved it
      // via PATCH /api/docs/:id (see editor.js). This just tells everyone
      // else's screen right away, instead of only on their next reload.
      this.dispatchEvent(new CustomEvent('title', { detail: { title: msg.title } }))
    }
  }

  _sendBinary(bytes) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) this._ws.send(bytes)
  }

  _sendText(text) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) this._ws.send(text)
  }

  /** Tells every other connected client that the document's title just
   * changed (see editor.js's title input). Relayed like awareness — not
   * persisted through this channel, since the REST PATCH already persists
   * it; this is purely so other open tabs update live instead of only on
   * their next reload. A no-op while offline, same as any other send — the
   * title stays correct on reconnect via the normal doc-metadata fetch. */
  sendTitle(title) {
    this._sendText(JSON.stringify({ type: 'title', title }))
  }

  destroy() {
    this._closedByUser = true
    this.ydoc.off('update', this._onDocUpdate)
    this.awareness.off('update', this._onAwarenessUpdate)
    removeAwarenessStates(this.awareness, [this.ydoc.clientID], 'provider destroyed')
    this._ws?.close()
  }
}
