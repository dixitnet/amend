// Archiver `data/` — un écrivain tar qui diffuse (18/09/2026).
//
// **Pourquoi l'écrire plutôt que l'installer.** Le backend n'a aucune
// dépendance de production, et ce n'est pas une coquetterie : c'est ce qui
// fait qu'un `git pull` suffit à déployer et qu'aucune faille de chaîne
// d'approvisionnement ne passe par ici. Un écrivain tar POSIX tient en
// quatre-vingts lignes ; `zlib` est dans Node. Ajouter un paquet pour ça
// serait un mauvais échange.
//
// **Pourquoi diffuser.** Le service est plafonné à 700 Mo sur un VPS d'un
// gigaoctet, et `data/` n'a pas de taille maximale — le plus gros journal
// du Mac de développement pèse 96 Mo à lui seul. Une archive fabriquée en
// mémoire marcherait aujourd'hui et tuerait le serveur un jour, sans
// prévenir. On lit donc fichier par fichier, on écrit au fil de l'eau, et
// la mémoire ne dépend que de la taille du tampon.
//
// **Pourquoi copier à chaud suffit.** Les registres (`docs.json`,
// `users.json`…) sont écrits dans un fichier temporaire puis renommés : on
// les lit toujours entiers, jamais à moitié. Les journaux sont en **ajout
// seul** : au pire l'archive attrape une dernière trame tronquée, qu'on
// jette à la restauration. Il n'y a donc pas à arrêter le service — ce qui
// est heureux, puisqu'une sauvegarde qui demande une coupure est une
// sauvegarde qu'on ne prend pas.

import { createReadStream, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'

const BLOC = 512

function octal(n, longueur) {
  return n.toString(8).padStart(longueur - 1, '0') + '\0'
}

/** L'en-tête ustar d'une entrée. La somme de contrôle se calcule sur
 * l'en-tête lui-même, ses propres octets comptés comme des espaces — d'où
 * les deux passes. */
function entete({ nom, taille, mtime, mode = 0o644, type = '0' }) {
  const h = Buffer.alloc(BLOC, 0)
  // Un nom de plus de 100 octets demanderait le préfixe ustar ; rien dans
  // `data/` n'en approche (des identifiants de douze caractères et des
  // noms d'images de quarante), et un nom trop long est écarté par
  // l'appelant plutôt que tronqué en silence.
  h.write(nom, 0, 100, 'utf8')
  h.write(octal(mode, 8), 100, 8)
  h.write(octal(0, 8), 108, 8) // uid
  h.write(octal(0, 8), 116, 8) // gid
  h.write(octal(taille, 12), 124, 12)
  h.write(octal(Math.floor(mtime / 1000), 12), 136, 12)
  h.write('        ', 148, 8) // somme de contrôle : des espaces pour le calcul
  h.write(type, 156, 1)
  h.write('ustar\0', 257, 6)
  h.write('00', 263, 2)
  let somme = 0
  for (const o of h) somme += o
  h.write(octal(somme, 7), 148, 7)
  h.write(' ', 155, 1)
  return h
}

/** Le bourrage qui ramène `taille` à un multiple de 512. */
function bourrage(taille) {
  const reste = taille % BLOC
  return reste === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOC - reste, 0)
}

/** Tous les fichiers sous `racine`, récursivement, en chemins relatifs.
 * `ignorer(relatif)` écarte ce qu'on ne veut pas emporter — les fichiers
 * temporaires d'une écriture en cours, par exemple : un `.tmp` n'est
 * jamais un état cohérent, et il n'a rien à faire dans une sauvegarde. */
export function listerFichiers(racine, ignorer = () => false) {
  const out = []
  const parcourir = (dossier) => {
    let entrees
    try {
      entrees = readdirSync(dossier, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entrees.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const chemin = join(dossier, e.name)
      const rel = relative(racine, chemin).split(sep).join('/')
      if (ignorer(rel)) continue
      if (e.isDirectory()) parcourir(chemin)
      else if (e.isFile()) out.push(rel)
    }
  }
  parcourir(racine)
  return out
}

/**
 * Un flux tar de `racine`, chaque entrée préfixée par `prefixe` (pour que
 * l'archive se déplie en un dossier et non en vrac dans le répertoire
 * courant — la première fois qu'on décompresse une archive au mauvais
 * endroit, on comprend pourquoi).
 *
 * `supplements` ajoute des fichiers fabriqués à la volée : c'est par là
 * qu'arrive le mode d'emploi de la restauration. Une archive qu'on
 * retrouve dans deux ans sans savoir quoi en faire ne sert à personne.
 */
export function fluxTar(racine, { prefixe = 'data', ignorer, supplements = [] } = {}) {
  const fichiers = listerFichiers(racine, ignorer)
  async function* produire() {
    for (const { nom, contenu } of supplements) {
      const corps = Buffer.from(contenu, 'utf8')
      yield entete({ nom: `${prefixe}/${nom}`, taille: corps.length, mtime: Date.now() })
      yield corps
      yield bourrage(corps.length)
    }
    for (const rel of fichiers) {
      const chemin = join(racine, rel)
      let st
      try {
        st = statSync(chemin)
      } catch {
        // Disparu entre la liste et la lecture : un document supprimé
        // pendant l'archivage n'est pas une erreur, c'est la vie d'un
        // dossier vivant.
        continue
      }
      const nom = `${prefixe}/${rel}`
      if (Buffer.byteLength(nom) > 100) continue
      yield entete({ nom, taille: st.size, mtime: st.mtimeMs })
      let ecrits = 0
      for await (const morceau of createReadStream(chemin)) {
        // La taille annoncée dans l'en-tête fait foi : si le fichier a
        // grossi depuis le `stat` (un journal en cours d'écriture), on
        // s'arrête là ; s'il a rétréci, on complète de zéros plus bas.
        const reste = st.size - ecrits
        if (reste <= 0) break
        const bout = morceau.length > reste ? morceau.subarray(0, reste) : morceau
        ecrits += bout.length
        yield bout
      }
      if (ecrits < st.size) yield Buffer.alloc(st.size - ecrits, 0)
      yield bourrage(st.size)
    }
    // Fin d'archive : deux blocs vides.
    yield Buffer.alloc(BLOC * 2, 0)
  }
  return Readable.from(produire())
}
