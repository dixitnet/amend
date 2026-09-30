// La présence de Claude dans un document (30/09/2026, claude/etude-inviter-
// claude.md §4.4).
//
// Un connecteur n'a pas de connexion permanente : Claude appelle un outil,
// la réponse revient, c'est fini. Pour que « Claude (pour Sylvain) » se voie
// dans la barre des participants et par un curseur dans le texte, le
// serveur fabrique lui-même la présence — la même awareness Yjs que les
// navigateurs échangent, relayée dans la salle du document :
//
//   - un appel d'outil la pose ou la rafraîchit, avec un curseur au dernier
//     bloc touché quand l'outil en désigne un ;
//   - tant que le dernier appel date de moins de deux minutes, le serveur la
//     renouvelle toutes les dix secondes (les navigateurs oublient un état
//     qu'on ne renouvelle pas en trente) ;
//   - passé ce délai, ou à la révocation de l'invitation, il la retire.
//
// Rien de tout cela n'est écrit dans le document ni sur le disque.

import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'

export const PRESENCE_DUREE_MS = 2 * 60_000
const PAS_MS = 10_000

const enBase64 = (octets) => Buffer.from(octets).toString('base64')

export class PresenceAgents {
  /**
   * `rooms` : ce qui sait diffuser un message texte à une salle
   * (`diffuserTexte(docId, texte)`).
   */
  constructor(rooms, { maintenant = () => Date.now(), duree = PRESENCE_DUREE_MS, pas = PAS_MS } = {}) {
    this.rooms = rooms
    this.maintenant = maintenant
    this.duree = duree
    /** @type {Map<string, {docId: string, nom: string, couleur: string, aw: Awareness, dernier: number, ancre: any}>} */
    this.entrees = new Map()
    this.minuteur = setInterval(() => this._tic(), pas)
    if (this.minuteur.unref) this.minuteur.unref()
  }

  /** Un appel d'outil vient d'avoir lieu. `ancre` : une position relative
   * Yjs (JSON) où poser le curseur, ou rien pour laisser le précédent. */
  signaler(agent, { ancre = null, couleur } = {}) {
    let e = this.entrees.get(agent.id)
    if (!e) {
      const aw = new Awareness(new Y.Doc())
      // Awareness renouvelle son propre état dans un intervalle : il ne doit
      // pas retenir le processus.
      if (aw._checkInterval && aw._checkInterval.unref) aw._checkInterval.unref()
      e = { docId: agent.docId, nom: agent.nom, couleur, aw, dernier: 0, ancre: null }
      this.entrees.set(agent.id, e)
    }
    e.dernier = this.maintenant()
    if (ancre) e.ancre = ancre
    this._diffuser(e)
  }

  _etat(e) {
    const etat = { user: { name: e.nom, color: e.couleur }, agent: true }
    if (e.ancre) etat.cursor = { anchor: e.ancre, head: e.ancre }
    return etat
  }

  _message(e) {
    return JSON.stringify({ type: 'awareness', data: enBase64(encodeAwarenessUpdate(e.aw, [e.aw.clientID])) })
  }

  _diffuser(e) {
    e.aw.setLocalState(this._etat(e))
    this.rooms.diffuserTexte(e.docId, this._message(e))
  }

  /** Ce qu'un participant qui arrive doit recevoir pour voir les agents
   * déjà là (sans attendre le prochain renouvellement). */
  messagesPour(docId) {
    const messages = []
    for (const e of this.entrees.values()) if (e.docId === docId) messages.push(this._message(e))
    return messages
  }

  /** L'agent n'est plus là : les navigateurs le retirent aussitôt. */
  retirer(agentId) {
    const e = this.entrees.get(agentId)
    if (!e) return
    this.entrees.delete(agentId)
    e.aw.setLocalState(null)
    this.rooms.diffuserTexte(e.docId, this._message(e))
    e.aw.destroy()
  }

  _tic() {
    const maintenant = this.maintenant()
    for (const [id, e] of [...this.entrees]) {
      if (maintenant - e.dernier > this.duree) this.retirer(id)
      else this._diffuser(e)
    }
  }

  arreter() {
    clearInterval(this.minuteur)
    for (const id of [...this.entrees.keys()]) this.retirer(id)
  }
}
