// Le cadre de design de l'application : Mantine, et les feuilles de style de
// Mantine et de BlockNote telles que leurs auteurs les livrent (installation
// de référence de BlockNote). L'éditeur BlockNote placé dedans reprend ce
// fournisseur Mantine au lieu de créer le sien.
import '@mantine/core/styles.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
// Nos réglages décidés (ADR 0008), après les feuilles des fondations.
import './feuilles/editeur.css'
import './feuilles/picto.css'
import './feuilles/coquille.css'
import { MantineProvider, createTheme } from '@mantine/core'
import { REGLAGES } from './reglages.js'

const theme = createTheme(REGLAGES.theme)

export function CadreDesign({ children }) {
  return (
    <MantineProvider theme={theme} {...REGLAGES.fournisseur}>
      {children}
    </MantineProvider>
  )
}
