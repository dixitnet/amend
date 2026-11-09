// Maquette visuelle des formats M (iPad) et L (Mac) d'amend.ink.
// Mantine et BlockNote tels quels, avec les réglages de v2/design/reglages.js
// et la feuille de l'éditeur de la v2 (v2/design/feuilles/editeur.css).
// Aucune fonction réelle : les volets, le menu « … », le passage lecture /
// modification et le panneau « Variantes » réagissent, rien d'autre.
// Les largeurs (volets, colonne) sont des propositions à décider, pas des réglages.
import '@mantine/core/styles.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import '../../../../v2/design/feuilles/editeur.css'
import '../../../../v2/design/feuilles/picto.css'
import dessinPicto from '../../../../v2/design/picto/amend-ink.svg?raw'
import { StrictMode, useState, useEffect, useRef } from 'react'
import { TextSelection } from 'prosemirror-state'
import { createRoot } from 'react-dom/client'
import {
  MantineProvider, createTheme, AppShell, useAppShellResize, useMantineTheme,
  Group, Menu, Text, Title, ActionIcon, Box, Tabs, NavLink, Button, Stack, Paper, Badge,
  Textarea, Divider, Indicator, Alert, Affix, Popover, SegmentedControl, ScrollArea,
  Table, Breadcrumbs, Anchor, UnstyledButton, Avatar, Tooltip, Modal, TextInput, Select,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  useCreateBlockNote, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { fr } from '@blocknote/core/locales'
import { schemaLivre } from '../../../../v2/adaptateurs/blocknote/schema.js'
import { boutonsGardes } from '../../../../v2/adaptateurs/blocknote/palette.js'
import {
  IconListTree, IconPencilCheck, IconDots, IconLink, IconShare, IconDownload, IconPrinter,
  IconCopy, IconTrash, IconFolder, IconFileText, IconFiles, IconWand, IconPlus, IconHistory,
  IconWifiOff, IconAdjustments, IconUsers, IconUser, IconLogout,
} from '@tabler/icons-react'

const REGLAGES = { fournisseur: { defaultColorScheme: 'auto' }, theme: {} }

// Propositions de largeur (à décider) : celles de Docs pour les volets.
const VOLET_GAUCHE = { largeur: 300, min: 300, max: 450 }
const VOLET_DROIT = 300

const TITRE = 'Réparons la ville !'
const h = (level, text) => ({ type: 'heading', props: { level }, content: text })
const p = (text) => ({ type: 'paragraph', content: text })
const contenu = [
  p("La ville de demain est déjà là. Plus de 80 % des bâtiments qui existeront en 2050 sont déjà construits. Le vrai chantier n'est donc pas de bâtir une ville neuve, mais de transformer celle que nous habitons."),
  h(2, '1. La fin de l’étalement'),
  p("Pendant des décennies, nous avons étendu nos villes sur les terres agricoles et naturelles, au rythme d'un département tous les dix ans. Cet étalement a un coût : des sols artificialisés, des distances qui s'allongent, une dépendance accrue à la voiture."),
  p("Réparer la ville, c'est d'abord cesser de l'étendre. C'est faire le pari de l'existant, de ses friches, de ses logements vacants, de ses bureaux vides et de ses parkings surdimensionnés."),
  h(2, '2. Intensifier les usages'),
  p("Un bâtiment de bureaux est occupé moins de 30 % du temps. Une école reste fermée le soir, le week-end et pendant les vacances. Intensifier les usages, c'est faire plus avec les mêmes mètres carrés, sans rien construire."),
  h(3, 'La chronotopie'),
  p("Ouvrir une cour d'école le samedi, partager une salle de réunion avec une association, transformer un parking en marché le dimanche : autant de façons de faire vivre la ville sans couler de béton."),
  h(2, '3. Transformer l’existant'),
  p("Quand un bâtiment ne répond plus aux besoins, la démolition n'est pas une fatalité. Surélever, convertir des bureaux en logements, réhabiliter plutôt que reconstruire : la transformation économise des matériaux, de l'énergie et du carbone."),
  p("Elle demande aussi d'autres compétences, d'autres métiers, et une autre manière de regarder la ville : non plus comme un terrain à remplir, mais comme un patrimoine à entretenir."),
  h(2, '4. Réparer plutôt que remplacer'),
  p("Réparer la ville, c'est enfin accepter qu'elle ne soit jamais finie. Chaque génération hérite d'une ville qu'elle transforme à son tour, avec les moyens et les besoins de son époque."),
]

const plan = [
  [2, '1. La fin de l’étalement'], [2, '2. Intensifier les usages'],
  [3, 'La chronotopie'], [2, '3. Transformer l’existant'], [2, '4. Réparer plutôt que remplacer'],
]
const modifications = [
  { qui: 'Claire', quoi: 'Insertion', texte: '« au rythme d’un département tous les dix ans »' },
  { qui: 'Jérôme', quoi: 'Suppression', texte: '« sans rien construire »' },
  { qui: 'Claire', quoi: 'Mise en forme', texte: 'Titre de niveau 3 : « La chronotopie »' },
]
const documents = [
  { nom: 'Réparons la ville', dossier: true, modifie: 'aujourd’hui', role: 'Propriétaire' },
  { nom: 'Urbanisme circulaire', dossier: true, modifie: 'hier', role: 'Propriétaire' },
  { nom: 'Redirection urbaine v3', modifie: '7 novembre', role: 'Propriétaire' },
  { nom: 'Notes pour la préface', modifie: '2 novembre', role: 'Propriétaire' },
]

function Picto() {
  return <span className="amend-picto" aria-hidden="true" dangerouslySetInnerHTML={{ __html: dessinPicto }} />
}

// Format S repris : lecture seule à l'ouverture, un appui sur le texte passe
// en modification, curseur à l'endroit touché ; retour par « Terminer ».
function useModification(editeur, lectureDabord) {
  const [enModification, setEnModification] = useState(!lectureDabord)
  useEffect(() => {
    editeur.isEditable = !lectureDabord
    setEnModification(!lectureDabord)
  }, [editeur, lectureDabord])
  const commencer = (evenement) => {
    if (editeur.isEditable) return
    editeur.isEditable = true
    const vue = editeur.prosemirrorView
    const point = vue.posAtCoords({ left: evenement.clientX, top: evenement.clientY })
    if (point) vue.dispatch(vue.state.tr.setSelection(TextSelection.create(vue.state.doc, point.pos)))
    vue.focus()
    setEnModification(true)
  }
  const terminer = () => {
    editeur.isEditable = false
    editeur.prosemirrorView.dom.blur()
    setEnModification(false)
  }
  return { enModification, commencer, terminer }
}

function Palette() {
  return <FormattingToolbar>{boutonsGardes(getFormattingToolbarItems())}</FormattingToolbar>
}

// Docs (usePanelCoordination.tsx) : sous le seuil, un seul volet à la fois ;
// le volet fermé d'office se rouvre quand on referme l'autre.
function useVolets(etroit, ouvertADroite) {
  const [gauche, setGauche] = useState(!etroit)
  const [droite, setDroite] = useState(ouvertADroite)
  const auto = useRef({ gauche: false, droite: false })
  const precedent = useRef(etroit)
  useEffect(() => {
    if (etroit && !precedent.current && gauche && droite) {
      setGauche(false)
      auto.current.gauche = true
    }
    if (!etroit && precedent.current && auto.current.gauche) {
      setGauche(true)
      auto.current.gauche = false
    }
    precedent.current = etroit
  }, [etroit, gauche, droite])
  useEffect(() => {
    if (etroit && gauche && droite) setGauche(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const basculerGauche = () => {
    if (gauche) {
      setGauche(false)
      if (auto.current.droite) { setDroite(true); auto.current.droite = false }
    } else {
      setGauche(true)
      if (etroit && droite) { setDroite(false); auto.current.droite = true }
    }
  }
  const basculerDroite = () => {
    if (droite) {
      setDroite(false)
      if (auto.current.gauche) { setGauche(true); auto.current.gauche = false }
    } else {
      setDroite(true)
      if (etroit && gauche) { setGauche(false); auto.current.gauche = true }
    }
  }
  return { gauche, droite, basculerGauche, basculerDroite }
}

function Marque({ onClick }) {
  return (
    <UnstyledButton onClick={onClick} aria-label="amend.ink, accueil">
      <Group gap="xs" wrap="nowrap">
        <Text fw={600} size="lg"><Picto /></Text>
        <Text fw={600}>amend.ink</Text>
      </Group>
    </UnstyledButton>
  )
}

function VoletGaucheDocument({ versListe }) {
  return (
    <>
      <AppShell.Section p="sm"><Marque onClick={versListe} /></AppShell.Section>
      <AppShell.Section grow component={ScrollArea}>
        <Tabs defaultValue="plan">
          <Tabs.List grow>
            <Tabs.Tab value="plan" leftSection={<IconListTree size={18} />}>Plan</Tabs.Tab>
            <Tabs.Tab value="fichiers" leftSection={<IconFiles size={18} />}>Documents</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="plan">
            {plan.map(([niveau, titre], i) => (
              <NavLink key={i} label={titre} active={i === 1} pl={`calc(var(--mantine-spacing-md) * ${niveau - 1})`} />
            ))}
          </Tabs.Panel>
          <Tabs.Panel value="fichiers">
            <NavLink label="Réparons la ville" leftSection={<IconFolder size={18} />} defaultOpened childrenOffset="md">
              <NavLink label="Réparons la ville !" leftSection={<IconFileText size={18} />} active />
              <NavLink label="Notes de lecture" leftSection={<IconFileText size={18} />} />
            </NavLink>
            <NavLink label="Urbanisme circulaire" leftSection={<IconFolder size={18} />} childrenOffset="md">
              <NavLink label="Manifeste" leftSection={<IconFileText size={18} />} />
            </NavLink>
            <NavLink label="Redirection urbaine v3" leftSection={<IconFileText size={18} />} />
          </Tabs.Panel>
        </Tabs>
      </AppShell.Section>
    </>
  )
}

function VoletGaucheListe() {
  return (
    <>
      <AppShell.Section p="sm"><Marque /></AppShell.Section>
      <AppShell.Section px="sm" pb="sm">
        <Button fullWidth leftSection={<IconPlus size={18} />}>Nouveau document</Button>
      </AppShell.Section>
      <AppShell.Section grow>
        <NavLink label="Mes documents" leftSection={<IconUser size={18} />} active />
        <NavLink label="Partagé avec moi" leftSection={<IconUsers size={18} />} />
      </AppShell.Section>
    </>
  )
}

function VoletDroit() {
  return (
    <AppShell.Section grow component={ScrollArea}>
      <Tabs defaultValue="modifications">
        <Tabs.List grow>
          <Tabs.Tab value="modifications" leftSection={<IconPencilCheck size={18} />}>Modifications</Tabs.Tab>
          <Tabs.Tab value="margo" leftSection={<IconWand size={18} />}>Margo (IA)</Tabs.Tab>{/* absent jusqu'à l'étape 8 (Sylvain, 09/11/2026) */}
        </Tabs.List>
        <Tabs.Panel value="modifications">
          <Stack p="sm">
            {modifications.map((m, i) => (
              <Paper key={i} withBorder p="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>{m.qui}</Text>
                  <Badge variant="light">{m.quoi}</Badge>
                </Group>
                <Text size="sm">{m.texte}</Text>
                <Divider my="xs" />
                <Group grow>
                  <Button size="xs" variant="light">Accepter</Button>
                  <Button size="xs" variant="default">Refuser</Button>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="margo">
          <Stack p="sm">
            <Paper withBorder p="sm">
              <Text size="sm">« Plus de 80 % des bâtiments qui existeront en 2050 sont déjà construits. »</Text>
              <Text size="sm" c="dimmed">Chiffre à sourcer.</Text>
            </Paper>
            <Textarea placeholder="Demander à Margo…" autosize />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </AppShell.Section>
  )
}

function MenuActions() {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label="Autres actions"><IconDots /></ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconLink size={18} />}>Copier le lien</Menu.Item>
        <Menu.Item leftSection={<IconShare size={18} />}>Partager</Menu.Item>
        <Menu.Item leftSection={<IconDownload size={18} />}>Exporter</Menu.Item>
        <Menu.Item leftSection={<IconPrinter size={18} />}>Imprimer</Menu.Item>
        <Menu.Item leftSection={<IconCopy size={18} />}>Dupliquer</Menu.Item>
        <Menu.Item leftSection={<IconHistory size={18} />}>Historique</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconTrash size={18} />}>Supprimer</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}


// 2 : la présence (qui est dans le document), dans le bandeau avant « Partager ».
function Presence() {
  return (
    <Tooltip.Group>
      <Avatar.Group>
        {[['Claire Martin', 'CM'], ['Jérôme Petit', 'JP']].map(([nom, init]) => (
          <Tooltip key={nom} label={nom} withArrow>
            <Avatar name={nom} color="initials" size="sm">{init}</Avatar>
          </Tooltip>
        ))}
      </Avatar.Group>
    </Tooltip.Group>
  )
}

// 1 : le compte, dans le bandeau (décision de Sylvain), pas en pied du volet gauche.
function MenuCompte() {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <UnstyledButton aria-label="Mon compte">
          <Avatar name="Sylvain Grisot" color="initials" size="sm" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>sylvain@exemple.fr</Menu.Label>
        <Menu.Item leftSection={<IconLogout size={18} />}>Se déconnecter</Menu.Item>
        <Menu.Item leftSection={<IconLogout size={18} />}>Déconnecter tous mes appareils</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

// 3 : le partage dans une fenêtre de Mantine, comme Docs ; contenu repris de PanneauPartage (v2).
function FenetrePartage({ ouverte, fermer }) {
  const roles = ['Lecteur', 'Correcteur', 'Éditeur', 'Propriétaire']
  return (
    <Modal opened={ouverte} onClose={fermer} title="Partager « Réparons la ville ! »" size="lg">
      <Stack>
        <Group align="end" wrap="nowrap">
          <TextInput label="Adresse électronique" placeholder="nom@exemple.fr" flex={1} />
          <Select label="Rôle" data={roles.slice(0, 3)} defaultValue="Correcteur" allowDeselect={false} w={140} />
          <Button>Inviter</Button>
        </Group>
        <Divider />
        {[['Sylvain Grisot', 'Propriétaire'], ['Claire Martin', 'Éditeur'], ['Jérôme Petit', 'Correcteur']].map(([nom, role]) => (
          <Group key={nom} justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap"><Avatar name={nom} color="initials" size="sm" /><Text size="sm">{nom}</Text></Group>
            <Select data={roles} defaultValue={role} allowDeselect={false} w={140} aria-label={`Rôle de ${nom}`} />
          </Group>
        ))}
        <Divider />
        <Select label="Accès par lien" data={['Aucun', 'Lecteur', 'Correcteur']} defaultValue="Aucun" allowDeselect={false} />
      </Stack>
    </Modal>
  )
}

function BoutonGauche({ onClick }) {
  return (
    <ActionIcon variant="subtle" size="lg" aria-label="Plan et documents" onClick={onClick}>
      <IconListTree />
    </ActionIcon>
  )
}

function BoutonDroit({ onClick }) {
  return (
    <Indicator label={modifications.length} size={16} offset={4}>
      <ActionIcon variant="subtle" size="lg" aria-label="Modifications et Margo (IA)" onClick={onClick}>
        <IconPencilCheck />
      </ActionIcon>
    </Indicator>
  )
}

function Variantes({ v, setV }) {
  const champ = (cle, legende, donnees) => (
    <Stack gap={4}>
      <Text size="xs" fw={500}>{legende}</Text>
      <SegmentedControl size="xs" fullWidth value={v[cle]} onChange={(x) => setV({ ...v, [cle]: x })} data={donnees} />
    </Stack>
  )
  return (
    <Affix position={{ bottom: 16, left: 16 }}>
      <Popover position="top-start" shadow="md" width={340} defaultOpened>
        <Popover.Target>
          <Button variant="default" leftSection={<IconAdjustments size={18} />}>Variantes</Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">Réglages de la maquette, hors interface.</Text>
            {champ('ecran', 'Écran', [{ value: 'document', label: 'Document' }, { value: 'liste', label: 'Mes documents' }])}
            {champ('barre', '2. Barre du haut', [{ value: 'bandeau', label: 'Bandeau fixe' }, { value: 'flottante', label: 'Flottante (Docs)' }])}
            {champ('titre', '3. Titre du document', [{ value: 'barre', label: 'Dans la barre' }, { value: 'texte', label: 'Au-dessus du texte' }])}
            {champ('colonne', '8. Largeur du texte', [{ value: '720', label: '720 px' }, { value: '868', label: '868 px (Docs)' }, { value: '960', label: '960 px' }])}
            {champ('saisie', '9. Lecture ou modification', [{ value: 'auto', label: 'Selon l’appareil' }, { value: 'lecture', label: 'Lecture d’abord' }, { value: 'directe', label: 'Directe' }])}
            {champ('bleu', '11. Bleu des boutons', [{ value: 'defaut', label: 'Mantine' }, { value: 'nuance8', label: 'Nuance 8' }, { value: 'noir', label: 'Texte noir' }])}
            {champ('reseau', '11. Connexion', [{ value: 'en-ligne', label: 'En ligne' }, { value: 'hors-ligne', label: 'Hors ligne' }])}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Affix>
  )
}

function Maquette({ v, setV }) {
  const theme = useMantineTheme()
  const opts = { getInitialValueInEffect: false }
  const etroit = !useMediaQuery(`(min-width: ${theme.breakpoints.md})`, true, opts)
  const tactile = useMediaQuery('(pointer: coarse)', false, opts)
  const lectureDabord = v.saisie === 'lecture' || (v.saisie === 'auto' && tactile)
  const editeur = useCreateBlockNote({ schema: schemaLivre, initialContent: contenu, dictionary: fr })
  const { enModification, commencer, terminer } = useModification(editeur, lectureDabord)
  const liste = v.ecran === 'liste'
  // 5b : le volet droit s'ouvre d'office quand des suggestions attendent.
  const volets = useVolets(etroit, modifications.length > 0)
  const resize = useAppShellResize({ navbar: { min: VOLET_GAUCHE.min, max: VOLET_GAUCHE.max, label: 'Largeur du volet' } })
  const bandeau = v.barre === 'bandeau'
  const titreEnHaut = v.titre === 'barre'
  const droiteOuverte = volets.droite && !liste
  const [partage, setPartage] = useState(false)

  const terminerBouton = lectureDabord && enModification && !liste
    ? <Button variant="subtle" onClick={terminer}>Terminer</Button>
    : null
  const titreBarre = liste ? 'Mes documents' : TITRE

  return (
    <AppShell
      resize={resize}
      header={bandeau ? { height: 54 } : undefined}
      navbar={{ width: VOLET_GAUCHE.largeur, breakpoint: 'sm', collapsed: { desktop: !volets.gauche, mobile: !volets.gauche } }}
      aside={{ width: VOLET_DROIT, breakpoint: 'sm', collapsed: { desktop: !droiteOuverte, mobile: !droiteOuverte } }}
    >
      {bandeau ? (
        <AppShell.Header>
          <Group h="100%" px="xs" wrap="nowrap">
            <BoutonGauche onClick={volets.basculerGauche} />
            <Text fw={500} truncate="end" flex={1}>{titreEnHaut || liste ? titreBarre : ''}</Text>
            {terminerBouton}
            {liste ? <MenuCompte /> : (
              <>
                <Presence />
                <Button variant="default" leftSection={<IconShare size={18} />} onClick={() => setPartage(true)}>Partager</Button>
                <MenuActions />
                <MenuCompte />
                <BoutonDroit onClick={volets.basculerDroite} />
              </>
            )}
          </Group>
        </AppShell.Header>
      ) : null}

      <FenetrePartage ouverte={partage} fermer={() => setPartage(false)} />
      <AppShell.Navbar>
        {liste ? <VoletGaucheListe /> : <VoletGaucheDocument versListe={() => setV({ ...v, ecran: 'liste' })} />}
      </AppShell.Navbar>

      <AppShell.Aside>
        <Group justify="space-between" p="sm" pb={0}>
          <Text fw={500}>Relecture</Text>
        </Group>
        <VoletDroit />
      </AppShell.Aside>

      <AppShell.Main>
        {bandeau ? null : (
          <Group justify="space-between" p="xs" pos="sticky" top={0} style={{ zIndex: 3 }} wrap="nowrap">
            <Paper shadow="sm" radius="md" p={4}>
              <Group gap="xs" wrap="nowrap">
                <BoutonGauche onClick={volets.basculerGauche} />
                {titreEnHaut || liste ? <Text fw={500} pr="xs" truncate="end">{titreBarre}</Text> : null}
              </Group>
            </Paper>
            {liste ? null : (
              <Group gap="xs" wrap="nowrap">
                {terminerBouton ? <Paper shadow="sm" radius="md" p={4}>{terminerBouton}</Paper> : null}
                <Button variant="default" leftSection={<IconShare size={18} />} onClick={() => setPartage(true)}>Partager</Button>
                <Paper shadow="sm" radius="md" p={4}>
                  <Group gap={4} wrap="nowrap">
                    <BoutonDroit onClick={volets.basculerDroite} />
                    <MenuActions />
                  </Group>
                </Paper>
              </Group>
            )}
          </Group>
        )}
        {v.reseau === 'hors-ligne' ? (
          <Alert variant="light" color="orange" icon={<IconWifiOff />} radius={0}>
            Hors ligne : vos modifications sont gardées et seront envoyées au retour de la connexion.
          </Alert>
        ) : null}
        {liste ? (
          <Box maw={Number(v.colonne)} mx="auto" p="md">
            <Breadcrumbs mb="md"><Anchor>Mes documents</Anchor></Breadcrumbs>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Nom</Table.Th><Table.Th>Modifié</Table.Th><Table.Th>Mon rôle</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {documents.map((d) => (
                  <Table.Tr key={d.nom} onClick={() => setV({ ...v, ecran: 'document' })}>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        {d.dossier ? <IconFolder size={18} /> : <IconFileText size={18} />}
                        <Text size="sm">{d.nom}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{d.modifie}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{d.role}</Text></Table.Td>
                    <Table.Td><ActionIcon variant="subtle" aria-label="Actions"><IconDots size={18} /></ActionIcon></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        ) : (
          <Box maw={Number(v.colonne)} mx="auto" py="md" onClick={lectureDabord ? commencer : undefined}>
            {titreEnHaut ? null : <Title order={1} px={10} pt={bandeau ? 'xl' : 'md'} pb="md">{TITRE}</Title>}
            <BlockNoteView editor={editeur} editable={!lectureDabord} formattingToolbar={false}>
              <FormattingToolbarController formattingToolbar={Palette} />
            </BlockNoteView>
          </Box>
        )}
      </AppShell.Main>
    </AppShell>
  )
}

function Racine() {
  const [v, setV] = useState({
    ecran: 'document', barre: 'bandeau', titre: 'barre', colonne: '720', saisie: 'auto', bleu: 'nuance8', reseau: 'en-ligne',
  })
  const theme = createTheme({
    ...REGLAGES.theme,
    ...(v.bleu === 'nuance8' ? { primaryShade: 8 } : {}),
    ...(v.bleu === 'noir' ? { autoContrast: true } : {}),
  })
  return (
    <MantineProvider theme={theme} {...REGLAGES.fournisseur}>
      <Maquette v={v} setV={setV} />
      <Variantes v={v} setV={setV} />
    </MantineProvider>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><Racine /></StrictMode>)
