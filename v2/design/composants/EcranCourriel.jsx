// Composant de présentation : la connexion par courriel (lien magique),
// Mantine, avec les réglages de la page de connexion (titres). Il n'appelle rien : l'adresse remonte par `surEnvoyer`.
// `message` (facultatif) : ce qui s'est passé (lien envoyé, erreur).
// `nomApplication` (facultatif) : la marque en grand, comme l'écran de connexion.
import { Container, Stack, Title, Text, TextInput, Button } from '@mantine/core'
import { Marque } from './Picto.jsx'
import { REGLAGES } from '../reglages.js'

export function EcranCourriel({
  nomApplication,
  titre,
  explication,
  libelleCourriel,
  libelleBouton,
  message,
  surEnvoyer,
}) {
  const soumettre = (e) => {
    e.preventDefault()
    const courriel = String(new FormData(e.currentTarget).get('courriel') || '').trim()
    if (courriel) surEnvoyer(courriel)
  }
  return (
    <Container>
      <Stack>
        {nomApplication ? (
          <Title order={1} {...REGLAGES.connexion.marque}>
            <Marque nom={nomApplication} />
          </Title>
        ) : null}
        <Title order={nomApplication ? 2 : 1} {...REGLAGES.connexion.titre}>
          {titre}
        </Title>
        <Text>{explication}</Text>
        <form onSubmit={soumettre}>
          <Stack>
            <TextInput name="courriel" type="email" label={libelleCourriel} autoComplete="email" required />
            <Button type="submit">{libelleBouton}</Button>
          </Stack>
        </form>
        {message ? <Text role="status">{message}</Text> : null}
      </Stack>
    </Container>
  )
}
