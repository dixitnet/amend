// Composant de présentation : le back-office de l'instance, en fiche (Sylvain, 27/11/2026 : « Reprends le reste
// du back en fonction de ce design », maquette validée « Ok pour tout »). Une page, sans menu : les chiffres de
// l'instance en cartes (d'après « StatsGrid », ui.mantine.dev, MIT), puis des lignes en clair sous des rubriques.
// Chaque ligne dit son état et s'ouvre pour être réglée, une à la fois (Accordion de Mantine, comme la fiche d'un
// modèle). Mantine seul ; réglages `admin.*` et `fiche.*` (ADR 0008) ; textes traduits.
import { useState } from 'react'
import { Container, Stack, Group, Title, Text, Table, NativeSelect, SimpleGrid, Paper, Accordion } from '@mantine/core'
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
 * @param {{ nomApplication?: string, titre: string, actions?: any, message?: string | null,
 *   chiffres?: Array<{ libelle: string, valeur: string }>,
 *   rubriques: Array<{ titre: string, lignes: Array<{ cle: string, nom: string, resume: string, vide?: string, contenu?: any,
 *     courbes?: Array<{ libelle: string, legende?: string, points: Array<{ x: number, y: number }> }>,
 *     lignes?: Array<{ libelle: string, valeur?: string, choix?: object }> }> }>,
 *   ligneInitiale?: string | null }} p
 *   une ligne de la fiche : son nom, son résumé (ce qu'elle dit fermée), et ce qu'elle montre ouverte : des
 *   courbes, un tableau libellé / valeur (une valeur, ou un choix `{ options: [{ valeur, libelle, desactive? }],
 *   valeur, surChange }`), un contenu libre ; `vide` : le texte montré quand elle n'a rien de tout cela ;
 *   `ligneInitiale` : la ligne ouverte à l'arrivée
 */
export function PageAdministration({
  nomApplication,
  titre,
  actions,
  message,
  chiffres = [],
  rubriques,
  ligneInitiale = null,
}) {
  const [ouverte, setOuverte] = useState(ligneInitiale)
  const ligne = (l) => {
    const tableau = l.lignes ?? []
    return (
      <Accordion.Item key={l.cle} value={l.cle}>
        <Accordion.Control>
          <Text>{l.nom}</Text>
          <Text {...REGLAGES.fiche.resume}>{l.resume}</Text>
        </Accordion.Control>
        <Accordion.Panel>
          {/* Le contenu d'une ligne fermée n'est pas monté. */}
          {ouverte === l.cle ? (
            <Stack>
              {(l.courbes ?? []).map((c) => (
                <Courbe key={c.libelle} libelle={c.libelle} legende={c.legende} points={c.points} />
              ))}
              {l.vide && !tableau.length && !l.courbes?.length && !l.contenu ? <Text>{l.vide}</Text> : null}
              {l.contenu ?? null}
              {tableau.length ? <Lignes lignes={tableau} /> : null}
            </Stack>
          ) : null}
        </Accordion.Panel>
      </Accordion.Item>
    )
  }
  return (
    <Container>
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
        {chiffres.length ? <Chiffres lignes={chiffres} /> : null}
        <Accordion value={ouverte} onChange={setOuverte} {...REGLAGES.fiche.lignes}>
          {rubriques.map((r) => (
            <section key={r.titre} aria-label={r.titre}>
              <Title order={2} {...REGLAGES.fiche.rubrique}>
                {r.titre}
              </Title>
              {r.lignes.map(ligne)}
            </section>
          ))}
        </Accordion>
      </Stack>
    </Container>
  )
}
