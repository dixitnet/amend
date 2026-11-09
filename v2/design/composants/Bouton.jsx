// Composant de présentation : un bouton, Mantine sans réglage.
import { Button } from '@mantine/core'

export const Bouton = ({ libelle, surClic }) => <Button onClick={surClic}>{libelle}</Button>
