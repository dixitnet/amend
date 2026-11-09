// Composant de présentation : la connexion par courriel (lien magique),
// Mantine sans réglage. Il n'appelle rien : l'adresse remonte par `surEnvoyer`.
// `message` (facultatif) : ce qui s'est passé (lien envoyé, erreur).
// `nomApplication` (facultatif) : la marque en grand, comme l'écran de connexion.
import { Container, Stack, Title, Text, TextInput, Button } from '@mantine/core'
import { Marque } from './Picto.jsx'

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
          <Title order={1}>
            <Marque nom={nomApplication} />
          </Title>
        ) : null}
        <Title order={nomApplication ? 2 : 1}>{titre}</Title>
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
