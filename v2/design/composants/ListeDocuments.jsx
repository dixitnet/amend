// Composant de présentation : la liste des documents, sur le modèle du
// serveur de fichiers (étape 6c) : des onglets (Mes documents, Partagé avec
// moi, une par équipe), un chemin de dossiers, des boutons, un panneau
// facultatif (les membres d'une équipe), un tableau de lignes (dossiers et
// documents, chacun un lien) avec leurs actions. Mantine sans réglage ;
// textes traduits ; les gestes remontent par les fonctions de rappel. Titre et
// onglets facultatifs : dans la coquille, le bandeau et le volet les portent.
import { Container, Stack, Group, Title, Text, SegmentedControl, Table, Anchor, Breadcrumbs } from '@mantine/core'
import { Marque } from './Picto.jsx'

/**
 * @param {{
 *   nomApplication?: string, titre?: string, actions?: any,
 *   onglets?: Array<{ value: string, label: string }>, onglet?: string, surOnglet?: (o: string) => void,
 *   libelleChemin: string, chemin?: Array<{ cle: string, libelle: string, href: string }>,
 *   boutons?: any, panneau?: any, message?: string | null,
 *   colonnes: string[], lignes: Array<{ cle: string, nom: string, href: string, cellules: string[], actions?: any }>,
 *   vide: string,
 * }} p
 */
export function ListeDocuments({
  nomApplication,
  titre,
  actions,
  onglets,
  onglet,
  surOnglet,
  libelleChemin,
  chemin,
  boutons,
  panneau,
  message,
  colonnes,
  lignes,
  vide,
}) {
  return (
    <Container>
      <Stack>
        {nomApplication ? (
          <Text component="div">
            <Marque nom={nomApplication} />
          </Text>
        ) : null}
        {titre ? (
          <Group>
            <Title order={1}>{titre}</Title>
            {actions}
          </Group>
        ) : null}
        {onglets ? <SegmentedControl data={onglets} value={onglet} onChange={surOnglet} /> : null}
        {chemin?.length ? (
          <Breadcrumbs component="nav" aria-label={libelleChemin}>
            {chemin.map((c) => (
              <Anchor key={c.cle} href={c.href}>
                {c.libelle}
              </Anchor>
            ))}
          </Breadcrumbs>
        ) : null}
        {boutons ? <Group>{boutons}</Group> : null}
        {panneau}
        {message ? <Text role="status">{message}</Text> : null}
        {lignes.length ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                {colonnes.map((c, i) => (
                  <Table.Th key={i}>{c}</Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lignes.map((l) => (
                <Table.Tr key={l.cle}>
                  <Table.Td>
                    <Anchor href={l.href}>{l.nom}</Anchor>
                  </Table.Td>
                  {l.cellules.map((c, i) => (
                    <Table.Td key={i}>{c}</Table.Td>
                  ))}
                  <Table.Td>
                    <Group>{l.actions}</Group>
                  </Table.Td>
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
