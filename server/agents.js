// Les agents invités sur un document (29/09/2026,
// claude/etude-inviter-claude.md).
//
// Un agent n'est **pas un compte** : c'est une adresse. Celui qui la connaît
// lit et écrit, dans les limites de son rôle, jusqu'à l'expiration ou la
// révocation — comme un lien de partage, avec trois différences qui comptent :
//
//   - elle ne mène qu'à **un** document, jamais aux autres ;
//   - elle expire (sept jours par défaut) et se révoque d'un mot ;
//   - elle ne vaut que tant que la personne qui l'a créée garde le droit
//     d'inviter sur ce document.
//
// Le secret est tiré au hasard (128 bits), montré **une seule fois** à la
// création, et n'est jamais stocké : on ne garde que son empreinte SHA-256.
// Il ne figure dans aucun journal.
//
// Fichier : data/agents.json, écrit de façon atomique (temporaire puis
// rename), lisible par le seul compte du service.

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { capabilities } from './roles.js'

/** Les rôles qu'un agent peut porter. Jamais éditeur : un agent propose, un
 * humain décide. */
export const ROLES_AGENT = ['lecteur', 'correcteur']

export const DUREE_DEFAUT_JOURS = 7
export const DUREE_MAX_JOURS = 90
const JOUR_MS = 24 * 60 * 60 * 1000
/** Une entrée révoquée ou expirée reste ce temps dans le fichier, pour
 * qu'on puisse dire pourquoi une adresse ne marche plus. */
const CONSERVATION_MS = 30 * JOUR_MS
const FORME_SECRET = /^[A-Za-z0-9_-]{22}$/

const ECHECS_MAX = 30
const ECHECS_FENETRE_MS = 10 * 60_000

export function empreinte(secret) {
  return createHash('sha256').update(secret).digest('hex')
}

export class Agents {
  constructor(dataDir, { maintenant = () => Date.now() } = {}) {
    this.chemin = join(dataDir, 'agents.json')
    this.maintenant = maintenant
    /** Échecs de découverte de l'adresse, par origine — même principe que
     * pour les pages publiées : deviner ne doit pas être gratuit. */
    this.echecs = new Map()
    this._derniereNote = new Map()
    this.signature = null
    this.agents = this._lire()
    this._purger()
  }

  /** Le fichier est aussi écrit par `tools/inviter-claude.js`, lancé à la
   * main pendant que le serveur tourne : avant chaque lecture ou écriture,
   * on relit s'il a changé. La fenêtre de course (deux écritures dans la
   * même milliseconde) est connue et acceptée : une invitation perdue se
   * recrée, une révocation perdue se refait. */
  _synchroniser() {
    const signature = this._signature()
    if (signature !== this.signature) this.agents = this._lire()
  }

  _signature() {
    try {
      const st = statSync(this.chemin)
      return `${st.mtimeMs}:${st.size}`
    } catch {
      return 'absent'
    }
  }

  _lire() {
    this.signature = this._signature()
    if (!existsSync(this.chemin)) return []
    try {
      const donnees = JSON.parse(readFileSync(this.chemin, 'utf8'))
      return Array.isArray(donnees.agents) ? donnees.agents : []
    } catch (err) {
      // Un fichier illisible ne doit pas être écrasé en silence par le
      // prochain enregistrement : on le met de côté.
      console.error('[agents] agents.json illisible, mis de côté :', err.message)
      try {
        renameSync(this.chemin, `${this.chemin}.illisible-${Date.now()}`)
      } catch {}
      return []
    }
  }

