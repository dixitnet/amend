// Composant de présentation : l'onglet « Documents » du volet gauche, qui
// remplace la page « Mes documents » (Sylvain, 10/11/2026 ; écart avec Docs,
// qui garde une page d'accueil). En tête, la recherche et les boutons de
// création ; puis l'arbre : Mes documents et ses dossiers, une entrée par
// équipe, Partagé avec moi, Corbeille (11/11/2026). Chaque entrée a son menu
// « … » quand elle a des actions ; un document de la corbeille ne s'ouvre pas
// (pas de lien) et porte un détail (les jours restants). Un sélecteur de tri
// (11/11/2026, comme les tris de la v1). Mantine tel quel ; textes traduits ; les gestes remontent par les
// fonctions de rappel. Le même composant sert aux formats L, M et S.
import { useEffect, useState } from 'react'
import { Stack, Group, TextInput, Button, NavLink, Menu, ActionIcon, Text, Select, Modal } from '@mantine/core'
import { PictoDe } from '../pictos.jsx'
import { REGLAGES } from '../reglages.js'

/** Le menu « … » d'une entrée. */
function MenuEntree({ libelle, actions }) {
  return (
    <Menu>
      <Menu.Target>
        <ActionIcon aria-label={libelle}>
          <PictoDe role="autres" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {actions.map((a) => (
          <Menu.Item
            key={a.cle}
            leftSection={a.picto ? <PictoDe role={a.picto} /> : null}
            {...(a.danger ? REGLAGES.boutonDanger : {})}
            onClick={a.surClic}
          >
            {a.libelle}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}

/** Une entrée de l'arbre : un dossier (ou un espace) qui s'ouvre, ou un document. */
function Entree({ e, libelleActions }) {
  const [ouvert, setOuvert] = useState(e.ouvert ?? false)
  // Un dossier qui reçoit le document ouvert se déplie (l'application le dit).
  useEffect(() => {
    if (e.ouvert) setOuvert(true)
  }, [e.ouvert])
  const menu = e.actions?.length ? <MenuEntree libelle={libelleActions(e.nom)} actions={e.actions} /> : null
  const ligne = e.enfants ? (
    <NavLink
      component="button"
      label={e.nom}
      leftSection={<PictoDe role={e.picto} />}
      aria-expanded={ouvert}
      onClick={() => setOuvert((o) => !o)}
    />
  ) : e.href ? (
    <NavLink
      component="a"
      href={e.href}
      label={e.nom}
      description={e.detail}
      leftSection={<PictoDe role={e.picto} />}
      active={e.actif}
    />
  ) : (
    <NavLink component="div" label={e.nom} description={e.detail} leftSection={<PictoDe role={e.picto} />} />
  )
  return (
    <div>
      <Group {...REGLAGES.arbre.ligne}>
        {ligne}
        {menu}
      </Group>
      {e.enfants && ouvert ? (
        <Stack {...REGLAGES.arbre.enfants}>
          {e.enfants.map((x) => (
            <Entree key={x.cle} e={x} libelleActions={libelleActions} />
          ))}
        </Stack>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   recherche: { libelle: string, valeur: string, surChange: (v: string) => void },
 *   boutons: Array<{ cle: string, libelle: string, picto: string, surClic: () => void }>,
 *   tri?: { libelle: string, valeur: string, options: Array<{ value: string, label: string }>, surChange: (v: string) => void },
 *   entrees: Array<any>, vide: string, libelleActions: (nom: string) => string,
 * }} p
 */
export function VoletDocuments({ recherche, boutons, tri, entrees, vide, libelleActions }) {
  return (
    <Stack>
      <TextInput
        type="search"
        aria-label={recherche.libelle}
        placeholder={recherche.libelle}
        value={recherche.valeur}
        onChange={(ev) => recherche.surChange(ev.currentTarget.value)}
      />
      <Group>
        {boutons.map((b) => (
          <Button
            key={b.cle}
            {...REGLAGES.boutonSecondaire}
            leftSection={<PictoDe role={b.picto} />}
            onClick={b.surClic}
          >
            {b.libelle}
          </Button>
        ))}
      </Group>
      {tri ? (
        <Select
          aria-label={tri.libelle}
          data={tri.options}
          value={tri.valeur}
          onChange={(v) => v && tri.surChange(v)}
          allowDeselect={false}
        />
      ) : null}
      {entrees.length ? (
        <Stack {...REGLAGES.arbre.racine}>
          {entrees.map((e) => (
            <Entree key={e.cle} e={e} libelleActions={libelleActions} />
          ))}
        </Stack>
      ) : (
        <Text>{vide}</Text>
      )}
    </Stack>
  )
}

/** Choisir une destination dans une liste (« Déplacer… »), dans une fenêtre. */
export function FenetreChoix({
  ouverte,
  titre,
  libelle,
  options,
  libelleValider,
  libelleAnnuler,
  surValider,
  surFermer,
}) {
  const [valeur, setValeur] = useState(null)
  return (
    <Modal opened={ouverte} onClose={surFermer} title={titre} withCloseButton={false}>
      <Stack>
        <Select
          label={libelle}
          data={options}
          value={valeur}
          onChange={setValeur}
          allowDeselect={false}
          data-autofocus
        />
        <Group>
          <Button {...REGLAGES.boutonSecondaire} onClick={surFermer}>
            {libelleAnnuler}
          </Button>
          <Button disabled={!valeur} onClick={() => surValider(valeur)}>
            {libelleValider}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
