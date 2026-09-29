// Le serveur tient le document (29/09/2026, claude/etude-roles-serveur.md
// et claude/evaluation-replique-serveur.md).
//
// Jusqu'ici le serveur ne savait pas lire une opération Yjs : il rejouait
// le journal entier à chaque connexion, laissait un navigateur compacter,
// et recevait à chaque reconnexion l'état complet d'un client parce qu'il
// ne pouvait pas dire ce qui lui manquait. C'était l'invariant fondateur —
// « zéro dépendance côté serveur » — et il a coûté quatre dettes.
//
// Une **réplique** par document ouvert : un Y.Doc en mémoire, chargé
// depuis le journal à la première connexion, mis à jour à chaque opération
// reçue, libéré quelques minutes après le dernier départ. Avec elle :
//
//   - un client qui arrive reçoit **un instantané** (ou la différence avec
//     ce qu'il annonce avoir), pas le journal ;
//   - un client qui revient n'envoie que ce qui manque au serveur ;
//   - le compactage est une écriture de l'état, sans transfert ni course ;
//   - un lecteur ne peut toucher qu'aux commentaires — vérifié ici, avant
//     d'appliquer, de persister ou de relayer.
//
// Mesuré (evaluation-replique-serveur.md) : un document ordinaire pèse
// ~1 Mo en mémoire, un livre 5 Mo ; appliquer une frappe coûte des
// centièmes de milliseconde. Le seul coût réel est le rejeu d'un vieux
// journal jamais compacté (14 s pour 100 Mo) : il se fait dans un worker,
// une fois, puis le journal est compacté.

import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'

/** Délai avant de libérer la réplique d'une salle vide : une reconnexion
 * dans la minute ne doit pas recharger le journal. */
const DELAI_LIBERATION_MS = 5 * 60 * 1000
/** Au-delà, les répliques des salles vides sont libérées tout de suite. */
const MAX_REPLIQUES = 20
/** Un journal plus lourd que ça se rejoue dans un worker : un rejeu de 100
 * Mo bloque le fil principal quatorze secondes. */
const SEUIL_WORKER_OCTETS = 2 * 1024 * 1024
/** Le compactage se déclenche un peu après la dernière frappe, pas dessus. */
const DELAI_COMPACTAGE_MS = 5000

const NOM_TEXTE = 'prosemirror-content'
const NOM_COMMENTAIRES = 'comments'

export class Repliques {
  constructor(storage, { versions = null, delaiLiberationMs = DELAI_LIBERATION_MS, max = MAX_REPLIQUES, seuilWorkerOctets = SEUIL_WORKER_OCTETS, delaiCompactageMs = DELAI_COMPACTAGE_MS } = {}) {
    this.storage = storage
    this.versions = versions
    this.delaiLiberationMs = delaiLiberationMs
    this.max = max
    this.seuilWorkerOctets = seuilWorkerOctets
    this.delaiCompactageMs = delaiCompactageMs
    /** @type {Map<string, {doc: Y.Doc, refs: number, liberation: any, ops: number, octets: number, compactage: any, enCompactage: Promise|null}>} */
    this.repliques = new Map()
    /** Chargements en cours : deux connexions simultanées n'en font qu'un. */
    this.chargements = new Map()
  }

  /** La réplique d'un document, chargée s'il le faut. À appeler à chaque
   * connexion (`retenir`), et `relacher` au départ. */
  async obtenir(id) {
    const existante = this.repliques.get(id)
    if (existante) return existante
    let chargement = this.chargements.get(id)
    if (!chargement) {
      chargement = this._charger(id).finally(() => this.chargements.delete(id))
      this.chargements.set(id, chargement)
    }
    return chargement
  }

