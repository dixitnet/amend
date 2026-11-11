// Composant de présentation : une courbe simple (le back-office, mémoire des
// processus ; Sylvain, 11/11/2026). Un tracé, dans la couleur du texte, sur
// toute la largeur ; sa proportion est un réglage (`courbe`, ADR 0008). Les
// points arrivent déjà ramenés entre 0 et 1 ; le texte qui la décrit aussi.
import { Stack, Text } from '@mantine/core'
import { REGLAGES } from '../reglages.js'

/**
 * @param {{ libelle: string, legende?: string,
 *   points: Array<{ x: number, y: number }> }} p
 *   `libelle` : le nom lu par un lecteur d'écran ; `legende` : le texte affiché
 *   dessous (étendue des valeurs, période) ; `points` : x et y entre 0 et 1
 *   (y = 1 en haut), dans l'ordre du temps
 */
export function Courbe({ libelle, legende, points }) {
  const { largeur, hauteur } = REGLAGES.courbe
  const trace = points.map((p) => `${(p.x * largeur).toFixed(2)},${((1 - p.y) * hauteur).toFixed(2)}`).join(' ')
  return (
    <Stack component="figure">
      <svg
        role="img"
        aria-label={libelle}
        viewBox={`0 0 ${largeur} ${hauteur}`}
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
      >
        <polyline points={trace} vectorEffect="non-scaling-stroke" />
      </svg>
      {legende ? <Text component="figcaption">{legende}</Text> : null}
    </Stack>
  )
}
