// Version des données et verrou d'instance (point 41 de la feuille de route,
// audit A20 + A24, 11/10/2026).
//
// Deux garde-fous que rien ne tenait jusqu'ici :
//
//  1. Les migrations se faisaient « en douce » à la lecture. Désormais
//     `data/version.json` dit où en sont les données, et `migrerDonnees`
//     applique, dans l'ordre et une seule fois, les étapes qui manquent —
//     après avoir mis le registre de côté. Des données plus récentes que le
//     code (retour en arrière du déploiement) sont refusées : l'ancien code
//     les lirait de travers et les réécrirait.
//
//  2. Rien n'interdisait deux serveurs sur le même `data/` : salles Yjs,
//     limiteurs et tampon d'écriture ne se partagent pas, le second
//     écraserait le premier. `verrouillerDonnees` pose `data/.pid` et refuse
//     de démarrer si le processus qui le tient est vivant.

import { copyFileSync, existsSync, readFileSync, readlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { ecrireAtomique } from './fichiers.js'

/** La version des données que ce code sait lire et écrire. À augmenter avec
 * chaque migration ajoutée à `MIGRATIONS` (server.js). */
export const VERSION_DONNEES = 2

export class DonneesIncompatibles extends Error {}

export function lireVersion(dataDir) {
  try {
    const v = JSON.parse(readFileSync(join(dataDir, 'version.json'), 'utf8')).version
    return Number.isInteger(v) && v >= 0 ? v : 0
  } catch {
    return 0 // absent ou illisible : des données d'avant le versionnage
  }
}

/**
 * @param {string} dataDir
 * @param {Array<{version:number, nom:string, appliquer:()=>void}>} migrations
 *   par version croissante ; chaque étape doit être **idempotente**
 * @param {{ cible?: number, journal?: (m:string)=>void }} [options]
 * @returns {{ de: number, vers: number, appliquees: string[] }}
 */
export function migrerDonnees(dataDir, migrations, { cible = VERSION_DONNEES, journal = () => {} } = {}) {
  const actuelle = lireVersion(dataDir)
  if (actuelle > cible) {
    throw new DonneesIncompatibles(
      `les données sont en version ${actuelle}, ce code ne connaît que la ${cible} — ` +
        `retour en arrière refusé (restaurer une sauvegarde, ou redéployer le code récent)`
    )
  }
  const aFaire = migrations.filter((m) => m.version > actuelle && m.version <= cible)
  const appliquees = []
  if (aFaire.length) {
    const registre = join(dataDir, 'docs.json')
    if (existsSync(registre)) {
      // Une seule copie par version de départ : la première, avant toute étape.
      const copie = join(dataDir, `docs.json.avant-v${actuelle + 1}`)
      if (!existsSync(copie)) copyFileSync(registre, copie)
    }
  }
  for (const m of aFaire) {
    m.appliquer()
    journal(`migration ${m.version} : ${m.nom}`)
    appliquees.push(m.nom)
  }
  // Toutes les étapes sont passées (sinon l'exception a remonté et la version
  // n'a pas bougé : on recommencera, les étapes sont idempotentes). Des
  // données neuves, sans étape à faire, reçoivent aussi leur version.
  if (actuelle !== cible || !existsSync(join(dataDir, 'version.json'))) {
    ecrireAtomique(join(dataDir, 'version.json'), JSON.stringify({ version: cible }) + '\n')
  }
  return { de: actuelle, vers: cible, appliquees }
}

// --- Verrou d'instance -------------------------------------------------------

function estVivant(pid) {
  try {
    process.kill(pid, 0)
  } catch (err) {
    return err.code === 'EPERM' // existe, mais pas à nous
  }
  // Un pid réutilisé par un autre programme ne doit pas empêcher de démarrer :
  // où /proc existe, on vérifie que c'est bien du Node.
  try {
    const exe = readlinkSync(`/proc/${pid}/exe`)
    return /node/i.test(exe)
  } catch {
    return true
  }
}

/** Pose `data/.pid`. Lève une erreur si une autre instance vivante le tient.
 * Renvoie la fonction qui le retire (aussi appelée à la sortie du process). */
export function verrouillerDonnees(dataDir, pid = process.pid) {
  const chemin = join(dataDir, '.pid')
  if (existsSync(chemin)) {
    const ancien = Number.parseInt(readFileSync(chemin, 'utf8'), 10)
    if (Number.isInteger(ancien) && ancien !== pid && estVivant(ancien)) {
      throw new Error(
        `un autre serveur (pid ${ancien}) utilise déjà ${dataDir} — deux serveurs sur les mêmes données s'écraseraient`
      )
    }
  }
  ecrireAtomique(chemin, `${pid}\n`)
  let libere = false
  const liberer = () => {
    if (libere) return
    libere = true
    try {
      // Ne retire que son propre verrou.
      if (Number.parseInt(readFileSync(chemin, 'utf8'), 10) === pid) unlinkSync(chemin)
    } catch {
      /* déjà parti */
    }
  }
  process.once('exit', liberer)
  return liberer
}
