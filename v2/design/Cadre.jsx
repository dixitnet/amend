// Le cadre de design de l'application : Mantine, et les feuilles de style de
// Mantine et de BlockNote telles que leurs auteurs les livrent (installation
// de référence de BlockNote). L'éditeur BlockNote placé dedans reprend ce
// fournisseur Mantine au lieu de créer le sien.
import '@mantine/core/styles.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import '@mantine/notifications/styles.css'
// Nos réglages décidés (ADR 0008), après les feuilles des fondations.
import './feuilles/editeur.css'
import './feuilles/picto.css'
import './feuilles/coquille.css'
import './feuilles/telephone.css'
import './feuilles/interface-atelier.css'
import { useEffect, useMemo } from 'react'
import { MantineProvider, createTheme, mergeThemeOverrides } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { REGLAGES } from './reglages.js'
import { apparenceRetenue } from './apparence.js'

/** Le thème de Mantine d'une couleur : le thème commun, avec elle comme couleur principale. */
function themeDe(couleur) {
  const c = REGLAGES.couleurs[couleur]
  return createTheme(
    mergeThemeOverrides(REGLAGES.theme, {
      colors: { [couleur]: c.palette },
      primaryColor: couleur,
      primaryShade: c.nuance,
      autoContrast: c.contrasteAuto === true,
    }),
  )
}

// Le modèle d'interface est porté par la racine du document (comme le schéma
// clair ou sombre de Mantine), pour les feuilles de design/feuilles/. Posé dès
// le chargement avec celui par défaut ; pas de document lors du rendu sans
// navigateur des tests du design (tests/design/).
const poserModele = (modele) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.amendInterface = modele
}
poserModele(REGLAGES.apparence.parDefaut.modele)

/**
 * `apparence` : `{ modele, couleur }` de l'instance (back-office) ; absente,
 * ou un nom inconnu : l'apparence par défaut.
 */
export function CadreDesign({ apparence, children }) {
  const { modele, couleur } = apparenceRetenue(apparence)
  const theme = useMemo(() => themeDe(couleur), [couleur])
  useEffect(() => poserModele(modele), [modele])
  return (
    <MantineProvider theme={theme} {...REGLAGES.fournisseur}>
      <Notifications />
      {children}
    </MantineProvider>
  )
}
