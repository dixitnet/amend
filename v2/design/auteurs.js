// La couleur d'une personne (curseur, présence) : une des couleurs de la
// palette de Mantine, stable pour un même identifiant. Le gris et le noir de
// la palette sont laissés de côté : un curseur de ces couleurs se confondrait
// avec le texte. La valeur est la variable de Mantine (`-filled`), qui suit le
// mode clair ou sombre.
import { DEFAULT_THEME } from '@mantine/core'

export const COULEURS_AUTEURS = Object.keys(DEFAULT_THEME.colors).filter((n) => n !== 'gray' && n !== 'dark')

export function couleurAuteur(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) >>> 0
  return `var(--mantine-color-${COULEURS_AUTEURS[h % COULEURS_AUTEURS.length]}-filled)`
}
