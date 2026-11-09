// Composant de présentation : un bouton qui ouvre ou ferme quelque chose (le
// panneau de l'historique). Mantine sans réglage ; l'état se lit par
// `aria-pressed`. Le geste remonte par `surBasculer`.
import { Button } from '@mantine/core'

export function BoutonBascule({ libelle, actif, surBasculer }) {
  return (
    <Button aria-pressed={actif} onClick={surBasculer}>
      {libelle}
    </Button>
  )
}
