// Maquette visuelle de l'interface téléphone (format S, vertical) d'amend.ink.
// Mantine et BlockNote tels quels, avec les réglages de v2/design/reglages.js
// et la feuille de l'éditeur de la v2 (v2/design/feuilles/editeur.css).
// Aucune fonction réelle : seuls les volets et le passage en modification réagissent.
import '@mantine/core/styles.css'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import '../../../../v2/design/feuilles/editeur.css'
import { StrictMode, useState, useEffect } from 'react'
import { TextSelection } from 'prosemirror-state'
import { createRoot } from 'react-dom/client'
import {
  MantineProvider, createTheme, Group, Menu, Text, ActionIcon, Box, Drawer, Tabs, NavLink,
  Button, Stack, Paper, Badge, Textarea, Divider, getDefaultZIndex,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { fr } from '@blocknote/core/locales'
// Le schéma du livre de la v2 (v2/adaptateurs/blocknote/schema.js), importé tel quel :
// la palette flottante et le menu « / » n'offrent que ce qu'il garde.
import { schemaLivre } from '../../../../v2/adaptateurs/blocknote/schema.js'
import { boutonsGardes } from '../../../../v2/adaptateurs/blocknote/palette.js'
import {
  IconListTree, IconPencilCheck, IconDots, IconLink, IconShare,
  IconDownload, IconPrinter, IconCopy, IconTrash,
  IconFolder, IconFileText, IconFiles, IconWand,
} from '@tabler/icons-react'

const REGLAGES = { fournisseur: { defaultColorScheme: 'auto' }, theme: {} }
const theme = createTheme(REGLAGES.theme)

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
]

// Lecture seule à l'ouverture ; un appui sur le texte passe en modification,
// curseur à l'endroit touché. Tout se fait dans le geste même, sinon le
// téléphone n'ouvre pas le clavier. La propriété `editable` de BlockNoteView
// reste à `false` : on bascule l'éditeur directement, sans la faire changer.
function useModification(editeur) {
  const [enModification, setEnModification] = useState(false)
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
    if (!editeur.isEditable) return
    editeur.isEditable = false
    editeur.prosemirrorView.dom.blur()
    setEnModification(false)
  }
  // Retour en lecture quand le clavier se ferme : la zone visible
  // (visualViewport) retrouve sa hauteur après avoir rétréci.
  useEffect(() => {
    const zone = window.visualViewport
    if (!zone || !enModification) return
    let clavierOuvert = false
    const surRedimension = () => {
      const reduite = zone.height < window.innerHeight * 0.8
      if (reduite) clavierOuvert = true
      else if (clavierOuvert) terminer()
    }
    zone.addEventListener('resize', surRedimension)
    return () => zone.removeEventListener('resize', surRedimension)
  })
  return { enModification, commencer, terminer }
}

// La palette de la v2 (v2/adaptateurs/blocknote/index.jsx) : sans alignement.
function Palette() {
  return (
    <FormattingToolbar>
      {boutonsGardes(getFormattingToolbarItems())}
    </FormattingToolbar>
  )
}

const plan = [
  [2, '1. La fin de l’étalement'], [2, '2. Intensifier les usages'],
  [3, 'La chronotopie'], [2, '3. Transformer l’existant'],
]

function VoletGauche() {
  return (
    <Tabs defaultValue="plan">
      <Tabs.List grow>
        <Tabs.Tab value="plan" leftSection={<IconListTree />}>Plan</Tabs.Tab>
        <Tabs.Tab value="fichiers" leftSection={<IconFiles />}>Documents</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="plan">
        {plan.map(([niveau, titre], i) => (
          <NavLink key={i} label={titre} active={i === 1} pl={`calc(var(--mantine-spacing-md) * ${niveau - 1})`} />
        ))}
      </Tabs.Panel>
      <Tabs.Panel value="fichiers">
        <NavLink label="Réparons la ville" leftSection={<IconFolder />} defaultOpened childrenOffset="md">
          <NavLink label="Réparons la ville !" leftSection={<IconFileText />} active />
          <NavLink label="Notes de lecture" leftSection={<IconFileText />} />
        </NavLink>
        <NavLink label="Urbanisme circulaire" leftSection={<IconFolder />} childrenOffset="md">
          <NavLink label="Manifeste" leftSection={<IconFileText />} />
        </NavLink>
        <NavLink label="Redirection urbaine v3" leftSection={<IconFileText />} />
      </Tabs.Panel>
    </Tabs>
  )
}

