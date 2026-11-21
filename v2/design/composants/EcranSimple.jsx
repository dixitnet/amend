// Composants de présentation : écrans simples (attente, erreur, connexion de
// développement), faits de composants Mantine sans réglage. Ils n'appellent
// rien : la connexion remonte par `surEntrer`. L'écran de connexion porte la
// marque en grand (`nomApplication`, facultatif), comme l'accueil de Docs.
import { Container, Stack, Title, Text, TextInput, Button, List, Alert, Group } from '@mantine/core'
import { Marque } from './Picto.jsx'
import { REGLAGES } from '../reglages.js'

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

/**
 * Le cadre de la page de connexion (Sylvain, 21/11/2026) : son contenu au milieu de l'écran, en hauteur comme
 * en largeur, avec une marge en haut et en bas, sur une colonne étroite. Les écrans qu'il porte (le lien par
 * courriel ; en développement, l'entrée par un nom) y sont l'un sous l'autre.
 */
export function CadreConnexion({ children }) {
  return (
    <Container className="amend-connexion" {...REGLAGES.connexion.page}>
      <Stack {...REGLAGES.connexion.pile}>{children}</Stack>
    </Container>
  )
}

export function EcranConnexion({ nomApplication, titre, explication, libelleNom, libelleBouton, surEntrer }) {
  const soumettre = (e) => {
    e.preventDefault()
    const nom = new FormData(e.currentTarget).get('nom')
    if (String(nom || '').trim()) surEntrer(String(nom).trim())
  }
  return (
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
          <TextInput name="nom" label={libelleNom} autoComplete="name" required autoFocus />
          <Button type="submit">{libelleBouton}</Button>
        </Stack>
      </form>
    </Stack>
  )
}

/**
 * Supprimer son compte (lots du 11/11/2026, règle de la v1) : ce que
 * deviendront ses documents et équipes, groupés ; un refus, s'il y en a un ;
 * la confirmation par l'adresse du compte. Mantine tel quel.
 * @param {{
 *   titre: string, explication: string,
 *   groupes: Array<{ cle: string, titre: string, elements: string[] }>,
 *   refus: string | null, libelleCourriel: string, libelleBouton: string,
 *   libelleRetour: string, surRetour: () => void, surConfirmer: (courriel: string) => void,
 * }} p
 */
export function EcranSuppressionCompte({
  titre,
  explication,
  groupes,
  refus,
  libelleCourriel,
  libelleBouton,
  libelleRetour,
  surRetour,
  surConfirmer,
}) {
  const soumettre = (e) => {
    e.preventDefault()
    surConfirmer(String(new FormData(e.currentTarget).get('courriel') || '').trim())
  }
  return (
    <Container>
      <Stack>
        <Title order={1}>{titre}</Title>
        <Text>{explication}</Text>
        {groupes.map((g) => (
          <Stack key={g.cle}>
            <Title order={2}>{g.titre}</Title>
            <List>
              {g.elements.map((x, i) => (
                <List.Item key={i}>{x}</List.Item>
              ))}
            </List>
          </Stack>
        ))}
        {refus ? <Alert role="alert">{refus}</Alert> : null}
        <form onSubmit={soumettre}>
          <Stack>
            <TextInput name="courriel" type="email" label={libelleCourriel} autoComplete="off" required />
            <Group>
              <Button {...REGLAGES.boutonSecondaire} onClick={surRetour}>
                {libelleRetour}
              </Button>
              <Button type="submit" disabled={Boolean(refus)} {...REGLAGES.boutonDanger}>
                {libelleBouton}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  )
}
