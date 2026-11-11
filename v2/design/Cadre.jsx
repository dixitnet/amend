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
import './feuilles/esthetique-atelier.css'
import { MantineProvider, createTheme, mergeThemeOverrides } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { REGLAGES } from './reglages.js'

// L'esthétique de l'instance (REGLAGES.esthetique) : le thème commun, complété
// par le sien. Le choix au back-office viendra avec son lot (ADR 0008).
const ESTHETIQUE = REGLAGES.esthetique
const theme = createTheme(mergeThemeOverrides(REGLAGES.theme, REGLAGES.esthetiques[ESTHETIQUE].theme))

// L'esthétique est portée par la racine du document (comme le schéma clair ou
// sombre de Mantine), pour les feuilles de design/feuilles/. Posée dès le
// chargement, sans attendre le premier rendu ; pas de document lors du rendu
// sans navigateur des tests du design (tests/design/).
if (typeof document !== 'undefined') document.documentElement.dataset.amendEsthetique = ESTHETIQUE

export function CadreDesign({ children }) {
  return (
    <MantineProvider theme={theme} {...REGLAGES.fournisseur}>
      <Notifications />
      {children}
    </MantineProvider>
  )
}
