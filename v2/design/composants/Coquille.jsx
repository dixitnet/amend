// Composants de présentation de la coquille des formats M et L
// (docs/v2-formats-M-L.md) : l'AppShell de Mantine (bandeau, volet gauche,
// texte, volet droit), le bandeau, les volets, l'alerte hors ligne et les
// fenêtres. Ils n'appellent rien et ne décident rien : l'application dit quels
// volets sont ouverts, leur donne leurs textes traduits et reçoit les gestes
// par les fonctions de rappel. Valeurs : design/reglages.js et
// design/feuilles/coquille.css (ADR 0008).
import {
  AppShell,
  useAppShellResize,
  Container,
  Group,
  Stack,
  Text,
  ActionIcon,
  Button,
  Menu,
  Avatar,
  Tooltip,
  Indicator,
  Badge,
  Tabs,
  NavLink,
  ScrollArea,
  Anchor,
  Alert,
  Modal,
  TextInput,
  UnstyledButton,
} from '@mantine/core'
import { REGLAGES } from '../reglages.js'
import { PictoDe } from '../pictos.jsx'
import { Marque } from './Picto.jsx'

const C = REGLAGES.coquille

/**
 * La coquille : bandeau en haut, volet gauche redimensionnable, texte, volet
 * droit. `voletDroit` absent : pas de volet droit (écran de la liste).
 * `connexion` : l'état de la connexion, en attribut seulement (rien n'est
 * affiché hors ligne mis à part, comme Docs).
 */
export function Coquille({
  connexion,
  bandeau,
  voletGauche,
  voletDroit,
  alerte,
  gaucheOuvert,
  droiteOuvert,
  libelleRedimension,
  children,
}) {
  const resize = useAppShellResize({
    navbar: { min: C.voletGauche.min, max: C.voletGauche.max, label: libelleRedimension },
  })
  const replie = (ouvert) => ({ desktop: !ouvert, mobile: !ouvert })
  return (
    <AppShell
      data-connexion={connexion}
      resize={resize}
      header={{ height: C.bandeau }}
      navbar={{ width: C.voletGauche.largeur, breakpoint: C.pointDeRupture, collapsed: replie(gaucheOuvert) }}
      aside={
        voletDroit ? { width: C.voletDroit, breakpoint: C.pointDeRupture, collapsed: replie(droiteOuvert) } : undefined
      }
    >
      <AppShell.Header>{bandeau}</AppShell.Header>
      <AppShell.Navbar>{voletGauche}</AppShell.Navbar>
      {voletDroit ? <AppShell.Aside>{voletDroit}</AppShell.Aside> : null}
      <AppShell.Main>
        {alerte}
        {children}
      </AppShell.Main>
    </AppShell>
  )
}

/** La colonne du texte (Container de Mantine, réglage de taille). */
export const ColonneTexte = ({ children }) => <Container>{children}</Container>

/**
 * Le bandeau : volet gauche, titre, mention du mode (« Mode suggestion »,
 * « Lecture seule »), puis (document) « Terminer », présence,
 * « Partager », menu « … », compte, volet droit. Chaque élément est facultatif.
 */
