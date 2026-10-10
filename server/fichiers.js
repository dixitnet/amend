// Lecture et écriture des petits fichiers JSON du serveur (registre des
// documents, comptes). Deux garanties que les copies locales n'avaient pas
// (audit du 10/10/2026, A1 et A8) :
//
//  - un fichier **illisible n'est pas un fichier vide**. `docs.json` tronqué
//    renvoyait `{}`, et la prochaine écriture le remplaçait par un registre
//    vide : tous les documents disparaissaient, sans message. Ici on garde
//    une copie du fichier abîmé, on le dit, et on **refuse** de continuer
//    plutôt que de repartir de rien ;
//  - l'écriture est atomique *et durable* : fichier temporaire, `fsync`,
//    puis renommage.

import { closeSync, copyFileSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'

const dejaMisDeCote = new Set()

/** Le contenu JSON de `chemin`. Fichier absent : `siAbsent`. Fichier présent
 * mais vide ou illisible : une copie `<chemin>.illisible-<horodatage>` (une
 * seule par fichier et par processus), un message sur la sortie d'erreur, et
 * une exception — jamais un objet vide. */
export function lireJson(chemin, siAbsent = {}) {
  let texte
  try {
    texte = readFileSync(chemin, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return siAbsent
    throw err
  }
  try {
    return JSON.parse(texte)
  } catch {
    if (!dejaMisDeCote.has(chemin)) {
      dejaMisDeCote.add(chemin)
      const copie = `${chemin}.illisible-${Date.now()}`
      try {
        copyFileSync(chemin, copie)
        console.error(`[amend] ${chemin} est illisible (${texte.length} octets) : copie gardée dans ${copie}. Rien n'est réécrit tant qu'il n'est pas réparé.`)
      } catch (e) {
        console.error(`[amend] ${chemin} est illisible et n'a pas pu être copié :`, e.message)
      }
    }
    throw Object.assign(new Error(`fichier illisible : ${chemin}`), { code: 'FICHIER_ILLISIBLE' })
  }
}

/** Écrit `valeur` en JSON dans un fichier temporaire, le synchronise sur
 * le disque, puis le renomme sur `chemin`. */
export function ecrireJsonAtomique(chemin, valeur, indentation = 2) {
  const tmp = `${chemin}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, JSON.stringify(valeur, null, indentation), null, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, chemin)
}
