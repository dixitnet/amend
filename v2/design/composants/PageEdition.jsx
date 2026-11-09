// Composant de présentation : la page d'un document, faite de composants
// Mantine sans réglage. Conteneur générique, il ne sait rien de l'éditeur
// qu'il reçoit (revue R4) ; ses textes lui arrivent traduits. `mention`
// (facultative) signale un mode particulier de la page, par exemple la
// lecture seule. `cote` (facultatif) : ce qui accompagne le texte (le panneau
// des suggestions) ; sous le texte, faute d'un réglage décidé pour le mettre à côté.
// `actions` (facultatif) : des boutons dans l'en-tête (l'historique).
// `nomApplication` (facultatif) : la marque en haut de page, picto et nom, comme
// le logo de Docs (sans lien tant qu'il n'y a pas de liste des documents).
import { Container, Stack, Group, Title, Text, Badge } from '@mantine/core'
import { Marque } from './Picto.jsx'

export function PageEdition({ nomApplication, titre, etat, participants, mention, editeur, cote, actions }) {
  return (
    <Container>
      <Stack component="header">
        {nomApplication ? (
          <Text component="div">
            <Marque nom={nomApplication} />
          </Text>
        ) : null}
        <Group>
          <Title order={1}>{titre}</Title>
          {mention ? <Badge>{mention}</Badge> : null}
          <Text role="status">{etat}</Text>
          {actions}
        </Group>
        <Text>{participants}</Text>
      </Stack>
      <main>
        {editeur}
        {cote}
      </main>
    </Container>
  )
}
