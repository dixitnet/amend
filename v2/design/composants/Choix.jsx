// Composant de présentation : un choix dans une liste (Mantine Select sans
// réglage), sans valeur retenue : chaque choix est un geste (« déplacer vers »).
import { Select } from '@mantine/core'

/** @param {{ libelle: string, options: Array<{ value: string, label: string }>, surChoix: (v: string) => void }} p */
export const Choix = ({ libelle, options, surChoix }) => (
  <Select
    aria-label={libelle}
    placeholder={libelle}
    data={options}
    value={null}
    onChange={(v) => v !== null && surChoix(v)}
  />
)
