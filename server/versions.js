// Les versions enregistrées d'un document (23/09/2026, voir
// claude/conception-compactage-versions.md).
//
// Pourquoi un fichier par version, hors du journal. L'historique
// d'aujourd'hui reconstruit une version passée en rejouant les *n*
// premières opérations du journal — et le compactage remplace justement ces
// *n* opérations par un instantané fusionné. Les deux mécanismes sont donc
// antagonistes : compacter, c'est effacer le passé. Tant que la mémoire du
// document vit dans le journal, elle sera détruite par ce qui empêche le
// journal de grossir.
//
// Une version devient donc un **fichier à part**, que rien ne compacte :
// `data/versions/<id>/<horodatage>.bin`, un instantané Yjs complet, écrit
// une fois et plus jamais touché.
//
// Trois origines, un seul format :
//   - 'compactage' : **avant chaque compactage** (gratuit — l'instantané est
//     déjà calculé pour compacter, il suffit de ne plus le jeter) ;
//   - 'session' : quand la dernière personne quitte un document modifié ;
//   - 'nommee' : une personne a dit « garde celle-ci » (11/10/2026).
// Les deux premières sont automatiques et s'amincissent avec le temps
// (`aSupprimer`) ; une version qui porte un nom n'est jamais supprimée par le
// serveur, quelle que soit son origine.
//
// Comme partout ailleurs ici, le serveur ne lit jamais le contenu : il
// écrit des octets et il les rend.

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, rmSync } from 'node:fs'
import { ecrireAtomique } from './fichiers.js'
import { join } from 'node:path'

/** Un horodatage tient lieu de nom de fichier : il est unique en pratique,
 * il trie naturellement, et il évite d'avoir à tenir un index à jour — un
 * index est une deuxième vérité, donc une occasion de diverger.
 *
 * Des chiffres, sans longueur imposée : exiger treize chiffres — la taille
 * d'un horodatage en millisecondes — serait inscrire dans une expression
 * régulière une hypothèse dont rien n'a besoin. */
const NOM = /^(\d+)\.bin$/

export class Versions {
  constructor(dataDir) {
    this.racine = join(dataDir, 'versions')
  }

  _dossier(id) {
    return join(this.racine, id)
  }

