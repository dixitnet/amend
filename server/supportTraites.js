// Les retours déjà traités (22/09/2026).
//
// Pourquoi un fichier à part plutôt qu'un champ dans `events-support.jsonl`.
// Ce journal est en **ajout seul** : on y écrit une ligne, on ne la réécrit
// jamais. C'est ce qui fait qu'une écriture interrompue n'y coûte au pire
// qu'une ligne illisible, ignorée à la lecture, et qu'un retour reçu ne peut
// pas être perdu par une relecture-réécriture malheureuse. Marquer un retour
// en modifiant sa ligne, ce serait renoncer à cette garantie pour une case à
// cocher.
//
// Et « traité » est de toute façon d'une autre nature que le retour
// lui-même : le retour est un fait, daté, venu de quelqu'un ; l'état de
// traitement est une note de travail, qui change, et qu'on doit pouvoir
// défaire. Deux natures, deux fichiers.
//
// Le fichier est une simple table : identifiant du retour → { ts, par }.

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export class SupportTraites {
  constructor(dataDir) {
    this.chemin = join(dataDir, 'support-traites.json')
  }

  /** La table entière. Un fichier absent ou abîmé vaut « rien de traité » :
   * perdre cette note est sans gravité, refuser d'afficher le back-office
   * pour autant en aurait. */
  tous() {
    if (!existsSync(this.chemin)) return {}
    try {
      const brut = JSON.parse(readFileSync(this.chemin, 'utf8'))
      return brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {}
    } catch {
      return {}
    }
  }

  /** Marque ou démarque. `par` est l'adresse de qui a cliqué — savoir qui a
   * traité vaut mieux que savoir que ça l'a été, dès qu'on est deux. */
  marquer(cle, par, traite = true) {
    const id = String(cle || '').trim()
    if (!id) return false
    const table = this.tous()
    if (traite) table[id] = { ts: Date.now(), par: String(par || '') }
    else delete table[id]
    // Écriture par fichier temporaire puis renommage : une coupure pendant
    // l'écriture laisse l'ancienne table intacte plutôt qu'un fichier
    // tronqué. Même précaution que pour le registre des documents.
    const temporaire = `${this.chemin}.tmp`
    writeFileSync(temporaire, JSON.stringify(table, null, 2), 'utf8')
    renameSync(temporaire, this.chemin)
    return true
  }
}

/** La clé d'un retour. Les entrées écrites avant le 22/09/2026 n'ont pas
 * d'identifiant : leur horodatage en tient lieu — il est unique en pratique,
 * et c'est tout ce qu'on leur demande. */
export function cleDuRetour(retour) {
  return String((retour && retour.id) || (retour && retour.ts) || '')
}
