// Composant de présentation : la page d'un document en format S (téléphone,
// vertical), d'après la maquette validée (docs/v2-format-S.md) : un bandeau
// fixe (volet gauche, titre, « Terminer » en modification, menu « … », volet
// droit tout à droite), le texte, deux tiroirs à onglets et, au besoin, un
// panneau plein écran (le partage). Mantine et Tabler tels quels ; réglages
// décidés dans design/feuilles/telephone.css (ADR 0008) ; textes traduits.
import { ActionIcon, Button, Drawer, Menu, Modal, NavLink, Tabs, Text, UnstyledButton } from '@mantine/core'
import {
  IconDots,
  IconFiles,
  IconLink,
  IconListTree,
  IconPencilCheck,
  IconShare,
  IconTrash,
  IconArrowBack,
} from '@tabler/icons-react'

/** Les icônes, par nom (l'application nomme, le design dessine). */
const ICONES = {
  plan: IconListTree,
  documents: IconFiles,
  modifications: IconPencilCheck,
  lien: IconLink,
  partager: IconShare,
  supprimer: IconTrash,
  retour: IconArrowBack,
}
const Icone = ({ nom }) => {
  const C = ICONES[nom]
  return C ? <C aria-hidden="true" /> : null
}

/** Un tiroir à onglets. */
function Volet({ volet, position, ouvert, surFermer }) {
  if (!volet) return null
  return (
    <Drawer opened={ouvert} onClose={surFermer} position={position} title={volet.titre}>
      <Tabs defaultValue={volet.onglets[0]?.cle}>
        <Tabs.List grow>
          {volet.onglets.map((o) => (
            <Tabs.Tab key={o.cle} value={o.cle} leftSection={<Icone nom={o.icone} />}>
              {o.libelle}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {volet.onglets.map((o) => (
          <Tabs.Panel key={o.cle} value={o.cle}>
            {o.contenu}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Drawer>
  )
}

/**
 * @param {{
 *   titre: string, surTitre?: () => void,
 *   libelles: { gauche: string, droite: string, actions: string, terminer: string, titre: string },
 *   etat: string, mention?: string | null,
 *   enModification: boolean, surTerminer: () => void,
 *   menu: Array<{ cle: string, libelle: string, icone: string, danger?: boolean, surClic: () => void }>,
 *   voletGauche: { titre: string, onglets: Array<{ cle: string, libelle: string, icone: string, contenu: any }> },
 *   voletDroit?: { titre: string, onglets: Array<{ cle: string, libelle: string, icone: string, contenu: any }> } | null,
 *   volet: 'gauche' | 'droite' | null, surVolet: (v: 'gauche' | 'droite' | null) => void,
 *   panneau?: { titre: string, contenu: any, surFermer: () => void } | null,
 *   editeur: any,
 * }} p
 */
export function PageEditionS({
  titre,
  surTitre,
  libelles,
  etat,
  mention,
  enModification,
  surTerminer,
  menu,
  voletGauche,
  voletDroit,
  volet,
  surVolet,
  panneau,
  editeur,
}) {
  const fermer = () => surVolet(null)
  return (
    <>
      <header className="amend-bandeau">
        <ActionIcon aria-label={libelles.gauche} onClick={() => surVolet('gauche')}>
          <IconListTree aria-hidden="true" />
        </ActionIcon>
        <div className="amend-bandeau-titre">
          {surTitre ? (
            <UnstyledButton onClick={surTitre} aria-label={libelles.titre}>
              <Text truncate="end">{titre}</Text>
            </UnstyledButton>
          ) : (
            <Text truncate="end">{titre}</Text>
          )}
        </div>
        {enModification ? <Button onClick={surTerminer}>{libelles.terminer}</Button> : null}
        <Menu>
          <Menu.Target>
            <ActionIcon aria-label={libelles.actions}>
              <IconDots aria-hidden="true" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {menu.map((m) => (
              <Menu.Item key={m.cle} leftSection={<Icone nom={m.icone} />} onClick={m.surClic}>
                {m.libelle}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        {voletDroit ? (
          <ActionIcon aria-label={libelles.droite} onClick={() => surVolet('droite')}>
            <IconPencilCheck aria-hidden="true" />
          </ActionIcon>
        ) : null}
      </header>
      <main>
        {mention ? <Text>{mention}</Text> : null}
        {editeur}
      </main>
      <Text role="status" component="div">
        {etat}
      </Text>
      <Volet volet={voletGauche} position="left" ouvert={volet === 'gauche'} surFermer={fermer} />
      <Volet volet={voletDroit} position="right" ouvert={volet === 'droite'} surFermer={fermer} />
      {panneau ? (
        <Modal opened onClose={panneau.surFermer} title={panneau.titre} fullScreen>
          {panneau.contenu}
        </Modal>
      ) : null}
    </>
  )
}

/** Le plan d'un document : ses titres, en retrait selon le niveau. */
export function PlanDocument({ titres, vide, surChoix }) {
  if (!titres.length) return <Text>{vide}</Text>
  return titres.map((t) => (
    <NavLink
      key={t.id}
      component="button"
      className={`amend-plan-niveau-${t.niveau}`}
      label={t.texte}
      onClick={() => surChoix(t.id)}
    />
  ))
}

/** Une liste de liens (les documents, dans le volet gauche). */
export function ListeLiens({ liens }) {
  return liens.map((l) => <NavLink key={l.cle} component="a" href={l.href} label={l.libelle} active={l.actif} />)
}