  async _charger(id) {
    const info = this.storage.journalInfo(id)
    const octets = info.octets || 0
    const doc = new Y.Doc()
    if (octets > this.seuilWorkerOctets) {
      // Un gros journal : rejoué dans un worker, qui renvoie l'état fusionné.
      const instantane = await rejouerDansUnWorker(this.storage._logPath(id))
      Y.applyUpdate(doc, instantane, 'journal')
      // Ce qui est encore en tampon n'était pas dans le fichier.
      for (const op of this.storage._pending.get(id) || []) appliquerSansPlanter(doc, op)
    } else {
      for (const op of this.storage.readUpdates(id)) appliquerSansPlanter(doc, op)
    }
    const replique = {
      doc,
      refs: 0,
      liberation: null,
      // Ce que le journal a accumulé depuis son dernier compactage — le
      // déclencheur du prochain, tenu en mémoire pour ne pas relire le
      // fichier à chaque frappe.
      ops: info.operations || 0,
      octets,
      compactage: null,
      enCompactage: null,
    }
    this.repliques.set(id, replique)
    this._elaguer(id)
    // Un journal trop lourd au chargement : on compacte tout de suite,
    // pour ne plus jamais avoir à le rejouer.
    if (this._aCompacter(replique)) this._planifierCompactage(id, 0)
    return replique
  }

  retenir(id) {
    const r = this.repliques.get(id)
    if (!r) return
    r.refs++
    if (r.liberation) {
      clearTimeout(r.liberation)
      r.liberation = null
    }
  }

  relacher(id) {
    const r = this.repliques.get(id)
    if (!r) return
    r.refs = Math.max(0, r.refs - 1)
    if (r.refs === 0) {
      // La salle se vide : c'est le bon moment pour compacter ce qui doit
      // l'être, puis libérer un peu plus tard.
      if (this._aCompacter(r)) this._planifierCompactage(id, 0)
      r.liberation = setTimeout(() => this._liberer(id), this.delaiLiberationMs)
      r.liberation.unref?.()
    }
  }

  _liberer(id) {
    const r = this.repliques.get(id)
    if (!r || r.refs > 0) return
    if (r.compactage) clearTimeout(r.compactage)
    r.doc.destroy()
    this.repliques.delete(id)
  }

  /** Au-delà du plafond, les salles vides sont libérées sans attendre —
   * sauf `sauf`, celle qu'on vient de charger et que personne ne retient
   * encore. */
  _elaguer(sauf = null) {
    if (this.repliques.size <= this.max) return
    for (const [id, r] of this.repliques) {
      if (id !== sauf && r.refs === 0 && !r.enCompactage) {
        if (r.liberation) clearTimeout(r.liberation)
        this._liberer(id)
        if (this.repliques.size <= this.max) return
      }
    }
  }

  /** L'état de la réplique — ou la part que `vecteur` (le vecteur d'état
   * d'un client) ne couvre pas. */
  etat(id, vecteur = null) {
    const r = this.repliques.get(id)
    if (!r) return null
    return vecteur ? Y.encodeStateAsUpdate(r.doc, vecteur) : Y.encodeStateAsUpdate(r.doc)
  }

  vecteur(id) {
    const r = this.repliques.get(id)
    return r ? Y.encodeStateVector(r.doc) : null
  }

  /** Applique une opération reçue. `{ ok: false, raison }` si elle n'est
   * pas lisible, ou si elle s'appuie sur des opérations que le serveur n'a
   * jamais vues (« hors séquence ») : Yjs la garderait en attente sans
   * l'intégrer. Ça n'arrive qu'à un client dont une opération précédente a
   * été refusée — ses horloges ont avancé sans le serveur — ou à un client
   * défectueux ; dans les deux cas il doit recharger. Rien de refusé n'est
   * persisté ni relayé. */
  appliquer(id, update) {
    const r = this.repliques.get(id)
    if (!r) return { ok: false, raison: 'réplique absente' }
    if (!appliquerSansPlanter(r.doc, update)) return { ok: false, raison: 'opération illisible' }
    if (r.doc.store.pendingStructs || r.doc.store.pendingDs) {
      // On ne garde pas en attente ce qu'on refuse : le client va recharger
      // et renvoyer la différence complète.
      r.doc.store.pendingStructs = null
      r.doc.store.pendingDs = null
      return { ok: false, raison: 'opération hors séquence : le document doit être rechargé' }
    }
    r.ops++
    r.octets += update.length
    if (this._aCompacter(r)) this._planifierCompactage(id, this.delaiCompactageMs)
    return { ok: true }
  }

