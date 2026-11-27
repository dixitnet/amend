// Les polices d'un modèle, chargées dans le navigateur pour l'aperçu de sa fiche (27/11/2026). Le catalogue ne
// charge ses fichiers que pour composer un PDF ; l'aperçu les demande à l'écran, une fois par famille.
const CHARGEES = new Map()
/** L'allure d'un fichier de police, lue dans son nom (`…-BoldItalic.ttf`). Une approximation, assumée pour un
 * aperçu : un demi-gras (`SemiBold`, celui d'EB Garamond) y tient lieu de gras, comme dans le PDF, et un nom sans
 * marque est pris pour le romain. */
const allure = (adresse) => ({
  weight: /Bold/i.test(adresse) ? 'bold' : 'normal',
  style: /Italic/i.test(adresse) ? 'italic' : 'normal',
})

/**
 * Charge une famille pour l'affichage. Sans effet hors d'un navigateur ; un fichier illisible est ignoré (la
 * police de repli s'affiche).
 * @param {string} famille
 * @param {string[]} fichiers  les adresses de ses fichiers
 * @returns {Promise<void>}
 */
export function chargerPolicePourEcran(famille, fichiers) {
  if (typeof FontFace === 'undefined' || !famille) return Promise.resolve()
  if (!CHARGEES.has(famille))
    CHARGEES.set(
      famille,
      Promise.allSettled(
        fichiers.map(async (adresse) => {
          const police = new FontFace(famille, `url(${JSON.stringify(adresse)})`, allure(adresse))
          document.fonts.add(await police.load())
        }),
      ).then(() => undefined),
    )
  return CHARGEES.get(famille)
}
