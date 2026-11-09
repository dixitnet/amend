// Composant de présentation : la liste des documents, sur le modèle du
// serveur de fichiers (étape 6c) : des onglets (Mes documents, Partagé avec
// moi, une par équipe), un chemin de dossiers, des boutons, un panneau
// facultatif (les membres d'une équipe), un tableau de lignes (dossiers et
// documents, chacun un lien) avec leurs actions. Mantine sans réglage ;
// textes traduits ; les gestes remontent par les fonctions de rappel. Titre et
// onglets facultatifs : dans la coquille des formats M et L, le bandeau et le
// volet gauche les portent.
import {
  Container,
  Stack,
  Group,
  Title,
  Text,
  SegmentedControl,
  NativeSelect,
  Table,
  Anchor,
  Breadcrumbs,
  Paper,
} from '@mantine/core'
import { Marque } from './Picto.jsx'
import { useFormatS } from '../formats.js'

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
  const formatS = useFormatS()
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
        {/* Format S : les onglets ne tiennent pas en largeur ; une liste déroulante (plan du format S, 5.1). */}
        {!onglets ? null : formatS ? (
          <NativeSelect data={onglets} value={onglet} onChange={(e) => surOnglet(e.currentTarget.value)} />
        ) : (
          <SegmentedControl data={onglets} value={onglet} onChange={surOnglet} />
        )}
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
        {lignes.length && formatS ? (
          <Stack>
            {lignes.map((l) => (
              <Paper key={l.cle} component="article">
                <Anchor href={l.href}>{l.nom}</Anchor>
                <Text>{l.cellules.filter(Boolean).join(' · ')}</Text>
                {l.actions ? <Group>{l.actions}</Group> : null}
              </Paper>
            ))}
          </Stack>
        ) : lignes.length ? (
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