  _aCompacter(r) {
    return r.ops > this.storage.compactionTrigger || r.octets > this.storage.maxUncompactedBytes
  }

  _planifierCompactage(id, delai) {
    const r = this.repliques.get(id)
    if (!r || r.compactage || r.enCompactage) return
    r.compactage = setTimeout(() => {
      r.compactage = null
      this.compacter(id).catch((err) => console.error(`[replique] compactage de ${id} :`, err.message))
    }, delai)
    r.compactage.unref?.()
  }

  /** Remplace tout le journal par l'état de la réplique. Une version est
   * enregistrée d'abord (c'est ce que le compactage allait effacer). Les
   * opérations en tampon sont écrites avant, dans l'ordre. */
  async compacter(id) {
    const r = this.repliques.get(id)
    if (!r) return null
    if (r.enCompactage) return r.enCompactage
    const travail = (async () => {
      await this.storage._flush(id)
      const instantane = Buffer.from(Y.encodeStateAsUpdate(r.doc))
      const ts = Date.now()
      if (this.versions) {
        try {
          this.versions.enregistrer(id, instantane, { ts, origine: 'compactage' })
        } catch (err) {
          console.error(`[versions] échec d'enregistrement pour ${id} :`, err.message)
        }
      }
      const resultat = await this.storage.compactDoc(id, { baseSnapshot: instantane, baseTs: ts, tout: true })
      r.ops = 1
      r.octets = instantane.length
      return resultat
    })()
    r.enCompactage = travail.finally(() => {
      r.enCompactage = null
    })
    return r.enCompactage
  }

  /** Photo pour le back-office. */
  snapshot() {
    return [...this.repliques].map(([docId, r]) => ({ docId, connectes: r.refs, ops: r.ops, octets: r.octets }))
  }

  /** Libère tout — pour les tests et l'arrêt. */
  fermer() {
    for (const [id, r] of this.repliques) {
      if (r.liberation) clearTimeout(r.liberation)
      if (r.compactage) clearTimeout(r.compactage)
      r.doc.destroy()
      this.repliques.delete(id)
    }
  }
}

/** Applique une opération ; `false` si Yjs la refuse (octets corrompus). Un
 * journal qui en contient une n'est pas perdu pour autant : on saute. */
function appliquerSansPlanter(doc, op) {
  try {
    Y.applyUpdate(doc, op, 'journal')
    return true
  } catch (err) {
    console.error('[replique] opération illisible ignorée :', err.message)
    return false
  }
}

