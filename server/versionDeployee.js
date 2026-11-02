// La version déployée, pour le back-office (rubrique Système) : le commit sur
// lequel se trouve le dépôt de l'application, et depuis quand.
//
// Lu à chaque demande, et non au démarrage : un déploiement qui ne touche que
// le client ne redémarre pas le service (deploy/deploy.sh), et une valeur
// prise au démarrage resterait sur l'ancien commit.
//
// Lu directement dans `.git` (HEAD, puis la référence, puis packed-refs), sans
// lancer `git` : rien à installer, rien d'exécuté. « depuis » est la date de
// modification du fichier de référence, que `git pull` réécrit à chaque mise
// à jour. Renvoie `null` hors d'un dépôt git ou si la lecture échoue.

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const HASH = /^[0-9a-f]{40}$/

export function versionDeployee(racine) {
  try {
    const gitDir = join(racine, '.git')
    const tete = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    if (HASH.test(tete)) {
      return { commit: tete.slice(0, 7), branche: null, depuis: statSync(join(gitDir, 'HEAD')).mtimeMs }
    }
    const ref = /^ref: (refs\/\S+)$/.exec(tete)?.[1]
    if (!ref) return null
    const branche = ref.replace(/^refs\/heads\//, '')
    const fichier = join(gitDir, ref)
    try {
      const hash = readFileSync(fichier, 'utf8').trim()
      if (HASH.test(hash)) return { commit: hash.slice(0, 7), branche, depuis: statSync(fichier).mtimeMs }
    } catch {
      // Référence absente en fichier : elle est dans packed-refs.
    }
    const packed = join(gitDir, 'packed-refs')
    for (const ligne of readFileSync(packed, 'utf8').split('\n')) {
      const [hash, nom] = ligne.trim().split(' ')
      if (nom === ref && HASH.test(hash)) {
        return { commit: hash.slice(0, 7), branche, depuis: statSync(packed).mtimeMs }
      }
    }
    return null
  } catch {
    return null
  }
}
