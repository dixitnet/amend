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
// Premier usage, et le seul pour l'instant : **avant chaque compactage**.
// C'est gratuit — le client a déjà calculé cet instantané pour compacter,
// il suffit de ne plus le jeter. Le jour où les versions nommées arriveront,
// elles écriront dans le même dossier, avec le même format.
//
// Comme partout ailleurs ici, le serveur ne lit jamais le contenu : il
// écrit des octets et il les rend.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, renameSync, readFileSync } from 'node:fs'
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
    const base = join(dossier, String(ts))
    // Temporaire puis renommage : une coupure laisse le dossier sans
    // version à demi écrite plutôt qu'avec un instantané tronqué, qui
    // serait pire que pas de version du tout.
    writeFileSync(`${base}.bin.tmp`, instantane)
    renameSync(`${base}.bin.tmp`, `${base}.bin`)
    try {
      writeFileSync(`${base}.json`, JSON.stringify({ ts, origine, par, nom }), 'utf8')
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

  /** Le poids total des versions d'un document — pour le back-office, et
   * pour savoir quand une politique de rétention deviendra nécessaire. */
  octets(id) {
    return this.lister(id).reduce((somme, v) => somme + v.octets, 0)
  }
}
