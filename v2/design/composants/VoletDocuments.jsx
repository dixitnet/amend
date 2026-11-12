// Composant de présentation : l'onglet « Documents » du volet gauche, qui
// remplace la page « Mes documents » (Sylvain, 10/11/2026 ; écart avec Docs,
// qui garde une page d'accueil). En tête, la recherche et le menu « Nouveau »
// (document, note, dossier, équipe ; Sylvain, 12/11/2026) ; puis l'arbre : Mes documents et ses dossiers, une entrée par
// équipe, Partagé avec moi, Corbeille (11/11/2026). Chaque entrée a son menu
// « … » quand elle a des actions ; un document de la corbeille ne s'ouvre pas
// (pas de lien) et porte un détail (les jours restants). L'ordre est fixé par
// l'application (sans sélecteur, 12/11/2026). Mantine tel quel ; textes traduits ; les gestes remontent par les
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
    // Un document : sans picto, pour alléger l'arbre (Sylvain, 12/11/2026 ;
    // écart avec Docs). Dossiers et espaces gardent le leur.
    <NavLink component="a" href={e.href} label={e.nom} description={e.detail} active={e.actif} />
  ) : (
    // Un document de la corbeille : pas de lien, pas de picto non plus.
    <NavLink component="div" label={e.nom} description={e.detail} />
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
 *   nouveau: { libelle: string, elements: Array<{ cle: string, libelle: string, picto: string, surClic: () => void }> },
 *   entrees: Array<any>, vide: string, libelleActions: (nom: string) => string,
 * }} p
 */
export function VoletDocuments({ recherche, nouveau, entrees, vide, libelleActions }) {
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
        <Menu>
          <Menu.Target>
            <Button {...REGLAGES.boutonSecondaire} leftSection={<PictoDe role="nouveau" />}>
              {nouveau.libelle}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {nouveau.elements.map((b) => (
              <Menu.Item key={b.cle} leftSection={<PictoDe role={b.picto} />} onClick={b.surClic}>
                {b.libelle}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>
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
