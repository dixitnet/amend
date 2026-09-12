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

    this._onDocUpdate = (update, origin) => {
      if (origin === this) return
      this._sendBinary(update)
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

    ws.addEventListener('open', () => {
      this.connected = true
      this._reconnectDelay = 1000
      this.dispatchEvent(new Event('status'))
      // Announce presence once connected.
      const update = encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])
      this._sendText(JSON.stringify({ type: 'awareness', data: toBase64(update) }))
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
    }
  }

  _sendBinary(bytes) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) this._ws.send(bytes)
  }

  _sendText(text) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) this._ws.send(text)
  }

  destroy() {
    this._closedByUser = true
    this.ydoc.off('update', this._onDocUpdate)
    this.awareness.off('update', this._onAwarenessUpdate)
    removeAwarenessStates(this.awareness, [this.ydoc.clientID], 'provider destroyed')
    this._ws?.close()
  }
}
