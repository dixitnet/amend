// Per-document "rooms": relays Yjs updates between connected clients and
// persists them, and relays ephemeral awareness (cursor/presence) messages
// without persisting them.
//
// Depuis le 29/09/2026 le serveur tient une **réplique** de chaque document
// ouvert (replique.js) : c'est elle qui sert l'état à l'arrivée, qui
// vérifie ce qu'un lecteur envoie, et qui compacte le journal.
//
// Wire protocol on the WebSocket, by frame type:
//   binary frame  -> a raw Yjs update (opaque bytes, persisted + relayed)
//   text frame    -> a JSON control message :
//                    { type: 'awareness', payload: <any> } (relayed as-is)
//                    { type: 'sync', sv: <base64> } (client → serveur :
//                    « voilà ce que j'ai », le serveur répond par la
//                    différence, en binaire. À l'ouverture, le client le dit
//                    plutôt dans l'URL, `?sv=<base64>`, pour que la réponse
//                    ne dépende d'aucune course ; un client ancien, sans
//                    l'un ni l'autre, reçoit l'état complet.)
//                    { type: 'synced', sv: <base64> } (serveur → client, une
//                    fois l'état envoyé, avec ce que le serveur a : le
//                    client renvoie alors seulement ce qui manque)
//                    { type: 'refuse', raison } (serveur → client : une
//                    opération n'a pas été acceptée ; le client recharge)

import { verifierLecteur as verifierLecteurDoc } from './replique.js'

/** Ce qu'un client peut faire relayer aux autres par une trame texte : sa
 * présence, et le nouveau titre s'il a le droit de renommer. Le reste
 * (`refuse`, `synced`, tout type inconnu) appartient au serveur et n'est
 * jamais relayé (audit du 10/10/2026, S6). */
const AWARENESS_MAX_CARACTERES = 64 * 1024
const TITRE_MAX_CARACTERES = 200
/** Messages gardés pendant le chargement de la réplique, par participant. */
const EN_ATTENTE_MAX_MESSAGES = 500
const EN_ATTENTE_MAX_OCTETS = 8 * 1024 * 1024

export class Rooms {
  constructor(storage, repliques) {
    this.storage = storage
    this.repliques = repliques
    /** @type {Map<string, Set<{conn: import('./ws.js').WebSocketConnection, user: string}>>} */
    this.rooms = new Map()
    /** La présence des agents invités (server/presenceAgents.js), posée
     * par server.js : un participant qui arrive la reçoit avec l'état. */
    this.presenceAgents = null
  }

  /**
   * `acces` : ce que cette personne peut faire — `{ capabilities, nom }`,
   * où `capabilities` vient de roles.js et `nom` est le nom de son compte
   * (celui que ses commentaires portent). Absent : tout est permis (les
   * outils et les tests qui ne s'occupent pas des rôles).
   */
  join(docId, conn, user, acces = null, { vecteur = null } = {}) {
    let members = this.rooms.get(docId)
    if (!members) {
      members = new Set()
      this.rooms.set(docId, members)
    }
    const member = { conn, user, acces, pret: false, enAttente: [] }
    members.add(member)

    // Les messages arrivés pendant le chargement de la réplique sont
    // gardés, dans l'ordre, et traités une fois prêt : l'annonce de présence
    // part dès l'ouverture, elle ne doit pas se perdre.
    member.octetsEnAttente = 0
    conn.on('message', (data, isBinary) => {
      if (!member.pret) {
        member.octetsEnAttente += data.length
        if (member.enAttente.length >= EN_ATTENTE_MAX_MESSAGES || member.octetsEnAttente > EN_ATTENTE_MAX_OCTETS) {
          member.enAttente = []
          conn.close(1009)
          return
        }
        member.enAttente.push([data, isBinary])
      } else this._onMessage(docId, member, data, isBinary)
    })
    conn.on('close', () => this._leave(docId, member))
    conn.on('error', () => this._leave(docId, member))

    member.chargement = this.repliques
      .obtenir(docId)
      .then(() => {
        if (!members.has(member)) return // parti pendant le chargement
        this.repliques.retenir(docId)
        member.retenu = true
        member.pret = true
        // Ce que le client a déjà : dans l'URL d'ouverture (`?sv=`, sans
        // course avec le chargement), ou dans un message `sync` arrivé
        // pendant le chargement. Sinon, tout.
        const messages = member.enAttente
        member.enAttente = []
        const sync = messages.find(([data, isBinary]) => !isBinary && estSync(data))
        this._envoyerEtat(docId, member, sync ? vecteurDe(sync[0]) : vecteur)
        for (const [data, isBinary] of messages) {
          if (!isBinary && estSync(data)) continue
          this._onMessage(docId, member, data, isBinary)
        }
      })
      .catch((err) => {
        console.error(`[rooms] impossible de charger ${docId} :`, err)
        try {
          conn.close()
        } catch {}
      })

    return member
  }

