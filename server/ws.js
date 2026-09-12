// Minimal RFC 6455 WebSocket server implementation using only Node.js
// built-ins (http + crypto). No external dependency.
//
// This intentionally supports only what this app needs: text and binary
// messages (fragmented or not), ping/pong keep-alive, and clean close.
// It does not implement permessage-deflate or WebSocket extensions.

import { createHash, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
}

export function computeAcceptKey(secWebSocketKey) {
  return createHash('sha1').update(secWebSocketKey + GUID).digest('base64')
}

/** True if this HTTP upgrade request is a WebSocket handshake. */
export function isWebSocketUpgrade(req) {
  return (
    req.method === 'GET' &&
    (req.headers.upgrade || '').toLowerCase() === 'websocket' &&
    typeof req.headers['sec-websocket-key'] === 'string'
  )
}

/**
 * Completes the WebSocket handshake on a raw HTTP upgrade socket and
 * returns a WebSocketConnection wrapping it.
 */
export function acceptWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key']
  const accept = computeAcceptKey(key)
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n')
  socket.write(responseHeaders)
  return new WebSocketConnection(socket)
}

function buildFrame(opcode, payload, fin = true) {
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.alloc(2)
    header[1] = len
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  header[0] = (fin ? 0x80 : 0) | (opcode & 0x0f)
  return Buffer.concat([header, payload])
}

/**
 * Parses as many complete frames as are available at the start of `buf`.
 * Returns { frame: {fin, opcode, payload} | null, rest: Buffer }.
 * `frame` is null if `buf` does not yet contain a full frame.
 */
function parseFrame(buf) {
  if (buf.length < 2) return { frame: null, rest: buf }
  const byte0 = buf[0]
  const byte1 = buf[1]
  const fin = (byte0 & 0x80) !== 0
  const opcode = byte0 & 0x0f
  const masked = (byte1 & 0x80) !== 0
  let len = byte1 & 0x7f
  let offset = 2

  if (len === 126) {
    if (buf.length < offset + 2) return { frame: null, rest: buf }
    len = buf.readUInt16BE(offset)
    offset += 2
  } else if (len === 127) {
    if (buf.length < offset + 8) return { frame: null, rest: buf }
    const big = buf.readBigUInt64BE(offset)
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('frame too large')
    }
    len = Number(big)
    offset += 8
  }

  let maskKey = null
  if (masked) {
    if (buf.length < offset + 4) return { frame: null, rest: buf }
    maskKey = buf.subarray(offset, offset + 4)
    offset += 4
  }

  if (buf.length < offset + len) return { frame: null, rest: buf }

  let payload = buf.subarray(offset, offset + len)
  if (masked) {
    const unmasked = Buffer.alloc(len)
    for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ maskKey[i % 4]
    payload = unmasked
  } else {
    payload = Buffer.from(payload)
  }

  return { frame: { fin, opcode, payload }, rest: buf.subarray(offset + len) }
}

/**
 * A single WebSocket connection. Emits:
 *   'message' (data: Buffer, isBinary: boolean)
 *   'close'   ()
 *   'error'   (err)
 */
export class WebSocketConnection extends EventEmitter {
  constructor(socket) {
    super()
    this.socket = socket
    this._buffer = Buffer.alloc(0)
    this._fragOpcode = null
    this._fragChunks = []
    this._closed = false
    this._alive = true

    socket.on('data', (chunk) => this._onData(chunk))
    socket.on('close', () => this._onClose())
    socket.on('error', (err) => this.emit('error', err))

    // Keep-alive: ping every 30s, drop the connection if no pong within 30s.
    this._pingTimer = setInterval(() => {
      if (!this._alive) {
        this.terminate()
        return
      }
      this._alive = false
      this._sendRaw(OPCODE.PING, Buffer.alloc(0))
    }, 30000)
    this._pingTimer.unref?.()
  }

  _onData(chunk) {
    this._buffer = this._buffer.length ? Buffer.concat([this._buffer, chunk]) : chunk
    try {
      for (;;) {
        const { frame, rest } = parseFrame(this._buffer)
        if (!frame) break
        this._buffer = rest
        this._handleFrame(frame)
        if (this._closed) break
      }
    } catch (err) {
      this.emit('error', err)
      this.terminate()
    }
  }

  _handleFrame(frame) {
    const { fin, opcode, payload } = frame
    switch (opcode) {
      case OPCODE.TEXT:
      case OPCODE.BINARY:
        if (fin) {
          this.emit('message', payload, opcode === OPCODE.BINARY)
        } else {
          this._fragOpcode = opcode
          this._fragChunks = [payload]
        }
        break
      case OPCODE.CONTINUATION:
        this._fragChunks.push(payload)
        if (fin) {
          const full = Buffer.concat(this._fragChunks)
          const isBinary = this._fragOpcode === OPCODE.BINARY
          this._fragChunks = []
          this._fragOpcode = null
          this.emit('message', full, isBinary)
        }
        break
      case OPCODE.PING:
        this._sendRaw(OPCODE.PONG, payload)
        break
      case OPCODE.PONG:
        this._alive = true
        break
      case OPCODE.CLOSE:
        this._sendRaw(OPCODE.CLOSE, payload.subarray(0, 2))
        this.terminate()
        break
      default:
        // Unknown opcode: ignore.
        break
    }
  }

  _sendRaw(opcode, payload) {
    if (this._closed) return
    try {
      this.socket.write(buildFrame(opcode, payload))
    } catch {
      // Socket already gone; onClose will clean up.
    }
  }

  send(data, { binary = false } = {}) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data)
    this._sendRaw(binary ? OPCODE.BINARY : OPCODE.TEXT, payload)
  }

  terminate() {
    if (this._closed) return
    this._closed = true
    clearInterval(this._pingTimer)
    try {
      this.socket.destroy()
    } catch {
      // ignore
    }
    this.emit('close')
  }

  _onClose() {
    if (this._closed) return
    this._closed = true
    clearInterval(this._pingTimer)
    this.emit('close')
  }
}

export function randomId(bytes = 9) {
  return randomBytes(bytes).toString('base64url')
}