function rejouerDansUnWorker(chemin) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(new URL('./repliqueWorker.js', import.meta.url)), { workerData: { chemin } })
    worker.once('message', (m) => resolve(Buffer.from(m)))
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker de rejeu terminé avec le code ${code}`))
    })
  })
}

// --- Ce qu'une opération touche ------------------------------------------

/** Le nom, dans `doc.share`, du type racine qui contient `type`. */
function nomRacine(doc, type) {
  let cur = type
  while (cur && cur._item) cur = cur._item.parent
  for (const [nom, t] of doc.share) if (t === cur) return nom
  return null
}

function dansLeStore(doc, id) {
  try {
    if (!doc.store.clients.has(id.client)) return null
    return Y.getItem(doc.store, id) || null
  } catch {
    return null
  }
}

/**
 * Ce qu'une opération, **pas encore appliquée**, insère et supprime, par
 * type racine : `{ inserees: Set<nom>, supprimees: Set<nom>, contenus }`.
 * `'?'` quand on ne sait pas — à traiter comme un refus. Les structures
 * déjà connues de la réplique et les suppressions déjà faites ne comptent
 * pas : une différence renvoyée par un client (encodeStateAsUpdate avec un
 * vecteur d'état) porte toujours l'ensemble complet des suppressions.
 */
export function racinesTouchees(doc, update) {
  const { structs, ds } = Y.decodeUpdate(update)
  const propres = structs.filter((s) => s instanceof Y.Item && Y.getState(doc.store, s.id.client) <= s.id.clock)
  const dansMaj = (id) => propres.find((s) => s.id.client === id.client && id.clock >= s.id.clock && id.clock < s.id.clock + s.length)
  const memo = new Map()
  function racineDe(s, prof = 0) {
    if (memo.has(s)) return memo.get(s)
    if (prof > 50) return '?'
    let r = '?'
    if (typeof s.parent === 'string') r = s.parent
    else {
      const refs = s.parent instanceof Y.ID ? [s.parent] : [s.origin, s.rightOrigin].filter(Boolean)
      for (const ref of refs) {
        const local = dansMaj(ref)
        if (local) {
          r = racineDe(local, prof + 1)
          break
        }
        const it = dansLeStore(doc, ref)
        if (it) {
          r = s.parent instanceof Y.ID && it.content instanceof Y.ContentType ? nomRacine(doc, it.content.type) : nomRacine(doc, it.parent)
          break
        }
      }
    }
    memo.set(s, r)
    return r
  }
  const inserees = new Set()
  const contenus = []
  for (const s of propres) {
    const r = racineDe(s)
    inserees.add(r)
    if (s.content instanceof Y.ContentAny) contenus.push({ racine: r, valeurs: s.content.arr })
  }
  const supprimees = new Set()
  const supprimes = []
  ds.clients.forEach((ranges, cid) => {
    for (const range of ranges) {
      for (let c = range.clock; c < range.clock + range.len; ) {
        const it = dansLeStore(doc, Y.createID(cid, c))
        if (!it) {
          // Inconnue de la réplique : si elle est dans la mise à jour
          // elle-même (insérée puis supprimée), elle ne touche rien de
          // plus ; sinon on ne sait pas.
          supprimees.add(dansMaj(Y.createID(cid, c)) ? null : '?')
          c++
          continue
        }
        if (!it.deleted) {
          supprimees.add(nomRacine(doc, it.parent))
          if (it.content instanceof Y.ContentAny) supprimes.push({ racine: nomRacine(doc, it.parent), valeurs: it.content.arr })
        }
        c = it.id.clock + it.length
      }
    }
  })
  supprimees.delete(null)
  return { inserees, supprimees, contenus, supprimes }
}

/**
 * Un lecteur ne touche qu'aux commentaires, et qu'aux siens (le nom du
 * compte, celui que le client écrit dans `author`). `{ ok }` ou
 * `{ ok: false, raison }`.
 */
export function verifierLecteur(doc, update, nom) {
  let touche
  try {
    touche = racinesTouchees(doc, update)
  } catch (err) {
    return { ok: false, raison: `opération illisible (${err.message})` }
  }
  for (const r of [...touche.inserees, ...touche.supprimees]) {
    if (r !== NOM_COMMENTAIRES) return { ok: false, raison: r === NOM_TEXTE ? 'un lecteur ne modifie pas le texte' : 'modification hors des commentaires' }
  }
  for (const { valeurs } of [...touche.contenus, ...touche.supprimes]) {
    for (const v of valeurs) {
      if (v && typeof v === 'object' && 'author' in v && v.author !== nom) {
        return { ok: false, raison: "un lecteur ne touche qu'à ses propres commentaires" }
      }
    }
  }
  return { ok: true }
}
