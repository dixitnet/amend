// Composant de présentation : le back-office de l'instance, en rubriques
// (titre, courbes éventuelles, lignes libellé / valeur). Mantine sans réglage ;
// textes traduits.
import { Container, Stack, Group, Title, Text, Table, NativeSelect } from '@mantine/core'
import { Marque } from './Picto.jsx'
import { Courbe } from './Courbe.jsx'

/**
 * Une ligne porte une valeur, ou un choix (le modèle de Margo, étape 8) :
 * `choix: { options: [{ valeur, libelle, desactive? }], valeur, surChange }`.
 * @param {{ nomApplication?: string, titre: string, actions?: any, message?: string | null,
 *   rubriques: Array<{ titre: string, vide?: string,
 *     courbes?: Array<{ libelle: string, legende?: string, points: Array<{ x: number, y: number }> }>,
 *     lignes: Array<{ libelle: string, valeur?: string, choix?: object }> }> }} p
 *   `vide` : le texte montré quand la rubrique n'a ni courbe ni ligne
 */
export function PageAdministration({ nomApplication, titre, actions, message, rubriques }) {
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
        {rubriques.map((r) => (
          <Stack key={r.titre} component="section" aria-label={r.titre}>
            <Title order={2}>{r.titre}</Title>
            {(r.courbes ?? []).map((c) => (
              <Courbe key={c.libelle} libelle={c.libelle} legende={c.legende} points={c.points} />
            ))}
            {r.vide && !r.lignes.length && !r.courbes?.length ? <Text>{r.vide}</Text> : null}
            <Table>
              <Table.Tbody>
                {r.lignes.map((l, i) => (
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
          </Stack>
        ))}
      </Stack>
    </Container>
  )
}
