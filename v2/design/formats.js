// Le format d'écran (couche design) : le format S (téléphone) sous le seuil
// `sm` de Mantine (48 em, 768 px, le même que Docs), sinon L et M (réglage
// css.telephone.bascule, ADR 0008). La règle est ici, pas dans l'application.
import { useMantineTheme } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'

/** `true` en format S. */
export function useFormatS() {
  const { breakpoints } = useMantineTheme()
  return useMediaQuery(`(width < ${breakpoints.sm})`, false, { getInitialValueInEffect: false }) === true
}
