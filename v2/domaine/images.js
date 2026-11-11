// Les images d'un document (couche domaine, lots du 11/11/2026, lot B), sur le
// modèle de Docs (`attachment_upload` : nom aléatoire, type contrôlé) et de la
// v1 (`server/uploads.js` : PNG et JPEG reconnus à leurs premiers octets,
// 5 Mo par image et 100 Mo par document). Pas d'antivirus (renoncement n° 20) :
// seules des images, de types vérifiés, sont acceptées.

/** Poids d'une image, au plus (v1 : 5 Mo). */
export const IMAGE_MAX_OCTETS = 5 * 1024 * 1024
/** Poids de toutes les images d'un document, au plus (v1 : 100 Mo). */
export const IMAGES_DOCUMENT_MAX_OCTETS = 100 * 1024 * 1024

const TYPES = [
  { type: 'image/png', extension: 'png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
]

/**
 * Le type d'une image d'après ses premiers octets (jamais d'après ce que
 * déclare le navigateur), ou `null` si ce n'est ni un PNG ni un JPEG.
 * @param {Uint8Array} octets
 * @returns {{ type: string, extension: string } | null}
 */
export function typeImage(octets) {
  const t = TYPES.find((x) => octets.length >= x.signature.length && x.signature.every((o, i) => octets[i] === o))
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
const NOM = /^[0-9a-f]{32}\.(png|jpg)$/
export const nomImageValide = (nom) => typeof nom === 'string' && NOM.test(nom)
