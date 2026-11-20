// La couleur d'une personne (curseur, présence, corrections) : une des couleurs
// de la palette de Mantine, stable pour un même identifiant. Le gris et le noir
// de la palette sont laissés de côté : un curseur de ces couleurs se confondrait
// avec le texte. La valeur est la variable de Mantine (`-filled`), qui suit le
// mode clair ou sombre.
//
// Couleurs réservées (Sylvain, 19/11/2026) : le jaune aux commentaires (le
// surlignage de BlockNote, comme Docs) et le vert du picto d'amend.ink aux
// agents, Margo et Claude ; le citron vert et le sarcelle, voisins du vert,
// sortent aussi de la palette des personnes. Restent huit teintes.
import { DEFAULT_THEME } from '@mantine/core'

const RESERVEES = ['gray', 'dark', 'yellow', 'green', 'lime', 'teal']
const COULEURS_AUTEURS = Object.keys(DEFAULT_THEME.colors).filter((n) => !RESERVEES.includes(n))

export function couleurAuteur(id) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.codePointAt(0)) >>> 0
  return `var(--mantine-color-${COULEURS_AUTEURS[h % COULEURS_AUTEURS.length]}-filled)`
}

/** La couleur des agents (Margo, Claude par le connecteur) : le vert du picto
 * d'amend.ink (nuance 8 du vert de Mantine), la même pour les deux. */
export const COULEUR_AGENTS = 'var(--mantine-color-green-8)'
