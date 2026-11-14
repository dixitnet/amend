// Les images d'un document (couche domaine, lots du 11/11/2026, lot B), sur le
// modèle de Docs (`attachment_upload` : nom aléatoire, type contrôlé) et de la
// v1 (`server/uploads.js` : types reconnus à leurs premiers octets, 5 Mo par
// image et 100 Mo par document). Pas d'antivirus (renoncement n° 20) : seules
// des images, de types vérifiés, sont acceptées.
//
// Depuis le 14/11/2026 (Sylvain, comme la v1) : on accepte à l'import des images
// lourdes (25 Mo, PNG, GIF ou JPEG) que le navigateur **réduit avant l'envoi**
// (2 000 px de large, PNG ou JPEG selon le poids) ; le serveur ne garde que
// l'image réduite, de 5 Mo au plus. Un GIF qui tient dans les limites est gardé
// tel quel, pour ne pas perdre son animation.

/** Poids d'une image gardée par le serveur, au plus (v1 : 5 Mo) : celui de l'image réduite. */
export const IMAGE_MAX_OCTETS = 5 * 1024 * 1024
/** Poids de toutes les images d'un document, au plus (v1 : 100 Mo). */
export const IMAGES_DOCUMENT_MAX_OCTETS = 100 * 1024 * 1024
/** Poids d'une image choisie par la personne, avant réduction (Sylvain, 14/11/2026). */
export const IMAGE_ENTREE_MAX_OCTETS = 25 * 1024 * 1024
/** Largeur conservée après réduction, en pixels (v1 : 2 000 depuis le 23/10/2026). */
export const IMAGE_LARGEUR_MAX_PX = 2000
/** Au-delà de ce poids, un PNG réduit est comparé à un JPEG (v1) : en dessous, le PNG d'une capture d'écran est plus léger et plus net. */
export const IMAGE_SEUIL_JPEG_OCTETS = 600 * 1024
/** Qualités de JPEG essayées, de la meilleure à la plus faible, tant que l'image dépasse le poids permis. */
export const IMAGE_QUALITES_JPEG = [0.85, 0.7, 0.5]

const TYPES = [
  { type: 'image/png', extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
  // GIF87a et GIF89a : « GIF8 », puis 7 ou 9, puis « a ».
  {
    type: 'image/gif',
    extension: 'gif',
    signature: [0x47, 0x49, 0x46, 0x38],
    suite: (o) => (o[4] === 0x37 || o[4] === 0x39) && o[5] === 0x61,
  },
]

/**
 * Le type d'une image d'après ses premiers octets (jamais d'après ce que
 * déclare le navigateur), ou `null` si ce n'est ni un PNG ni un JPEG.
 * @param {Uint8Array} octets
 * @returns {{ type: string, extension: string } | null}
 */
export function typeImage(octets) {
  const t = TYPES.find(
    (x) =>
      octets.length >= x.signature.length &&
      x.signature.every((o, i) => octets[i] === o) &&
      (!x.suite || (octets.length >= 6 && x.suite(octets))),
  )
  return t ? { type: t.type, extension: t.extension } : null
}

/**
 * Refus d'une image avant de la garder : rend un code, ou `null`.
 * @param {Uint8Array} octets
 * @param {number} dejaLa  poids des images déjà gardées pour ce document
 */
export function refusImage(octets, dejaLa = 0) {
  if (!octets.length) return 'image-vide'
  if (octets.length > IMAGE_MAX_OCTETS) return 'image-trop-lourde'
  if (dejaLa + octets.length > IMAGES_DOCUMENT_MAX_OCTETS) return 'images-document-pleines'
  if (!typeImage(octets)) return 'image-type-refuse'
  return null
}

/** Le nom d'une image gardée : 32 chiffres hexadécimaux et son extension. */
const NOM = /^[0-9a-f]{32}\.(png|jpg|gif)$/
export const nomImageValide = (nom) => typeof nom === 'string' && NOM.test(nom)

/**
 * Les dimensions d'une image après réduction : la même image, à 2 000 px de
 * large au plus (jamais agrandie), proportions gardées.
 * @returns {{ largeur: number, hauteur: number, facteur: number }}
 */
export function dimensionsReduites(largeur, hauteur, max = IMAGE_LARGEUR_MAX_PX) {
  const facteur = Math.min(1, max / largeur)
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
    facteur,
  }
}

/**
 * Faut-il envoyer le fichier d'origine sans le ré-encoder ? Un GIF qui tient
 * dans les limites (animation gardée), ou une image PNG ou JPEG qui n'a pas été
 * réduite et qui ne pèse pas plus que son ré-encodage (v1).
 * @param {{ type: string, octets: number, largeur: number }} original
 * @param {number | null} reencode  le poids du meilleur ré-encodage, ou `null` si non calculé
 */
export function garderOriginal({ type, octets, largeur }, reencode = null) {
  if (type === 'image/gif') return octets <= IMAGE_MAX_OCTETS && largeur <= IMAGE_LARGEUR_MAX_PX
  if (type !== 'image/png' && type !== 'image/jpeg') return false
  return largeur <= IMAGE_LARGEUR_MAX_PX && reencode !== null && octets <= reencode
}

/**
 * Refus d'une image avant la réduction : rend un code, ou `null`.
 * @param {{ type: string, octets: number }} fichier  le type annoncé par le navigateur et le poids
 */
export function refusEntree({ type, octets }) {
  if (!octets) return 'image-vide'
  if (octets > IMAGE_ENTREE_MAX_OCTETS) return 'image-entree-trop-lourde'
  if (type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/gif') return 'image-type-refuse'
  return null
}
