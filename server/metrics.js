// Journaux d'événements du back-office (voir claude/conception-backoffice.md
// §3). Trois flux, en append dans des fichiers .jsonl du dossier data — même
// philosophie que le reste : des fichiers, pas de base.
//
//   connexions : {ts, email, docId, dureeMs?}  — qui vient, pas seulement qui a accès
//   ia         : {ts, email, docId, entree, sortie} — le coût réel de la clé Anthropic
//   mail       : {ts, type, ok, erreur?} — la seule porte d'entrée depuis le
//                retrait de basic-auth : une panne d'envoi n'expose rien mais
//                enferme tout le monde dehors
//   agents     : {ts, agent, docId, outil, ok, appliques?, refuses?} — ce que
//                font les agents invités (mcp.js) : quel outil, combien,
//                jamais le texte ni le secret de l'adresse
//   dialogue   : {ts, email, docId, modele, entree, sortie, cacheLu, cacheEcrit,
//                tours, arret, outils, modifs, commentaires, refus, ms} — le
//                coût et l'effet des conversations de l'éditeur
//                (dialogue.js) ; jamais un message ni un extrait du texte
//   images     : {ts, email, docId, octets} — le disque est la seule
//                ressource du VPS qu'un usage normal peut épuiser pour de
//                bon ; ce flux dit à quelle vitesse il se remplit
//
// Aucun contenu de document n'y entre jamais. Les fichiers sont purgés au
// démarrage au-delà de RETENTION_JOURS.

import { appendFileSync, readFileSync, existsSync } from 'node:fs'
import { ecrireAtomique } from './fichiers.js'
import { join } from 'node:path'

// `publication`, `sauvegarde` et `embarquements` sont purgés comme les autres
// (11/10/2026) : ils étaient écrits sans jamais être ni lus ni purgés.
// `support` (les retours reçus) n'est volontairement pas purgé ici.
export const FLUX = [
  'connexions',
  'ia',
  'mail',
  'images',
  'agents',
  'dialogue',
  'publication',
  'sauvegarde',
  'embarquements',
  'versions',
  'corbeille',
  'correcteur',
]
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

  /** Efface une adresse des événements gardés (suppression de compte) : toute
   * valeur qui est cette adresse devient `null`, l'événement reste — il
   * compte toujours pour les statistiques, il ne désigne plus personne. Les
   * lignes illisibles sont conservées telles quelles. Renvoie le nombre de
   * valeurs effacées. */
  effacer(email) {
    const cible = String(email).toLowerCase()
    let efface = 0
    for (const flux of FLUX) {
      const chemin = this._chemin(flux)
      if (!existsSync(chemin)) continue
      let brut
      try {
        brut = readFileSync(chemin, 'utf8')
      } catch {
        continue
      }
      let change = false
      const lignes = brut.split('\n').map((ligne) => {
        if (!ligne || !ligne.toLowerCase().includes(cible)) return ligne
        try {
          const e = JSON.parse(ligne)
          let touche = false
          for (const [k, v] of Object.entries(e)) {
            if (typeof v === 'string' && v.toLowerCase() === cible) {
              e[k] = null
              touche = true
              efface++
            }
          }
          if (!touche) return ligne
          change = true
          return JSON.stringify(e)
        } catch {
          return ligne
        }
      })
      if (change) ecrireAtomique(chemin, lignes.join('\n'))
    }
    return efface
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
      try {
        ecrireAtomique(chemin, gardes.map((e) => JSON.stringify(e)).join('\n') + (gardes.length ? '\n' : ''))
        resultats[flux] = gardes.length
      } catch {
        // ignoré : la purge est un confort, pas une obligation
      }
    }
    return resultats
  }
}
