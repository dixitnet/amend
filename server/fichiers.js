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

import { closeSync, copyFileSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs'

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

let compteurTemporaire = 0

/** Écrit `contenu` (texte ou octets) dans un fichier temporaire voisin, le
 * synchronise sur le disque, puis le renomme sur `chemin` : une coupure laisse
 * l'ancien fichier entier ou le nouveau entier, jamais un fichier à moitié
 * écrit (audit A8, 10/10/2026 — onze copies de ce geste, sans `fsync`, avec un
 * nom temporaire fixe qui se marchait dessus).
 *
 * Le nom temporaire est propre à l'appel (processus + compteur) et se termine
 * toujours par `.tmp` : la sauvegarde et le back-office ignorent ce suffixe.
 * `mode` : droits du fichier (0o600 pour un secret). Si le renommage échoue,
 * le temporaire est retiré. */
export function ecrireAtomique(chemin, contenu, { mode } = {}) {
  const tmp = `${chemin}.${process.pid}-${++compteurTemporaire}.tmp`
  const octets = typeof contenu === 'string' ? Buffer.from(contenu, 'utf8') : contenu
  const fd = mode === undefined ? openSync(tmp, 'w') : openSync(tmp, 'w', mode)
  try {
    let ecrits = 0
    while (ecrits < octets.length) ecrits += writeSync(fd, octets, ecrits, octets.length - ecrits)
    fsyncSync(fd)
  } catch (err) {
    closeSync(fd)
    try {
      unlinkSync(tmp)
    } catch {
      /* déjà parti */
    }
    throw err
  }
  closeSync(fd)
  try {
    renameSync(tmp, chemin)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      /* déjà parti */
    }
    throw err
  }
}

/** Écrit `valeur` en JSON, atomiquement (voir `ecrireAtomique`). */
export function ecrireJsonAtomique(chemin, valeur, indentation = 2) {
  ecrireAtomique(chemin, JSON.stringify(valeur, null, indentation))
}
