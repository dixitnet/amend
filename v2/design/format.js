// Le format d'écran, vu du design (formats M et L, docs/v2-formats-M-L.md) :
// `etroit` sous le seuil où un seul volet tient (point de rupture de Mantine,
// réglage `coquille.unVolet`), `tactile` sur un écran tactile (l'iPad), comme
// le `hasCoarsePointer` de Docs. L'application s'en sert sans importer Mantine.
import { useMantineTheme } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { REGLAGES } from './reglages.js'

const IMMEDIAT = { getInitialValueInEffect: false }

export function useFormat() {
  const theme = useMantineTheme()
  const large = useMediaQuery(`(min-width: ${theme.breakpoints[REGLAGES.coquille.unVolet]})`, true, IMMEDIAT)
  const tactile = useMediaQuery('(pointer: coarse)', false, IMMEDIAT)
  return { etroit: !large, tactile }
}
