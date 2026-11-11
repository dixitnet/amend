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
import { useEffect } from 'react'
import { MantineProvider, createTheme, mergeThemeOverrides } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { REGLAGES } from './reglages.js'

// Un thème Mantine par esthétique : le thème commun, complété par le sien.
const THEMES = Object.fromEntries(
  Object.entries(REGLAGES.esthetiques).map(([nom, e]) => [
    nom,
    createTheme(mergeThemeOverrides(REGLAGES.theme, e.theme)),
  ]),
)

const connue = (nom) => (nom && THEMES[nom] ? nom : REGLAGES.esthetique)

// L'esthétique est portée par la racine du document (comme le schéma clair ou
// sombre de Mantine), pour les feuilles et pour ce qui s'ouvre hors de
// l'application (fenêtres, menus). Posée dès le chargement, sans attendre le
// premier rendu.
const poser = (nom) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.amendEsthetique = nom
}
poser(REGLAGES.esthetique)

/**
 * `esthetique` : le nom d'une esthétique de REGLAGES.esthetiques ; absent ou
 * inconnu, celle de l'instance (REGLAGES.esthetique).
 */
export function CadreDesign({ esthetique, children }) {
  const nom = connue(esthetique)
  useEffect(() => poser(nom), [nom])
  return (
    <MantineProvider theme={THEMES[nom]} {...REGLAGES.fournisseur}>
      <Notifications />
      {children}
    </MantineProvider>
  )
}
