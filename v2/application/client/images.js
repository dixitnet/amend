// Les images à l'envoi (14/11/2026, Sylvain, comme la v1) : on accepte des
// images lourdes (25 Mo, PNG, GIF ou JPEG) que le navigateur réduit avant de les
// envoyer : 2 000 px de large au plus, PNG ou JPEG selon ce qui pèse le moins.
// Les règles (limites, dimensions, quand garder l'original) sont celles du
// domaine ; ici, seulement le dessin et l'encodage du navigateur.
import {
  IMAGE_MAX_OCTETS,
  IMAGE_SEUIL_JPEG_OCTETS,
  IMAGE_QUALITES_JPEG,
  refusEntree,
  dimensionsReduites,
  garderOriginal,
} from '../../domaine/index.js'

const erreur = (code) => Object.assign(new Error(code), { code })
const versBlob = (canvas, type, qualite) => new Promise((resolve) => canvas.toBlob(resolve, type, qualite))

/**
 * Réduit une image choisie par la personne.
 * @param {File} fichier
 * @returns {Promise<{ blob: Blob, largeur: number }>}  l'image à envoyer et sa largeur (la hauteur n'est pas portée : renoncement n° 26)
 * @throws une erreur portant un code : `image-vide`, `image-entree-trop-lourde`,
 *   `image-type-refuse`, `image-illisible`, `image-trop-lourde` (même réduite)
 */
export async function preparerImage(fichier) {
  const refus = refusEntree({ type: fichier.type, octets: fichier.size })
  if (refus) throw erreur(refus)
  let bitmap
  try {
    bitmap = await createImageBitmap(fichier)
  } catch {
    throw erreur('image-illisible')
  }
  try {
    const { largeur, hauteur } = dimensionsReduites(bitmap.width, bitmap.height)
    const original = { type: fichier.type, octets: fichier.size, largeur: bitmap.width }
    // Un GIF dans les limites garde son animation : il part tel quel.
    if (garderOriginal(original)) return { blob: fichier, largeur }
    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largeur, hauteur)
    let meilleur = await versBlob(canvas, 'image/png')
    if (!meilleur) throw erreur('image-illisible')
    if (meilleur.size > IMAGE_SEUIL_JPEG_OCTETS || meilleur.size > IMAGE_MAX_OCTETS) {
      // Une photo pèse cinq à dix fois moins en JPEG ; une capture d'écran aux
      // aplats nets ressort souvent plus lourde : on compare. Le JPEG n'a pas de
      // transparence : on le dessine sur du blanc.
      const fond = document.createElement('canvas')
      fond.width = largeur
      fond.height = hauteur
      const g = fond.getContext('2d')
      // Fond blanc opaque : toutes les valeurs d'un pixel à 255 (pas une couleur du design).
      const blanc = g.createImageData(largeur, hauteur)
      blanc.data.fill(255)
      g.putImageData(blanc, 0, 0)
      g.drawImage(canvas, 0, 0)
      for (const qualite of IMAGE_QUALITES_JPEG) {
        const jpeg = await versBlob(fond, 'image/jpeg', qualite)
        if (jpeg && jpeg.size < meilleur.size) meilleur = jpeg
        if (meilleur.size <= IMAGE_MAX_OCTETS) break
      }
    }
    // Une image déjà petite, au bon format, n'a rien à gagner à être ré-encodée
    // (même si tout ré-encodage la rendrait trop lourde).
    if (garderOriginal(original, meilleur.size)) return { blob: fichier, largeur }
    if (meilleur.size > IMAGE_MAX_OCTETS) throw erreur('image-trop-lourde')
    return { blob: meilleur, largeur }
  } finally {
    bitmap.close?.()
  }
}