  /** L'état de la réplique — ou ce que le client n'a pas —, puis `synced`
   * avec le vecteur du serveur. */
  _envoyerEtat(docId, member, vecteurClient) {
    let etat
    try {
      etat = this.repliques.etat(docId, vecteurClient)
    } catch {
      etat = this.repliques.etat(docId)
    }
    if (etat && etat.length > 2) member.conn.send(Buffer.from(etat), { binary: true })
    const sv = this.repliques.vecteur(docId)
    member.conn.send(JSON.stringify({ type: 'synced', sv: sv ? Buffer.from(sv).toString('base64') : null }))
    if (this.presenceAgents) for (const message of this.presenceAgents.messagesPour(docId)) member.conn.send(message)
  }

  /** Un message de contrôle (texte) à toute la salle, sans expéditeur. */
  diffuserTexte(docId, texte) {
    this._broadcast(docId, null, texte, { binary: false })
  }

  _onMessage(docId, member, data, isBinary) {
    if (isBinary) {
      const update = Buffer.isBuffer(data) ? data : Buffer.from(data)
      const acces = member.acces
      // Un lecteur : commentaires seulement, et les siens (replique.js).
      if (acces && acces.capabilities && !acces.capabilities.canProposeChanges && !acces.capabilities.canEditFreely) {
        const r = this.repliques.repliques.get(docId)
        const verdict = r
          ? verifierLecteurDoc(r.doc, update, acces.nom, acces.id || null)
          : { ok: false, raison: 'réplique absente' }
        if (!verdict.ok) {
          member.conn.send(JSON.stringify({ type: 'refuse', raison: verdict.raison }))
          return
        }
      }
      const verdict = this.repliques.appliquer(docId, update)
      if (!verdict.ok) {
        // Illisible ou hors séquence : ni persistée ni relayée. Le client
        // est prévenu quand il peut y faire quelque chose (recharger).
        if (/hors séquence/.test(verdict.raison))
          member.conn.send(JSON.stringify({ type: 'refuse', raison: verdict.raison }))
        return
      }
      this.storage.appendUpdate(docId, update)
      this._broadcast(docId, member, update, { binary: true })
      return
    }
    // Les trames texte sont des messages de contrôle JSON. Seuls deux types
    // sont relayés aux autres (jamais conservés) : la présence, et le titre
    // pour qui peut renommer. Le serveur reconstruit le message au lieu de
    // relayer l'octet reçu : rien d'autre ne passe.
    let msg
    try {
      msg = JSON.parse(data.toString('utf8'))
    } catch {
      return // ignore malformed control messages
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'sync') {
      // Un `sync` après le chargement (reconnexion sur la même socket ne
      // se produit pas ; mais un client peut redemander) : on répond.
      this._envoyerEtat(docId, member, vecteurDe(data))
      return
    }
    if (msg.type === 'awareness' && typeof msg.data === 'string' && msg.data.length <= AWARENESS_MAX_CARACTERES) {
      this._broadcast(docId, member, JSON.stringify({ type: 'awareness', data: msg.data }), { binary: false })
      return
    }
    if (msg.type === 'title' && typeof msg.title === 'string') {
      const acces = member.acces
      // Sans `acces` (outils, tests) tout est permis, comme pour le reste.
      if (acces && acces.capabilities && !acces.capabilities.canManageDocument) return
      this._broadcast(
        docId,
        member,
        JSON.stringify({ type: 'title', title: msg.title.slice(0, TITRE_MAX_CARACTERES) }),
        { binary: false }
      )
    }
  }