  _ecrire() {
    const tmp = `${this.chemin}.tmp`
    writeFileSync(tmp, JSON.stringify({ agents: this.agents }, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.chemin)
    this.signature = this._signature()
  }

  _purger() {
    const limite = this.maintenant() - CONSERVATION_MS
    const avant = this.agents.length
    this.agents = this.agents.filter((a) => (a.revokedAt || a.expiresAt) > limite)
    if (this.agents.length !== avant) this._ecrire()
  }

  /**
   * Crée une invitation. `{ ok, id, secret, expiresAt }` — le secret n'est
   * rendu qu'ici — ou `{ ok: false, raison }`.
   */
  inviter({ docId, role, jours = DUREE_DEFAUT_JOURS, par, nom = 'Claude' }) {
    this._synchroniser()
    if (!docId) return { ok: false, raison: 'document manquant' }
    if (!ROLES_AGENT.includes(role)) return { ok: false, raison: `rôle « ${role} » refusé pour un agent (${ROLES_AGENT.join(', ')})` }
    if (!par) return { ok: false, raison: "la personne qui invite est requise : l'accès de l'agent en dépend" }
    const nombre = Number(jours)
    if (!Number.isFinite(nombre) || nombre <= 0 || nombre > DUREE_MAX_JOURS) {
      return { ok: false, raison: `durée invalide (de 1 à ${DUREE_MAX_JOURS} jours)` }
    }
    const nomPropre = String(nom).trim().slice(0, 40)
    if (!nomPropre) return { ok: false, raison: "nom d'agent vide" }
    const secret = randomBytes(16).toString('base64url')
    const id = `ag-${randomBytes(4).toString('hex')}`
    const maintenant = this.maintenant()
    const entree = {
      id,
      docId,
      role,
      nom: nomPropre,
      par,
      secretHash: empreinte(secret),
      grantedAt: maintenant,
      expiresAt: maintenant + Math.round(nombre * JOUR_MS),
    }
    this.agents.push(entree)
    this._ecrire()
    return { ok: true, id, secret, expiresAt: entree.expiresAt }
  }

  /** L'entrée que ce secret ouvre, ou null — sans dire pourquoi : secret
   * inconnu, expiré, révoqué, ce sont trois fois la même réponse. Ne juge
   * pas du document ni de la personne qui a invité : voir `acces`. */
  trouver(secret) {
    if (typeof secret !== 'string' || !FORME_SECRET.test(secret)) return null
    this._synchroniser()
    const h = empreinte(secret)
    const entree = this.agents.find((a) => a.secretHash === h)
    if (!entree || entree.revokedAt || entree.expiresAt <= this.maintenant()) return null
    return entree
  }

  /**
   * L'accès d'un secret : `{ agent, capabilities }`, ou null. Vaut tant que
   * le document existe et que la personne qui a invité peut encore inviter
   * dessus — retirer ses droits à l'invitant coupe l'agent, sans rien à
   * faire de plus.
   */
  acces(secret, storage) {
    const agent = this.trouver(secret)
    if (!agent || !this.verifier(agent, storage)) return null
    return { agent, capabilities: capabilities(agent.role) }
  }

  /** L'entrée vaut encore : ni expirée ni révoquée, son document existe, et
   * celui qui a invité peut toujours inviter. À revérifier à chaque appel :
   * une session ouverte ne prolonge pas une invitation. */
  verifier(entree, storage) {
    this._synchroniser()
    const agent = this.agents.find((a) => a.id === entree.id)
    if (!agent) return false
    if (agent.revokedAt || agent.expiresAt <= this.maintenant()) return false
    if (!storage.getDoc(agent.docId)) return false
    return capabilities(storage.roleFor(agent.docId, agent.par)).canInvite
  }

  revoquer(id) {
    this._synchroniser()
    const entree = this.agents.find((a) => a.id === id && !a.revokedAt)
    if (!entree) return false
    entree.revokedAt = this.maintenant()
    this._ecrire()
    return true
  }

  /** À la suppression d'un document : ses agents n'ont plus rien à lire. */
  revoquerDocument(docId) {
    this._synchroniser()
    let n = 0
    for (const a of this.agents) {
      if (a.docId === docId && !a.revokedAt) {
        a.revokedAt = this.maintenant()
        n++
      }
    }
    if (n) this._ecrire()
    return n
  }

  /** Repousse l'expiration de `jours` à partir de **maintenant** (pas de
   * l'ancienne échéance : prolonger une invitation périmée la réveille). */
  prolonger(id, jours = DUREE_DEFAUT_JOURS) {
    this._synchroniser()
    const nombre = Number(jours)
    if (!Number.isFinite(nombre) || nombre <= 0 || nombre > DUREE_MAX_JOURS) return null
    const entree = this.agents.find((a) => a.id === id && !a.revokedAt)
    if (!entree) return null
    entree.expiresAt = this.maintenant() + Math.round(nombre * JOUR_MS)
    this._ecrire()
    return entree.expiresAt
  }

  /** Ce qu'on peut montrer : jamais le secret, jamais son empreinte. */
  lister(docId = null) {
    this._synchroniser()
    const maintenant = this.maintenant()
    return this.agents
      .filter((a) => !docId || a.docId === docId)
      .map((a) => ({
        id: a.id,
        docId: a.docId,
        role: a.role,
        nom: a.nom,
        par: a.par,
        grantedAt: a.grantedAt,
        expiresAt: a.expiresAt,
        dernierUsage: a.dernierUsage || null,
        etat: a.revokedAt ? 'révoquée' : a.expiresAt <= maintenant ? 'expirée' : 'active',
      }))
  }

  /** Au plus une écriture par minute et par agent : la date du dernier
   * usage sert à repérer une adresse qui n'est plus utilisée, pas à tenir
   * un journal. */
  noterUsage(id) {
    const maintenant = this.maintenant()
    if (maintenant - (this._derniereNote.get(id) || 0) < 60_000) return
    this._derniereNote.set(id, maintenant)
    this._synchroniser()
    const entree = this.agents.find((a) => a.id === id)
    if (!entree) return
    entree.dernierUsage = maintenant
    try {
      this._ecrire()
    } catch {
      // un usage non noté ne doit jamais faire échouer une lecture
    }
  }

  // --- Limitation des essais ----------------------------------------------

  /** Vrai si cette origine a trop échoué récemment. On ne compte que les
   * adresses qui ne mènent nulle part. */
  bloque(origine) {
    const maintenant = this.maintenant()
    const recents = (this.echecs.get(origine) || []).filter((t) => maintenant - t < ECHECS_FENETRE_MS)
    this.echecs.set(origine, recents)
    return recents.length >= ECHECS_MAX
  }

  noterEchec(origine) {
    const maintenant = this.maintenant()
    const recents = (this.echecs.get(origine) || []).filter((t) => maintenant - t < ECHECS_FENETRE_MS)
    recents.push(maintenant)
    this.echecs.set(origine, recents)
    if (this.echecs.size > 5000) {
      for (const [cle, v] of this.echecs) if (!v.some((t) => maintenant - t < ECHECS_FENETRE_MS)) this.echecs.delete(cle)
    }
  }
}
