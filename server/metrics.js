// Journaux d'événements du back-office (voir claude/conception-backoffice.md
// §3). Trois flux, en append dans des fichiers .jsonl du dossier data — même
// philosophie que le reste : des fichiers, pas de base.
//
//   connexions : {ts, email, docId, dureeMs?}  — qui vient, pas seulement qui a accès
//   ia         : {ts, email, docId, entree, sortie} — le coût réel de la clé Anthropic
//   mail       : {ts, type, ok, erreur?} — la seule porte d'entrée depuis le
//                retrait de basic-auth : une panne d'envoi n'expose rien mais
//                enferme tout le monde dehors
//
// Aucun contenu de document n'y entre jamais. Les fichiers sont purgés au
// démarrage au-delà de RETENTION_JOURS.

import { appendFileSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export const FLUX = ['connexions', 'ia', 'mail']
const RETENTION_JOURS = 90

export class Metrics {
  constructor(dataDir, { retentionJours = RETENTION_JOURS } = {}) {
    this.dataDir = dataDir
    this.retentionMs = retentionJours * 24 * 60 * 60 * 1000
  }

  _chemin(flux) {
    return join(this.dataDir, `events-${flux}.jsonl`)
  }

  /** Écriture volontairement « au mieux » : un back-office qui ne peut pas
   * écrire sa statistique ne doit jamais faire échouer la requête qu'il
   * observe. */
  log(flux, donnees) {
    try {
      appendFileSync(this._chemin(flux), JSON.stringify({ ts: Date.now(), ...donnees }) + '\n', 'utf8')
    } catch {
      // ignoré délibérément
    }
  }

  /** Lit les événements postérieurs à `depuis` (ms epoch). Les lignes
   * illisibles (écriture interrompue) sont ignorées plutôt que de faire
   * échouer la lecture. */
  read(flux, depuis = 0) {
    const chemin = this._chemin(flux)
    if (!existsSync(chemin)) return []
    let brut
    try {
      brut = readFileSync(chemin, 'utf8')
    } catch {
      return []
    }
    const out = []
    for (const ligne of brut.split('\n')) {
      if (!ligne) continue
      try {
        const e = JSON.parse(ligne)
        if (e.ts >= depuis) out.push(e)
      } catch {
        // ligne tronquée : on passe
      }
    }
    return out
  }

  /** Purge les événements trop anciens — à appeler au démarrage. Réécriture
   * atomique (fichier temporaire puis rename), comme le registre. */
  prune() {
    const limite = Date.now() - this.retentionMs
    const resultats = {}
    for (const flux of FLUX) {
      const chemin = this._chemin(flux)
      if (!existsSync(chemin)) continue
      const gardes = this.read(flux, limite)
      const tmp = chemin + '.tmp'
      try {
        writeFileSync(tmp, gardes.map((e) => JSON.stringify(e)).join('\n') + (gardes.length ? '\n' : ''), 'utf8')
        renameSync(tmp, chemin)
        resultats[flux] = gardes.length
      } catch {
        // ignoré : la purge est un confort, pas une obligation
      }
    }
    return resultats
  }
}
