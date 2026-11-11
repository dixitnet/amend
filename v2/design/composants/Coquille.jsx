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
  SegmentedControl,
} from '@mantine/core'
import { useRef, useState } from 'react'
import { REGLAGES } from '../reglages.js'
import { PictoDe } from '../pictos.jsx'
import { Marque } from './Picto.jsx'

const C = REGLAGES.coquille

/**
 * La coquille : bandeau en haut, volet gauche redimensionnable, texte, volet
 * droit. `voletDroit` absent : pas de volet droit (écran de la liste).
 * Un volet replié est inactif (`inert`, comme Docs) : ni clavier ni lecteur
 * d'écran n'y entrent.
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
      <AppShell.Navbar inert={!gaucheOuvert}>{voletGauche}</AppShell.Navbar>
      {voletDroit ? <AppShell.Aside inert={!droiteOuvert}>{voletDroit}</AppShell.Aside> : null}
      <AppShell.Main>
        {alerte}
        {children}
      </AppShell.Main>
    </AppShell>
  )
}

/** La colonne du texte (Container de Mantine, réglage de taille). */
export const ColonneTexte = ({ children }) => <Container>{children}</Container>

/** L'étoile des favoris, devant le titre d'un document (Sylvain, 10/11/2026). */
export const Etoile = ({ favori }) => (
  <ActionIcon aria-label={favori.libelle} aria-pressed={favori.actif} onClick={favori.surBasculer}>
    <PictoDe role={favori.actif ? 'favoriActif' : 'favori'} />
  </ActionIcon>
)

/** Le titre du document, modifiable d'un clic (Sylvain, 10/11/2026) : Entrée
 * ou sortie du champ enregistrent, Échap annule. Sans `renommer`, un titre. */
function TitreModifiable({ titre, renommer }) {
  const [edition, setEdition] = useState(false)
  // Entrée puis la perte du champ ne valident qu'une fois (audit du 10/11/2026).
  const valide = useRef(false)
  if (!renommer)
    return (
      <Text component="h1" className="amend-coquille-titre">
        {titre}
      </Text>
    )
  if (edition) {
    const valider = (v) => {
      if (valide.current) return
      valide.current = true
      setEdition(false)
      if (v !== renommer.valeur) renommer.surValider(v)
    }
    return (
      <form
        className="amend-coquille-titre"
        onSubmit={(e) => (e.preventDefault(), valider(new FormData(e.currentTarget).get('titre')))}
      >
        <TextInput
          name="titre"
          aria-label={renommer.libelle}
          defaultValue={renommer.valeur}
          autoFocus
          onBlur={(e) => valider(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEdition(false)}
        />
      </form>
    )
  }
  return (
    <Text component="h1" className="amend-coquille-titre">
      {/* Le nom du bouton reste le titre affiché (axe : label-content-name-mismatch) ; « Renommer » en info-bulle. */}
      <UnstyledButton title={renommer.libelle} onClick={() => ((valide.current = false), setEdition(true))}>
        {titre}
      </UnstyledButton>
    </Text>
  )
}

/**
 * Le bandeau : volet gauche, étoile des favoris, titre (modifiable d’un clic), mention du mode (« Mode suggestion »,
 * « Lecture seule »), puis (document) le choix du mode d'un éditeur
 * (Modifier, Suggérer, Relire, comme l'exemple de BlockNote), « Terminer »,
 * présence, « Partager », menu « … », compte,
 * volet droit. Le volet gauche est toujours là ; le reste est facultatif.
 */
export function Bandeau({
  voletGauche,
  titre,
  renommer,
  favori,
  mention,
  modes,
  terminer,
  presence,
  partager,
  actions,
  compte,
  voletDroit,
}) {
  return (
    <div className="amend-coquille-bandeau">
      <ActionIcon aria-label={voletGauche.libelle} aria-expanded={voletGauche.ouvert} onClick={voletGauche.surClic}>
        <PictoDe role="plan" />
      </ActionIcon>
      {favori ? <Etoile favori={favori} /> : null}
      <TitreModifiable titre={titre} renommer={renommer} />
      {mention ? <Badge>{mention}</Badge> : null}
      {modes ? (
        <SegmentedControl
          aria-label={modes.libelle}
          value={modes.valeur}
          data={modes.options.map((o) => ({ value: o.valeur, label: o.libelle }))}
          onChange={modes.surChange}
        />
      ) : null}
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
              <Avatar />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{compte.courriel || compte.nom}</Menu.Label>
            {compte.actions.map((a) => (
              <Menu.Item key={a.cle} leftSection={<PictoDe role={a.picto} />} onClick={a.surClic}>
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

/** Le volet gauche d'un document : onglets Plan et Documents (le contenu de
 * l'onglet Documents : VoletDocuments), sans marque en tête (Sylvain, 10/11/2026). */
export function VoletPlanDocuments({ onglets, plan, surTitre, videPlan, documents }) {
  return (
    <>
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
                  component="button"
                  label={t.libelle}
                  active={t.actif}
                  data-niveau={t.niveau}
                  onClick={() => surTitre(t.cle)}
                />
              ))
            ) : (
              <Text className="amend-coquille-volet-vide">{videPlan}</Text>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="documents">{documents}</Tabs.Panel>
        </Tabs>
      </AppShell.Section>
    </>
  )
}

/** Le volet droit : onglets Modifications et Margo (IA). Le titre
 * (« Relecture ») n'est plus affiché (Sylvain, 10/11/2026) : il nomme les
 * onglets pour les lecteurs d'écran. L'onglet ouvert peut être piloté
 * (`actif`, `surOnglet`) : « Corriger » ouvre Margo (étape 8). Sans `margo`,
 * pas d'onglet Margo (le correcteur n'y a pas accès). */
export function VoletRelecture({ titre, onglets, modifications, margo, actif, surOnglet }) {
  const pilote = actif ? { value: actif, onChange: surOnglet } : { defaultValue: 'modifications' }
  return (
    <>
      <AppShell.Section grow component={ScrollArea}>
        <Tabs {...pilote}>
          <Tabs.List grow aria-label={titre}>
            <Tabs.Tab value="modifications" leftSection={<PictoDe role="modifications" />}>
              {onglets.modifications}
            </Tabs.Tab>
            {margo ? (
              <Tabs.Tab value="margo" leftSection={<PictoDe role="margo" />}>
                {onglets.margo}
              </Tabs.Tab>
            ) : null}
          </Tabs.List>
          <Tabs.Panel value="modifications">
            <div className="amend-coquille-volet-corps">{modifications}</div>
          </Tabs.Panel>
          {margo ? (
            <Tabs.Panel value="margo">
              <div className="amend-coquille-volet-corps">{margo}</div>
            </Tabs.Panel>
          ) : null}
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

/**
 * Une confirmation, comme celles de Docs (ModalRemoveDoc) : « Annuler »
 * secondaire et pris par le focus ; l'action en rouge quand elle détruit.
 */
export function FenetreConfirmation({
  ouverte,
  titre,
  texte,
  libelleConfirmer,
  libelleAnnuler,
  danger,
  surConfirmer,
  surFermer,
}) {
  return (
    <Modal opened={ouverte} onClose={surFermer} title={titre} withCloseButton={false}>
      <Stack>
        <Text>{texte}</Text>
        <Group>
          <Button {...REGLAGES.boutonSecondaire} onClick={surFermer} data-autofocus>
            {libelleAnnuler}
          </Button>
          <Button {...(danger ? REGLAGES.boutonDanger : {})} onClick={surConfirmer}>
            {libelleConfirmer}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

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
