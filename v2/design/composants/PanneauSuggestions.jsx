// Composant de présentation : le panneau des suggestions (disposition C,
// choix de Sylvain, 09/11/2026), une ligne par suggestion avec Accepter et
// Refuser, et « Tout accepter », « Tout refuser » en tête. Composants Mantine
// sans réglage ; ses textes lui arrivent traduits, les gestes remontent par
// les fonctions de rappel (l'indice de la ligne). Hors relecture, une
// invitation (un texte et un bouton) remplace la liste. `actionsGlobales` :
// « Tout accepter », « Tout refuser » même sans ligne.
import { Stack, Group, Title, Text, Button } from '@mantine/core'

export function PanneauSuggestions({
  titre,
  lignes,
  libelles,
  surAccepter,
  surRefuser,
  surToutAccepter,
  surToutRefuser,
  invitation,
  actionsGlobales = false,
}) {
  return (
    <Stack component="section" aria-label={titre}>
      <Title order={2}>{titre}</Title>
      {invitation ? (
        <>
          <Text>{invitation.texte}</Text>
          {invitation.bouton ? (
            <Group>
              <Button onClick={invitation.surClic}>{invitation.bouton}</Button>
            </Group>
          ) : null}
        </>
      ) : null}
      {lignes.length || actionsGlobales ? (
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
              {/* Un nom par ligne pour les lecteurs d'écran (audit du 10/11/2026). */}
              <Button aria-label={libelles.accepterDe(l.texte)} onClick={() => surAccepter(i)}>
                {libelles.accepter}
              </Button>
              <Button aria-label={libelles.refuserDe(l.texte)} onClick={() => surRefuser(i)}>
                {libelles.refuser}
              </Button>
            </Group>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
