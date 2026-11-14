// L'analyse des images orphelines (couche domaine, 14/11/2026 ; Sylvain : B5,
// « l'analyse seulement », comme la v1, `server/imagesOrphelines.js`). Une image
// supprimée du texte reste dans la base, et dans le poids du document, jusqu'à
// la suppression du document. L'analyse dit combien, sans rien supprimer.
//
// Principe de la v1, prudent par construction : le nom d'une image (32 chiffres
// hexadécimaux et son extension, jamais réutilisé) s'écrit tel quel dans l'état
// d'un document ; on le cherche dans l'état de tous les documents (le texte et
// les suggestions), sans décoder Yjs. Une image dont le nom est cité quelque
// part est « utilisée » ; on peut garder à tort, jamais l'inverse. Limites
// connues de cette première version : elle ne lit pas les versions enregistrées
// (une version peut citer une image absente du texte d'aujourd'hui) ; elle ne
// doit donc pas servir à supprimer.

/** Une image envoyée depuis moins longtemps n'est pas jugée (le texte n'est peut-être pas encore écrit ; Ctrl+Z). */
export const DELAI_GRACE_IMAGES_MS = 7 * 24 * 60 * 60 * 1000
/** Nombre de documents listés au plus dans le rapport. */
export const DOCUMENTS_LISTES_MAX = 20

const NOM = /[0-9a-f]{32}\.(?:png|jpg|gif)/g

/**
 * Les noms d'images cités dans des octets (l'état encodé d'un document).
 * @param {Uint8Array} octets
 * @returns {Set<string>}
 */
export function nomsCites(octets) {
  return new Set(new TextDecoder('latin1').decode(octets).match(NOM) ?? [])
}

const vide = () => ({ n: 0, octets: 0 })
const ajouter = (c, taille) => {
  c.n += 1
  c.octets += taille
}

/**
 * Le rapport : combien d'images, combien sont utilisées, orphelines, récentes.
 * @param {{
 *   images: Array<{ document: string, nom: string, taille: number, creeLe: number }>,
 *   citees: Set<string>, maintenant: number, delaiMs?: number,
 * }} o  `creeLe` : le moment d'envoi, en millisecondes
 */
export function analyserImages({ images, citees, maintenant, delaiMs = DELAI_GRACE_IMAGES_MS }) {
  const total = vide()
  const utilisees = vide()
  const orphelines = vide()
  const recentes = vide()
  const parDocument = new Map()
  for (const i of images) {
    ajouter(total, i.taille)
    if (citees.has(i.nom)) ajouter(utilisees, i.taille)
    else if (maintenant - i.creeLe < delaiMs) ajouter(recentes, i.taille)
    else {
      ajouter(orphelines, i.taille)
      const d = parDocument.get(i.document) ?? { document: i.document, ...vide() }
      ajouter(d, i.taille)
      parDocument.set(i.document, d)
    }
  }
  return {
    total,
    utilisees,
    orphelines,
    recentes,
    documents: [...parDocument.values()].sort((a, b) => b.octets - a.octets).slice(0, DOCUMENTS_LISTES_MAX),
  }
}
