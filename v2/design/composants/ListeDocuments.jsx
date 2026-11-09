// Composant de présentation : mes documents, avec un filtre (tous, créés par
// moi, partagés avec moi) et la création d'un document. Mantine sans réglage ;
// textes traduits ; chaque document est un lien vers son adresse.
import { Container, Stack, Group, Title, Text, Button, SegmentedControl, Table, Anchor } from '@mantine/core'
import { Marque } from './Picto.jsx'

/**
 * @param {{ titre: string, libelleNouveau: string, filtres: Array<{ value: string, label: string }>, filtre: string,
 *   colonnes: { titre: string, role: string, date: string }, documents: Array<{ id: string, titre: string, role: string, date: string }>,
 *   vide: string, actions?: any, nomApplication?: string, surFiltre: (f: string) => void, surNouveau: () => void }} p
 */
export function ListeDocuments({
  nomApplication,
  titre,
  libelleNouveau,
  filtres,
  filtre,
  colonnes,
  documents,
  vide,
  actions,
  surFiltre,
  surNouveau,
}) {
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
          <Button onClick={surNouveau}>{libelleNouveau}</Button>
          {actions}
        </Group>
        <SegmentedControl data={filtres} value={filtre} onChange={surFiltre} />
        {documents.length ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{colonnes.titre}</Table.Th>
                <Table.Th>{colonnes.role}</Table.Th>
                <Table.Th>{colonnes.date}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {documents.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>
                    <Anchor href={`#${encodeURIComponent(d.id)}`}>{d.titre}</Anchor>
                  </Table.Td>
                  <Table.Td>{d.role}</Table.Td>
                  <Table.Td>{d.date}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text>{vide}</Text>
        )}
      </Stack>
    </Container>
  )
}
