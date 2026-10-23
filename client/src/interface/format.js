// Les formats d'écran S, M, L (21/10/2026, coquille de l'architecture : voir
// claude/architecture-interface-trois-plateformes.md §2.1).
//
// Le format est celui de la **fenêtre**, pas de la machine : un iPad en Split
// View et un Mac en fenêtre étroite peuvent tomber dans le même. Une seule
// fonction le décide, une seule feuille de seuils ; l'attribut `data-format`
// posé sur la racine permet aux feuilles de style de s'y accrocher (et aux
// essais de savoir où l'on est) sans répéter les `@media`.
//
//   S  : jusqu'à 700 px   (iPhone, fenêtre très étroite)
//   M  : de 701 à 1 279 px (iPad, Mac en fenêtre réduite)
//   L  : à partir de 1 280 px (Mac, grand écran)
//
// La coquille n'est pas encore l'unique décideur : les rangées de l'éditeur
// (`editor.js`) interrogent encore leurs propres requêtes, qui valent les
// mêmes seuils. Elle donne le vocabulaire et l'attribut ; le reste migre
// étape par étape.

import { media } from '../feuille.js'

export const LARGEUR_MAX_S = 700
export const LARGEUR_MIN_L = 1280

/** Le format d'une largeur de fenêtre, en pixels CSS. */
export function formatDe(largeur) {
  if (!(largeur > 0)) return 'L'
  if (largeur <= LARGEUR_MAX_S) return 'S'
  if (largeur >= LARGEUR_MIN_L) return 'L'
  return 'M'
}

/** Pose `data-format` sur `racine` et le tient à jour quand la fenêtre change
 * de format (rotation, Split View, redimensionnement), sans recharger.
 * `rappel(format)` est appelé à chaque changement. Renvoie de quoi tout
 * défaire. */
export function suivreLeFormat(racine, rappel = null) {
  const requeteS = media(`(max-width: ${LARGEUR_MAX_S}px)`)
  const requeteL = media(`(min-width: ${LARGEUR_MIN_L}px)`)
  const courant = () => (requeteS.matches ? 'S' : requeteL.matches ? 'L' : 'M')
  let dernier = null
  function appliquer() {
    const f = courant()
    if (f === dernier) return
    dernier = f
    racine.dataset.format = f
    if (rappel) rappel(f)
  }
  appliquer()
  requeteS.addEventListener?.('change', appliquer)
  requeteL.addEventListener?.('change', appliquer)
  return () => {
    requeteS.removeEventListener?.('change', appliquer)
    requeteL.removeEventListener?.('change', appliquer)
    delete racine.dataset.format
  }
}
