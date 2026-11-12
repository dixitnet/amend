// Composant de présentation : le connecteur Claude du back-office (12/11/2026,
// docs/v2-connecteur-plan.md). Une explication, l'état de l'adresse secrète,
// l'adresse elle-même juste après sa création (une seule fois), et les gestes
// (créer ou renouveler, révoquer). Mantine tel quel ; textes traduits ; les
// gestes remontent par les fonctions de rappel.
import { Stack, Group, Text, TextInput, Button, CopyButton } from '@mantine/core'
import { REGLAGES } from '../reglages.js'

/**
 * @param {{ explication: string, etat: string, adresse?: string | null, avertissement?: string,
 *   actif: boolean, libelles: { creer: string, renouveler: string, revoquer: string, copier: string, copie: string, adresse: string },
 *   surCreer: () => void, surRevoquer: () => void }} p
 */
export function PanneauConnecteur({
  explication,
  etat,
  adresse,
  avertissement,
  actif,
  libelles,
  surCreer,
  surRevoquer,
}) {
  return (
    <Stack>
      <Text>{explication}</Text>
      <Text>{etat}</Text>
      {adresse ? (
        <Stack>
          <Group>
            <TextInput label={libelles.adresse} value={adresse} readOnly />
            <CopyButton value={adresse}>
              {({ copied, copy }) => <Button onClick={copy}>{copied ? libelles.copie : libelles.copier}</Button>}
            </CopyButton>
          </Group>
          {avertissement ? <Text>{avertissement}</Text> : null}
        </Stack>
      ) : null}
      <Group>
        <Button onClick={surCreer}>{actif ? libelles.renouveler : libelles.creer}</Button>
        {actif ? (
          <Button {...REGLAGES.boutonDanger} onClick={surRevoquer}>
            {libelles.revoquer}
          </Button>
        ) : null}
      </Group>
    </Stack>
  )
}
