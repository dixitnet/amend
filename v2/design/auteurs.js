// La couleur d'une personne : un emplacement de jeton (--auteur-1 à 8), stable
// pour un même identifiant. La valeur reste une variable CSS : un thème la
// change sans toucher au code.
const EMPLACEMENTS = 8

export function couleurAuteur(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) >>> 0
  return `var(--auteur-${(h % EMPLACEMENTS) + 1})`
}
