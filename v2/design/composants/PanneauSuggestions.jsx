// Composant de présentation : le panneau des suggestions (disposition C,
// choix de Sylvain, 09/11/2026), une ligne par suggestion avec Accepter et
// Refuser, et « Tout accepter », « Tout refuser » en tête. Composants Mantine
// sans réglage ; ses textes lui arrivent traduits, les gestes remontent par
// les fonctions de rappel (l'indice de la ligne).
import { Stack, Group, Title, Text, Button } from '@mantine/core'

export function PanneauSuggestions({
  titre,
  lignes,
  libelles,
  surAccepter,
  surRefuser,
  surToutAccepter,
  surToutRefuser,
}) {
  return (
    <Stack component="section" aria-label={titre}>
      <Title order={2}>{titre}</Title>
      {lignes.length ? (
        <Group>
          <Button onClick={surToutAccepter}>{libelles.toutAccepter}</Button>
          <Button onClick={surToutRefuser}>{libelles.toutRefuser}</Button>
        </Group>
      ) : null}
      <Stack component="ol">
        {lignes.map((l, i) => (
          <Stack component="li" key={l.cle}>
            <Text>{l.texte}</Text>
            <Group>
              <Button onClick={() => surAccepter(i)}>{libelles.accepter}</Button>
              <Button onClick={() => surRefuser(i)}>{libelles.refuser}</Button>
            </Group>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