export function Bandeau({ voletGauche, titre, mention, terminer, presence, partager, actions, compte, voletDroit }) {
  return (
    <div className="amend-bandeau">
      <ActionIcon aria-label={voletGauche.libelle} aria-expanded={voletGauche.ouvert} onClick={voletGauche.surClic}>
        <PictoDe role="plan" />
      </ActionIcon>
      <Text component="h1" className="amend-bandeau-titre">
        {titre}
      </Text>
      {mention ? <Badge>{mention}</Badge> : null}
      {terminer ? (
        <Button {...REGLAGES.boutonSecondaire} onClick={terminer.surClic}>
          {terminer.libelle}
        </Button>
      ) : null}
      {presence?.personnes.length ? (
        <Tooltip.Group>
          <Avatar.Group aria-label={presence.libelle} role="list">
            {presence.personnes.map((p) => (
              <Tooltip key={p.cle} label={p.nom}>
                <Avatar name={p.nom} role="listitem" aria-label={p.nom} />
              </Tooltip>
            ))}
          </Avatar.Group>
        </Tooltip.Group>
      ) : null}
      {partager ? (
        <Button {...REGLAGES.boutonSecondaire} leftSection={<PictoDe role="partager" />} onClick={partager.surClic}>
          {partager.libelle}
        </Button>
      ) : null}
      {actions?.elements.length ? (
        <Menu>
          <Menu.Target>
            <ActionIcon aria-label={actions.libelle}>
              <PictoDe role="autres" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {actions.elements.map((a) => [
              a.separe ? <Menu.Divider key={`${a.cle}-sep`} /> : null,
              <Menu.Item key={a.cle} leftSection={<PictoDe role={a.picto} />} onClick={a.surClic}>
                {a.libelle}
              </Menu.Item>,
            ])}
          </Menu.Dropdown>
        </Menu>
      ) : null}
      {compte ? (
        <Menu>
          <Menu.Target>
            <UnstyledButton aria-label={compte.libelle}>
              <Avatar name={compte.nom} />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{compte.courriel || compte.nom}</Menu.Label>
            {compte.actions.map((a) => (
              <Menu.Item key={a.cle} leftSection={<PictoDe role="deconnexion" />} onClick={a.surClic}>
                {a.libelle}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : null}
      {voletDroit ? (
        <Indicator {...REGLAGES.nombreSuggestions} label={voletDroit.nombre} disabled={!voletDroit.nombre}>
          <ActionIcon aria-label={voletDroit.libelle} aria-expanded={voletDroit.ouvert} onClick={voletDroit.surClic}>
            <PictoDe role="modifications" />
          </ActionIcon>
        </Indicator>
      ) : null}
    </div>
  )
}

/** La marque en tête d'un volet : picto et nom, lien vers la liste. */
const MarqueDeVolet = ({ marque }) => (
  <AppShell.Section>
    <div className="amend-volet-tete">
      <Anchor href={marque.href}>
        <Marque nom={marque.nom} />
      </Anchor>
    </div>
  </AppShell.Section>
)

/** Une entrée de l'arbre des documents (dossier ouvert ou document). */
function EntreeDocument({ e }) {
  if (e.dossier)
    return (
      <NavLink label={e.nom} leftSection={<PictoDe role="dossier" />} defaultOpened={e.ouvert}>
        {e.enfants?.map((x) => (
          <EntreeDocument key={x.cle} e={x} />
        ))}
      </NavLink>
    )
  return (
    <NavLink component="a" href={e.href} label={e.nom} leftSection={<PictoDe role="document" />} active={e.actif} />
  )
}

/** Le volet gauche d'un document : onglets Plan et Documents. */
export function VoletPlanDocuments({ marque, onglets, plan, surTitre, videPlan, documents }) {
  return (
    <>
      <MarqueDeVolet marque={marque} />
      <AppShell.Section grow component={ScrollArea}>
        <Tabs defaultValue="plan">
          <Tabs.List grow>
            <Tabs.Tab value="plan" leftSection={<PictoDe role="plan" />}>
              {onglets.plan}
            </Tabs.Tab>
            <Tabs.Tab value="documents" leftSection={<PictoDe role="documents" />}>
              {onglets.documents}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="plan">
            {plan.length ? (
              plan.map((t) => (
                <NavLink
                  key={t.cle}
                  label={t.libelle}
                  active={t.actif}
                  data-niveau={t.niveau}
                  onClick={() => surTitre(t.cle)}
                />
              ))
            ) : (
              <Text className="amend-volet-vide">{videPlan}</Text>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="documents">
            {documents.map((e) => (
              <EntreeDocument key={e.cle} e={e} />
            ))}
          </Tabs.Panel>
        </Tabs>
      </AppShell.Section>
    </>
  )
}

/** Le volet gauche de la liste : nouveau document, Mes documents, Partagé avec moi. */
export function NavigationListe({ marque, nouveau, entrees }) {
  return (
    <>
      <MarqueDeVolet marque={marque} />
      <AppShell.Section>
        <div className="amend-volet-tete">
          <Button className="amend-volet-bouton" leftSection={<PictoDe role="nouveau" />} onClick={nouveau.surClic}>
            {nouveau.libelle}
          </Button>
        </div>
      </AppShell.Section>
      <AppShell.Section grow component="nav">
        {entrees.map((e) => (
          <NavLink
            key={e.cle}
            component="a"
            href={e.href}
            label={e.libelle}
            leftSection={<PictoDe role={e.picto} />}
            active={e.actif}
          />
        ))}
      </AppShell.Section>
    </>
  )
}

/** Le volet droit : « Relecture », onglets Modifications et Margo (IA). */
export function VoletRelecture({ titre, onglets, modifications, margo }) {
  return (
    <>
      <AppShell.Section>
        <div className="amend-volet-tete">
          <Text component="h2">{titre}</Text>
        </div>
      </AppShell.Section>
      <AppShell.Section grow component={ScrollArea}>
        <Tabs defaultValue="modifications">
          <Tabs.List grow>
            <Tabs.Tab value="modifications" leftSection={<PictoDe role="modifications" />}>
              {onglets.modifications}
            </Tabs.Tab>
            <Tabs.Tab value="margo" leftSection={<PictoDe role="margo" />}>
              {onglets.margo}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="modifications">
            <div className="amend-volet-corps">{modifications}</div>
          </Tabs.Panel>
          <Tabs.Panel value="margo">
            <div className="amend-volet-corps">{margo}</div>
          </Tabs.Panel>
        </Tabs>
      </AppShell.Section>
    </>
  )
}

/** Un texte simple dans un volet (onglet vide, par exemple). */
export const TexteDeVolet = ({ texte }) => <Text>{texte}</Text>

/** L'alerte hors ligne, sous le bandeau (comme AlertOffline de Docs). */
export const AlerteHorsLigne = ({ texte }) => (
  <Alert {...REGLAGES.alerteHorsLigne} icon={<PictoDe role="horsLigne" />} role="status">
    {texte}
  </Alert>
)

/** Une fenêtre (Modal de Mantine) : le partage, par exemple. */
export const Fenetre = ({ ouverte, titre, surFermer, libelleFermer, children }) => (
  <Modal opened={ouverte} onClose={surFermer} title={titre} closeButtonProps={{ 'aria-label': libelleFermer }}>
    {children}
  </Modal>
)

/** Une fenêtre de saisie d'un nom (remplace la boîte du navigateur). */
export function FenetreSaisie({
  ouverte,
  titre,
  libelle,
  valeur,
  libelleValider,
  libelleAnnuler,
  surValider,
  surFermer,
}) {
  const soumettre = (e) => {
    e.preventDefault()
    const v = String(new FormData(e.currentTarget).get('valeur') || '').trim()
    if (v) surValider(v)
  }
  return (
    <Modal opened={ouverte} onClose={surFermer} title={titre} withCloseButton={false}>
      <form onSubmit={soumettre}>
        <Stack>
          <TextInput name="valeur" label={libelle} defaultValue={valeur} data-autofocus required />
          <Group>
            <Button type="submit">{libelleValider}</Button>
            <Button {...REGLAGES.boutonSecondaire} onClick={surFermer}>
              {libelleAnnuler}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