  /** Le document est supprimé : ses versions ne servent plus à personne. */
  supprimerDocument(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(id))) return
    try {
      rmSync(this._dossier(id), { recursive: true, force: true })
    } catch {
      // un dossier qui reste est une gêne, pas une erreur à renvoyer
    }
  }

  /**
   * Enregistre un instantané. `origine` dit d'où il vient ('compactage'
   * aujourd'hui, 'nommee' demain) et voyage dans un petit fichier jumeau :
   * le `.bin` reste des octets purs, que rien n'a besoin de décoder pour
   * être rendu au client.
   */
  enregistrer(id, instantane, { ts = Date.now(), origine = 'compactage', par = null, nom = null } = {}) {
    if (!instantane || !instantane.length) return null
    const dossier = this._dossier(id)
    mkdirSync(dossier, { recursive: true })
    // Deux versions dans la même milliseconde : la seconde ne doit pas
    // écraser la première (le nom du fichier est l'horodatage).
    while (existsSync(join(dossier, `${ts}.bin`))) ts++
    const base = join(dossier, String(ts))
    // Temporaire puis renommage : une coupure laisse le dossier sans
    // version à demi écrite plutôt qu'avec un instantané tronqué, qui
    // serait pire que pas de version du tout.
    ecrireAtomique(`${base}.bin`, instantane)
    try {
      ecrireAtomique(`${base}.json`, JSON.stringify({ ts, origine, par, nom }))
    } catch {
      // Les métadonnées sont un confort ; l'instantané, lui, est écrit.
    }
    return { ts, origine, par, nom }
  }

  /** Les versions d'un document, de la plus récente à la plus ancienne.
   * Une version dont le `.json` manque reste listée : c'est l'instantané
   * qui compte. */
  lister(id) {
    const dossier = this._dossier(id)
    if (!existsSync(dossier)) return []
    const out = []
    for (const f of readdirSync(dossier)) {
      const m = f.match(NOM)
      if (!m) continue
      const ts = Number(m[1])
      let meta = {}
      try {
        meta = JSON.parse(readFileSync(join(dossier, `${ts}.json`), 'utf8')) || {}
      } catch {
        meta = {}
      }
      let octets = 0
      try {
        octets = statSync(join(dossier, f)).size
      } catch {
        octets = 0
      }
      out.push({ ts, octets, origine: meta.origine || 'inconnue', par: meta.par || null, nom: meta.nom || null })
    }
    return out.sort((a, b) => b.ts - a.ts)
  }

  /** L'instantané lui-même, en Buffer, ou null. */
  lire(id, ts) {
    const chemin = join(this._dossier(id), `${Number(ts)}.bin`)
    if (!existsSync(chemin)) return null
    try {
      return readFileSync(chemin)
    } catch {
      return null
    }
  }

  /** Une version, ou null. */
  trouver(id, ts) {
    return this.lister(id).find((v) => v.ts === Number(ts)) || null
  }

  /** Donne (ou retire, avec `nom` null) un nom à une version. Une version
   * nommée n'est plus jamais amincie. `null` si elle n'existe pas. */
  renommer(id, ts, nom) {
    const v = this.trouver(id, ts)
    if (!v) return null
    const fiche = {
      ts: v.ts,
      origine: v.origine === 'inconnue' ? 'compactage' : v.origine,
      par: v.par,
      nom: nom || null,
    }
    ecrireAtomique(join(this._dossier(id), `${v.ts}.json`), JSON.stringify(fiche))
    return { ...v, nom: fiche.nom }
  }

  /** Supprime une version. `false` si elle n'existe pas. */
  supprimer(id, ts) {
    if (!this.trouver(id, ts)) return false
    const base = join(this._dossier(id), String(Number(ts)))
    rmSync(`${base}.bin`, { force: true })
    rmSync(`${base}.json`, { force: true })
    return true
  }

  /** Amincit les versions automatiques (voir `aSupprimer`) ; rend combien
   * ont été supprimées. */
  elaguer(id, maintenant = Date.now()) {
    const aOter = aSupprimer(this.lister(id), maintenant)
    for (const ts of aOter) this.supprimer(id, ts)
    return aOter.length
  }

  /** Le poids total des versions d'un document — pour le back-office, et
   * pour savoir quand une politique de rétention deviendra nécessaire. */
  octets(id) {
    return this.lister(id).reduce((somme, v) => somme + v.octets, 0)
  }
}

const JOUR = 24 * 3600 * 1000

/**
 * Quelles versions **automatiques** supprimer. Une version nommée est
 * toujours gardée. Pour les autres, plus c'est vieux, moins c'est fin :
 *   - moins de 3 jours : toutes ;
 *   - jusqu'à 30 jours : la dernière de chaque jour ;
 *   - jusqu'à 1 an : la dernière de chaque semaine ;
 *   - au-delà : aucune.
 * Les versions les plus récentes de chaque tranche survivent, parce que
 * c'est celles-là qu'on cherche (« où en était-on vendredi soir ? »).
 * `versions` : la sortie de `lister` (plus récente d'abord).
 */
export function aSupprimer(versions, maintenant = Date.now()) {
  const gardees = new Set()
  const out = []
  for (const v of versions) {
    if (v.nom) continue
    const age = maintenant - v.ts
    let cle
    if (age < 3 * JOUR) continue
    else if (age < 30 * JOUR) cle = `j${Math.floor(v.ts / JOUR)}`
    else if (age < 365 * JOUR) cle = `s${Math.floor(v.ts / (7 * JOUR))}`
    else {
      out.push(v.ts)
      continue
    }
    if (gardees.has(cle)) out.push(v.ts)
    else gardees.add(cle)
  }
  return out
}
