// Composant de présentation : le partage d'un document (comme le partage de
// Docs) : inviter par courriel avec un rôle, les accès et leurs rôles, les
// invitations en attente, le lien de partage. Mantine sans réglage ; textes
// traduits ; les gestes remontent par les fonctions de rappel.
import { Stack, Group, Title, Text, TextInput, Select, Button } from '@mantine/core'

export function PanneauPartage({
  titre,
  libelles,
  roles,
  rolesDuLien,
  acces,
  invitations,
  lien,
  adresseDuLien,
  message,
  surInviter,
  surChangerRole,
  surRetirer,
  surRetirerInvitation,
  surChangerLien,
}) {
  const soumettre = (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const courriel = String(f.get('courriel') || '').trim()
    if (courriel) surInviter(courriel, String(f.get('role')))
  }
  return (
    <Stack component="section" aria-label={titre}>
      <Title order={2}>{titre}</Title>
      <form onSubmit={soumettre}>
        <Group>
          <TextInput name="courriel" type="email" label={libelles.courriel} required />
          <Select name="role" label={libelles.role} data={roles} defaultValue={roles[0]?.value} allowDeselect={false} />
          <Button type="submit">{libelles.inviter}</Button>
        </Group>
      </form>
      {message ? <Text role="status">{message}</Text> : null}
      <Stack component="ul">
        {acces.map((a) => (
          <Group component="li" key={a.cle}>
            <Text>{a.nom}</Text>
            <Select
              aria-label={libelles.roleDe(a.nom)}
              data={a.roles}
              value={a.role}
              allowDeselect={false}
              onChange={(r) => surChangerRole(a.cle, r)}
            />
            <Button onClick={() => surRetirer(a.cle)}>{libelles.retirer}</Button>
          </Group>
        ))}
        {invitations.map((i) => (
          <Group component="li" key={i.courriel}>
            <Text>{i.texte}</Text>
            <Button onClick={() => surRetirerInvitation(i.courriel)}>{libelles.annuler}</Button>
          </Group>
        ))}
      </Stack>
      <Select label={libelles.lien} data={rolesDuLien} value={lien} allowDeselect={false} onChange={surChangerLien} />
      {adresseDuLien ? <TextInput label={libelles.adresseDuLien} value={adresseDuLien} readOnly /> : null}
    </Stack>
  )
}
