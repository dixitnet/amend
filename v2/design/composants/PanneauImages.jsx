// Composant de présentation de l'analyse des images orphelines du back-office
// (14/11/2026) : un bouton, puis le rapport (images en base, utilisées,
// orphelines, récentes) et les documents qui en gardent le plus. Mantine sans
// réglage ; il n'appelle rien : le rapport et les textes viennent de
// l'application.
import { Stack, Text, Title, Button, Table } from '@mantine/core'

/**
 * @param {{
 *   libelles: { intro: string, analyser: string, titreRapport: string, colonnes: { rubrique: string, nombre: string, poids: string },
 *     titreDocuments: string, colonnesDocuments: { document: string, nombre: string, poids: string } },
 *   enCours: boolean, message?: string | null, surAnalyser: () => void,
 *   rapport?: {
 *     lignes: Array<{ cle: string, libelle: string, nombre: string, poids: string }>,
 *     avertissement?: string | null, note: string,
 *     documents: Array<{ cle: string, nombre: string, poids: string }>,
 *   } | null,
 * }} props
 */
export function PanneauImages({ libelles, enCours, message, surAnalyser, rapport }) {
  return (
    <Stack>
      <Text>{libelles.intro}</Text>
      <Button loading={enCours} onClick={surAnalyser}>
        {libelles.analyser}
      </Button>
      {message ? <Text role="status">{message}</Text> : null}
      {rapport ? (
        <>
          <Title order={3}>{libelles.titreRapport}</Title>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{libelles.colonnes.rubrique}</Table.Th>
                <Table.Th>{libelles.colonnes.nombre}</Table.Th>
                <Table.Th>{libelles.colonnes.poids}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rapport.lignes.map((l) => (
                <Table.Tr key={l.cle}>
                  <Table.Td>{l.libelle}</Table.Td>
                  <Table.Td>{l.nombre}</Table.Td>
                  <Table.Td>{l.poids}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {rapport.avertissement ? <Text role="note">{rapport.avertissement}</Text> : null}
          <Text>{rapport.note}</Text>
          {rapport.documents.length ? (
            <>
              <Title order={3}>{libelles.titreDocuments}</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{libelles.colonnesDocuments.document}</Table.Th>
                    <Table.Th>{libelles.colonnesDocuments.nombre}</Table.Th>
                    <Table.Th>{libelles.colonnesDocuments.poids}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rapport.documents.map((d) => (
                    <Table.Tr key={d.cle}>
                      <Table.Td>{d.cle}</Table.Td>
                      <Table.Td>{d.nombre}</Table.Td>
                      <Table.Td>{d.poids}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </>
          ) : null}
        </>
      ) : null}
    </Stack>
  )
}
