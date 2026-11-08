// Composants de présentation : écrans simples (attente, erreur, connexion de
// développement), faits de composants Mantine sans réglage. Ils n'appellent
// rien : la connexion remonte par `surEntrer`.
import { Container, Stack, Title, Text, TextInput, Button } from '@mantine/core'

export function EcranMessage({ titre, texte }) {
  return (
    <Container>
      <Stack>
        {titre ? <Title order={1}>{titre}</Title> : null}
        <Text role="status">{texte}</Text>
      </Stack>
    </Container>
  )
}

export function EcranConnexion({ titre, explication, libelleNom, libelleBouton, surEntrer }) {
  const soumettre = (e) => {
    e.preventDefault()
    const nom = new FormData(e.currentTarget).get('nom')
    if (String(nom || '').trim()) surEntrer(String(nom).trim())
  }
  return (
    <Container>
      <Stack>
        <Title order={1}>{titre}</Title>
        <Text>{explication}</Text>
        <form onSubmit={soumettre}>
          <Stack>
            <TextInput name="nom" label={libelleNom} autoComplete="name" required autoFocus />
            <Button type="submit">{libelleBouton}</Button>
          </Stack>
        </form>
      </Stack>
    </Container>
  )
}