  _broadcast(docId, from, data, opts) {
    const members = this.rooms.get(docId)
    if (!members) return
    for (const member of members) {
      if (member === from || !member.pret) continue
      member.conn.send(data, opts)
    }
  }

  /** Coupe les connexions de cette adresse sur ce document — révocation,
   * départ, suppression : les droits d'une socket sont ceux du moment où
   * elle s'est ouverte, il faut donc la refermer (audit S7, A10). Le client
   * est prévenu (`refuse`) pour qu'il recharge et voie son nouvel état.
   * Sans `email`, toute la salle : le document n'existe plus. */
  expulser(docId, email = null, raison = 'accès modifié') {
    const members = this.rooms.get(docId)
    if (!members) return 0
    let n = 0
    for (const member of [...members]) {
      if (email && !(member.acces && member.acces.email === email)) continue
      n++
      try {
        member.conn.send(JSON.stringify({ type: 'refuse', raison }))
        member.conn.close(1008)
      } catch {
        // déjà partie
      }
    }
    return n
  }

  /** Coupe toutes les connexions d'une adresse, dans tous les documents
   * (« se déconnecter partout », S8). Même geste que `expulser`, partout. */
  expulserPartout(email) {
    let n = 0
    for (const docId of [...this.rooms.keys()]) n += this.expulser(docId, email)
    return n
  }

  _leave(docId, member) {
    const members = this.rooms.get(docId)
    if (!members) return
    if (!members.has(member)) return
    members.delete(member)
    if (member.retenu) {
      member.retenu = false
      this.repliques.relacher(docId)
    }
    if (members.size === 0) this.rooms.delete(docId)
  }

  /** Lit le document depuis le serveur (agents invités) : `fn(ydoc)` sur
   * la réplique, retenue le temps de la lecture. */
  async lireDocument(docId, fn) {
    await this.repliques.obtenir(docId)
    this.repliques.retenir(docId)
    try {
      return fn(this.repliques.repliques.get(docId).doc)
    } finally {
      this.repliques.relacher(docId)
    }
  }

  /** Écrit dans le document depuis le serveur : `fn(ydoc)` modifie la
   * réplique ; l'opération est persistée puis relayée à tous les
   * participants connectés, exactement comme si un client l'avait
   * envoyée. */
  async ecrireDocument(docId, fn) {
    await this.repliques.obtenir(docId)
    this.repliques.retenir(docId)
    try {
      const { update, resultat, erreur } = this.repliques.ecrire(docId, fn)
      if (update) {
        const octets = Buffer.from(update)
        this.storage.appendUpdate(docId, octets)
        this._broadcast(docId, null, octets, { binary: true })
      }
      if (erreur) throw erreur
      return resultat
    } finally {
      this.repliques.relacher(docId)
    }
  }

  /** Toutes les connexions de toutes les salles (sonde du banc d'essai : voir
   * si quelqu'un d'autre est là). */
  totalConnexions() {
    let n = 0
    for (const membres of this.rooms.values()) n += membres.size
    return n
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

function estSync(data) {
  try {
    const m = JSON.parse(data.toString('utf8'))
    return !!(m && m.type === 'sync')
  } catch {
    return false
  }
}

function vecteurDe(data) {
  try {
    const m = JSON.parse(data.toString('utf8'))
    return typeof m.sv === 'string' && m.sv ? Buffer.from(m.sv, 'base64') : null
  } catch {
    return null
  }
}
