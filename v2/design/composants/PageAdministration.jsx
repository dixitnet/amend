// Composant de présentation : le back-office de l'instance, en rubriques
// (titre, courbes éventuelles, lignes libellé / valeur, contenu libre). Mise
// en page d'après les blocs gratuits de Mantine (ui.mantine.dev, MIT :
// « NavbarSimple », « StatsGrid ») : un menu des rubriques à gauche (en haut au
// téléphone), la rubrique choisie à droite ; une rubrique `chiffres` montre ses
// lignes en cartes (Sylvain, 12/11/2026 : « une brique graphique minimaliste
// pour le back »). Mantine seul ; réglages `admin.*` (ADR 0008) ; textes traduits.
import { useState } from 'react'
import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  Table,
  NativeSelect,
  Grid,
  NavLink,
  SimpleGrid,
  Paper,
} from '@mantine/core'
import { REGLAGES } from '../reglages.js'
import { Marque } from './Picto.jsx'
import { Courbe } from './Courbe.jsx'

/** Une ligne en tableau : sa valeur, ou un choix. */
function Lignes({ lignes }) {
  return (
    <Table>
      <Table.Tbody>
        {lignes.map((l, i) => (
          <Table.Tr key={`${i}-${l.libelle}`}>
            <Table.Th>{l.libelle}</Table.Th>
            <Table.Td>
              {l.choix ? (
                <NativeSelect
                  aria-label={l.libelle}
                  value={l.choix.valeur}
                  onChange={(e) => l.choix.surChange(e.currentTarget.value)}
                  data={l.choix.options.map((o) => ({
                    value: o.valeur,
                    label: o.libelle,
                    disabled: o.desactive === true,
                  }))}
                />
              ) : (
                l.valeur
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}

/** Les lignes d'une rubrique en cartes de chiffres (« StatsGrid »). */
function Chiffres({ lignes }) {
  const { grille, carte, libelle, valeur } = REGLAGES.admin.chiffres
  return (
    <SimpleGrid {...grille}>
      {lignes.map((l, i) => (
        <Paper key={`${i}-${l.libelle}`} {...carte}>
          <Text {...libelle}>{l.libelle}</Text>
          <Text {...valeur}>{l.valeur}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  )
}

/**
 * Une ligne porte une valeur, ou un choix (le modèle de Margo, étape 8) :
 * `choix: { options: [{ valeur, libelle, desactive? }], valeur, surChange }`.
 * @param {{ nomApplication?: string, titre: string, actions?: any, message?: string | null,
 *   rubriques: Array<{ titre: string, vide?: string, chiffres?: boolean, contenu?: any,
 *     courbes?: Array<{ libelle: string, legende?: string, points: Array<{ x: number, y: number }> }>,
 *     lignes: Array<{ libelle: string, valeur?: string, choix?: object }> }> }} p
 *   `vide` : le texte montré quand la rubrique n'a ni courbe, ni ligne, ni contenu ;
 *   `chiffres` : les lignes en cartes plutôt qu'en tableau
 */
export function PageAdministration({ nomApplication, titre, actions, message, rubriques }) {
  const [choisie, setChoisie] = useState(rubriques[0]?.titre ?? null)
  const r = rubriques.find((x) => x.titre === choisie) ?? rubriques[0]
  const { menu, contenu } = REGLAGES.admin.colonnes
  return (
    <Container {...REGLAGES.admin.page}>
      <Stack>
        {nomApplication ? (
          <Text component="div">
            <Marque nom={nomApplication} />
          </Text>
        ) : null}
        <Group>
          <Title order={1}>{titre}</Title>
          {actions}
        </Group>
        {message ? <Text role="status">{message}</Text> : null}
        <Grid>
          <Grid.Col {...menu}>
            <nav aria-label={titre}>
              {rubriques.map((x) => (
                <NavLink
                  key={x.titre}
                  component="button"
                  label={x.titre}
                  active={x.titre === r?.titre}
                  aria-current={x.titre === r?.titre ? 'page' : undefined}
                  onClick={() => setChoisie(x.titre)}
                />
              ))}
            </nav>
          </Grid.Col>
          <Grid.Col {...contenu}>
            {r ? (
              <Stack key={r.titre} component="section" aria-label={r.titre}>
                <Title order={2}>{r.titre}</Title>
                {(r.courbes ?? []).map((c) => (
                  <Courbe key={c.libelle} libelle={c.libelle} legende={c.legende} points={c.points} />
                ))}
                {r.vide && !r.lignes.length && !r.courbes?.length && !r.contenu ? <Text>{r.vide}</Text> : null}
                {r.contenu ?? null}
                {r.lignes.length ? r.chiffres ? <Chiffres lignes={r.lignes} /> : <Lignes lignes={r.lignes} /> : null}
              </Stack>
            ) : null}
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  )
}