const modifications = [
  { qui: 'Claire', quoi: 'Insertion', texte: '« au rythme d’un département tous les dix ans »' },
  { qui: 'Jérôme', quoi: 'Suppression', texte: '« sans rien construire »' },
  { qui: 'Claire', quoi: 'Mise en forme', texte: 'Titre de niveau 3 : « La chronotopie »' },
]

function VoletDroit() {
  return (
    <Tabs defaultValue="modifications">
      <Tabs.List grow>
        <Tabs.Tab value="modifications" leftSection={<IconPencilCheck />}>Modifications</Tabs.Tab>
        <Tabs.Tab value="amend" leftSection={<IconWand />}>Margo (IA)</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="amend">
        <Stack py="md">
          <Paper withBorder p="sm">
            <Text size="sm">« Plus de 80 % des bâtiments qui existeront en 2050 sont déjà construits. »</Text>
            <Text size="sm" c="dimmed">Chiffre à sourcer : ajouter une note de bas de page.</Text>
          </Paper>
          <Paper withBorder p="sm">
            <Text size="sm">« mais de transformer celle que nous habitons »</Text>
            <Text size="sm" c="dimmed">Répétition de « ville » dans les deux phrases.</Text>
          </Paper>
          <Textarea placeholder="Demander à Margo…" autosize />
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="modifications">
        <Stack py="md">
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
    </Tabs>
  )
}

function Maquette() {
  const editeur = useCreateBlockNote({ schema: schemaLivre, initialContent: contenu, dictionary: fr })
  const { enModification, commencer, terminer } = useModification(editeur)
  const [gauche, voletGauche] = useDisclosure(false)
  const [droite, voletDroit] = useDisclosure(false)
  return (
    <>
      <Box component="header" pos="sticky" top="env(safe-area-inset-top, 0px)" bg="var(--mantine-color-body)"
        style={{ zIndex: getDefaultZIndex('app') }}>
        <Group p="xs" wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Plan et documents" onClick={voletGauche.open}>
            <IconListTree />
          </ActionIcon>
          <Text fw={500} truncate="end" flex={1}>
            Réparons la ville !
          </Text>
          {enModification ? <Button variant="subtle" onClick={terminer}>Terminer</Button> : null}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" size="lg" aria-label="Autres actions">
                <IconDots />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconLink />}>Copier le lien</Menu.Item>
              <Menu.Item leftSection={<IconShare />}>Partager</Menu.Item>
              <Menu.Item leftSection={<IconDownload />}>Exporter</Menu.Item>
              <Menu.Item leftSection={<IconPrinter />}>Imprimer</Menu.Item>
              <Menu.Item leftSection={<IconCopy />}>Dupliquer</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash />}>Supprimer</Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <ActionIcon variant="subtle" size="lg" aria-label="Modifications et Margo (IA)" onClick={voletDroit.open}>
            <IconPencilCheck />
          </ActionIcon>
        </Group>
        <Divider />
      </Box>
      <Box component="main" py="md" onClick={commencer}>
        <BlockNoteView editor={editeur} editable={false} formattingToolbar={false}>
          <FormattingToolbarController formattingToolbar={Palette} />
        </BlockNoteView>
      </Box>
      <Drawer opened={gauche} onClose={voletGauche.close} position="left" title="Réparons la ville !">
        <VoletGauche />
      </Drawer>
      <Drawer opened={droite} onClose={voletDroit.close} position="right" title="Relecture">
        <VoletDroit />
      </Drawer>
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme} {...REGLAGES.fournisseur}>
      <Maquette />
    </MantineProvider>
  </StrictMode>,
)
