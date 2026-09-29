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
 * Depuis le 29/09/2026 le serveur tient une réplique du document
 * (server/replique.js) et la synchronisation se fait en deux temps, comme
 * le prévoit Yjs : à l'ouverture, ce client envoie son vecteur d'état
 * ({ type: 'sync', sv }) ; le serveur répond par ce qui manque au client
 * (une trame binaire), puis par { type: 'synced', sv } avec son propre
 * vecteur ; le client renvoie alors seulement ce qui manque au serveur —
 * ses modifications faites hors ligne — et non plus l'état complet.
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
    // Vrai une fois que le serveur a fini de rejouer le journal (message
    // `synced`). Sert au masque de chargement de l'éditeur.
    this.synced = false
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
    // signature of a rejected upgrade (accès retiré au document, document
    // supprimé : voir le handler 'upgrade' de server.js) rather than an
    // ordinary transient network blip,
    // which usually still manages to open before dropping. The WebSocket
    // API doesn't expose the HTTP status of a failed handshake to JS, so
    // this is a heuristic, not a certainty — but it's enough to show
    // something more useful than an endless silent "reconnexion…".
    this.likelyRejected = false
    this._consecutiveFailedAttempts = 0

    // Vrai entre le `synced` d'une connexion et sa fermeture : c'est
    // seulement là qu'une frappe part telle quelle. Entre l'ouverture et
    // `synced`, elle attend — le serveur n'a peut-être pas encore ce qui la
    // précède (des modifications hors ligne), et une opération qui s'appuie
    // sur de l'inconnu serait refusée comme « hors séquence ». À `synced`,
    // la différence envoyée la contient.
    this._pretAEnvoyer = false
    this._onDocUpdate = (update, origin) => {
      if (origin === this) return
      if (this.connected && this._pretAEnvoyer) {
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
    // « Voilà ce que j'ai » dès l'ouverture : le serveur ne renverra que le
    // reste. Dans l'URL plutôt qu'en premier message, pour que la réponse
    // ne dépende pas d'une course avec le chargement de la réplique.
    const sv = encodeURIComponent(toBase64(Y.encodeStateVector(this.ydoc)))
    return `${proto}//${location.host}/ws/${this.docId}?user=${encodeURIComponent(this.user.name)}&sv=${sv}`
  }

  _connect() {
    const ws = new WebSocket(this._wsUrl())
    ws.binaryType = 'arraybuffer'
    this._ws = ws
    let openedThisAttempt = false

    ws.addEventListener('open', () => {
      openedThisAttempt = true
      this.connected = true
      this._pretAEnvoyer = false
      this._reconnectDelay = 1000
      this._consecutiveFailedAttempts = 0
      this.likelyRejected = false
      this.dispatchEvent(new Event('status'))
      // Announce presence once connected.
      const update = encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])
      this._sendText(JSON.stringify({ type: 'awareness', data: toBase64(update) }))
      // Ce qui a été fait hors ligne part à la réception de `synced`, qui
      // porte le vecteur du serveur : seulement la différence (voir
      // _handleText). Avant le 29/09, c'était l'état entier du document à
      // chaque reconnexion — la cause des journaux de 100 Mo.
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
      this._pretAEnvoyer = false
      if (!openedThisAttempt) {
        this._consecutiveFailedAttempts += 1
        // 3 in a row without ever reaching 'open': treat as a likely
        // rejection (accès révoqué, document supprimé, etc.) rather than
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
    } else if (msg.type === 'synced') {
      // Le serveur a envoyé ce qui nous manquait : le document est complet.
      // À notre tour : ce qui lui manque, d'après le vecteur qu'il joint —
      // rien du tout dans le cas courant, nos modifications hors ligne
      // sinon. Un serveur ancien, sans vecteur, reçoit l'état entier si on
      // a des modifications en attente (toujours correct, juste lourd).
      let manquant = null
      try {
        manquant = typeof msg.sv === 'string' && msg.sv ? Y.encodeStateAsUpdate(this.ydoc, fromBase64(msg.sv)) : null
      } catch {
        manquant = null
      }
      if (manquant && manquant.length > 2) this._sendBinary(manquant)
      else if (!manquant && this.hasPendingLocalChanges) this._sendBinary(Y.encodeStateAsUpdate(this.ydoc))
      this._pretAEnvoyer = true
      if (this.hasPendingLocalChanges) {
        this.hasPendingLocalChanges = false
        this.dispatchEvent(new Event('status'))
      }
      // `synced` reste vrai ensuite : une reconnexion resynchronise, mais
      // on a déjà le document à l'écran, il n'y a plus de masque à lever.
      if (!this.synced) {
        this.synced = true
        this.dispatchEvent(new Event('synced'))
      }
    } else if (msg.type === 'refuse') {
      // Le serveur n'a pas accepté une opération de ce client (un lecteur
      // qui a touché au texte, en contournant l'interface) : l'état local
      // diverge de celui des autres. Le plus sûr est de le jeter et de
      // recharger — brutal, et réservé à un cas qu'un client honnête ne
      // rencontre jamais.
      this.dispatchEvent(new CustomEvent('refuse', { detail: { raison: msg.raison || '' } }))
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
