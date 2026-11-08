// Composant de présentation : la page d'un document, faite de composants
// Mantine sans réglage. Conteneur générique, il ne sait rien de l'éditeur
// qu'il reçoit (revue R4) ; ses textes lui arrivent traduits. `mention`
// (facultative) signale un mode particulier de la page, par exemple la
// lecture seule.
import { Container, Stack, Group, Title, Text, Badge } from '@mantine/core'

export function PageEdition({ titre, etat, participants, mention, editeur }) {
  return (
    <Container className="page-edition">
      <Stack component="header">
        <Group>
          <Title order={1}>{titre}</Title>
          {mention ? <Badge className="page-edition__mention">{mention}</Badge> : null}
          <Text role="status">{etat}</Text>
        </Group>
        <Text>{participants}</Text>
      </Stack>
      <main role="document">{editeur}</main>
    </Container>
  )
}
