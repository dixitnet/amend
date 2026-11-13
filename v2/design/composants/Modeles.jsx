// Composants de présentation de l'export et des modèles de mise en page
// (étape 7, docs/v2-etape-7-modeles-plan.md) : le contenu de la fenêtre
// « Exporter » (comme ModalExport de Docs : un format, et pour le PDF un
// modèle), la liste des modèles et la page de réglage d'un modèle.
// Mantine sans réglage ; textes traduits ; ils n'appellent rien et ne
// décident rien : les champs, leurs bornes et leurs valeurs viennent de
// l'application, les gestes remontent par les fonctions de rappel. Placés
// dans une `Fenetre`, qui porte le titre.
import {
  Stack,
  Group,
  Text,
  Title,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Button,
  Badge,
  FileButton,
  Table,
  Menu,
  Anchor,
  NavLink,
  Grid,
  Container,
  VisuallyHidden,
} from '@mantine/core'
import { useState } from 'react'
import { REGLAGES } from '../reglages.js'

/**
 * Le contenu de la fenêtre « Exporter ».
 * @param {{
 *   libelles: { format: string, modele: string, exporter: string, annuler: string },
 *   formats: Array<{ value: string, label: string }>, format: string, surFormat: (f: string) => void,
 *   modeles: Array<any> | null, modele: string | null, surModele: (m: string) => void,
 *   enCours: boolean, message?: string | null, surExporter: () => void, surAnnuler: () => void,
 * }} props  `modeles` : les données d'un Select de Mantine (groupes permis),
 *   ou `null` quand le format n'en a pas
 */
export function PanneauExport({
  libelles,
  formats,
  format,
  surFormat,
  modeles,
  modele,
  surModele,
  enCours,
  message,
  surExporter,
  surAnnuler,
}) {
  return (
    <Stack>
      <Select label={libelles.format} data={formats} value={format} onChange={surFormat} allowDeselect={false} />
      {modeles ? (
        <Select label={libelles.modele} data={modeles} value={modele} onChange={surModele} allowDeselect={false} />
      ) : null}
      {message ? <Text role="status">{message}</Text> : null}
      <Group>
        <Button {...REGLAGES.boutonSecondaire} onClick={surAnnuler}>
          {libelles.annuler}
        </Button>
        <Button loading={enCours} onClick={surExporter} data-autofocus>
          {libelles.exporter}
        </Button>
      </Group>
    </Stack>
  )
}

/**
 * Les modèles de mise en page (équipe ou instance) : le modèle par défaut, un
 * tableau (nom, format, police, documents, étiquette « Défaut ») avec un menu
 * d'actions par ligne, et un seul bouton « Nouveau modèle » (13/11/2026). Le
 * nom d'un modèle mène à sa page de réglage ; « Dupliquer » ouvre la création
 * avec le modèle choisi comme départ.
 * @param {{
 *   libelles: { defaut: string, nom: string, base: string, creer: string, nouveau: string, annuler: string,
 *     regler: string, dupliquer: string, supprimer: string, actions: string, aucun: string,
 *     colonnes: { nom: string, format: string, police: string, documents: string },
 *     actionsDe: (nom: string) => string, copieDe: (nom: string) => string,
 *     titres?: { defaut?: string, liste?: string } },
 *   defaut: { options: Array<any>, valeur: string, surChange: (v: string) => void },
 *   intro?: string | null,
 *   modeles: Array<{ cle: string, nom: string, adresse: string, format?: string | null, police?: string | null,
 *     detail: string, parDefaut?: string | null }>,
 *   essayer?: { libelle: string, surClic: (cle: string) => void } | null,
 *   bases: Array<{ value: string, label: string }>, message?: string | null,
 *   surCreer: (nom: string, base: string) => void, surSupprimer: (cle: string) => void,
 * }} props
 */
export function PanneauModeles({
  libelles,
  intro = null,
  defaut,
  modeles,
  bases,
  message,
  essayer = null,
  surCreer,
  surSupprimer,
}) {
  // Le formulaire de création : fermé, ou ouvert (avec un nom et un départ, éventuellement proposés par « Dupliquer »).
  const [creation, setCreation] = useState(null)
  const soumettre = (e) => {
    e.preventDefault()
    const nom = creation.nom.trim()
    if (nom) {
      surCreer(nom, creation.base)
      setCreation(null)
    }
  }
  const { titres = {} } = libelles
  return (
    <Stack>
      {intro ? <Text>{intro}</Text> : null}
      {titres.defaut ? <Title order={3}>{titres.defaut}</Title> : null}
      <Select
        label={libelles.defaut}
        data={defaut.options}
        value={defaut.valeur}
        onChange={defaut.surChange}
        allowDeselect={false}
      />
      {titres.liste ? <Title order={3}>{titres.liste}</Title> : null}
      {modeles.length ? (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{libelles.colonnes.nom}</Table.Th>
              <Table.Th>{libelles.colonnes.format}</Table.Th>
              <Table.Th>{libelles.colonnes.police}</Table.Th>
              <Table.Th>{libelles.colonnes.documents}</Table.Th>
              <Table.Th>
                <VisuallyHidden>{libelles.actions}</VisuallyHidden>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {modeles.map((m) => (
              <Table.Tr key={m.cle}>
                <Table.Td>
                  <Group>
                    <Anchor href={m.adresse}>{m.nom}</Anchor>
                    {m.parDefaut ? <Badge>{m.parDefaut}</Badge> : null}
                  </Group>
                </Table.Td>
                <Table.Td>{m.format}</Table.Td>
                <Table.Td>{m.police}</Table.Td>
                <Table.Td>{m.detail}</Table.Td>
                <Table.Td>
                  <Menu>
                    <Menu.Target>
                      <Button {...REGLAGES.boutonSecondaire} aria-label={libelles.actionsDe(m.nom)}>
                        {libelles.actions}
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item component="a" href={m.adresse}>
                        {libelles.regler}
                      </Menu.Item>
                      <Menu.Item onClick={() => setCreation({ nom: libelles.copieDe(m.nom), base: m.cle })}>
                        {libelles.dupliquer}
                      </Menu.Item>
                      {essayer ? <Menu.Item onClick={() => essayer.surClic(m.cle)}>{essayer.libelle}</Menu.Item> : null}
                      <Menu.Item {...REGLAGES.boutonDanger} onClick={() => surSupprimer(m.cle)}>
                        {libelles.supprimer}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text>{libelles.aucun}</Text>
      )}
      {message ? <Text role="status">{message}</Text> : null}
      {creation ? (
        <form onSubmit={soumettre}>
          <Group>
            <TextInput
              name="nom"
              label={libelles.nom}
              value={creation.nom}
              onChange={(e) => setCreation({ ...creation, nom: e.currentTarget.value })}
              required
              data-autofocus
            />
            <Select
              name="base"
              label={libelles.base}
              data={bases}
              value={creation.base}
              onChange={(base) => setCreation({ ...creation, base })}
              allowDeselect={false}
            />
            <Button {...REGLAGES.boutonSecondaire} onClick={() => setCreation(null)}>
              {libelles.annuler}
            </Button>
            <Button type="submit">{libelles.creer}</Button>
          </Group>
        </form>
      ) : (
        <Group>
          <Button onClick={() => setCreation({ nom: '', base: bases[0]?.value })}>{libelles.nouveau}</Button>
        </Group>
      )}
    </Stack>
  )
}

/**
 * La page de réglage d'un modèle (13/11/2026) : à gauche les rubriques (le nom,
 * puis un groupe de réglages par style), à droite celle qu'on règle ; Enregistrer
 * et Annuler restent en bas. Les valeurs de toutes les rubriques sont gardées
 * pendant qu'on change de rubrique.
 * @param {{
 *   libelles: { nom: string, general: string, retour: string, enregistrer: string, annuler: string },
 *   titre: string, adresseRetour: string,
 *   nom: string,
 *   groupes: Array<{ cle: string, libelle: string }>,
 *   champs: Array<{ cle: string, type: 'nombre' | 'entier' | 'booleen' | 'police' | 'choix', libelle: string, valeur: any,
 *     groupe?: string, min?: number, max?: number, pas?: number, options?: Array<{ value: string, label: string }> }>,
 *   message?: string | null, surEnregistrer: (o: { nom: string, valeurs: Record<string, any> }) => void,
 *   surAnnuler: () => void,
 * }} props
 */
export function PageReglageModele({
  libelles,
  titre,
  adresseRetour,
  nom,
  groupes,
  champs,
  message,
  surEnregistrer,
  surAnnuler,
}) {
  const [leNom, setNom] = useState(nom)
  const [valeurs, setValeurs] = useState(() => Object.fromEntries(champs.map((c) => [c.cle, c.valeur])))
  const rubriques = groupes.filter((g) => champs.some((c) => c.groupe === g.cle))
  const [choisie, setChoisie] = useState('general')
  const changer = (cle) => (v) => setValeurs((x) => ({ ...x, [cle]: v }))
  const soumettre = (e) => {
    e.preventDefault()
    surEnregistrer({ nom: leNom.trim(), valeurs })
  }
  const champ = (c) => {
    if (c.type === 'booleen')
      return (
        <Switch
          key={c.cle}
          label={c.libelle}
          checked={Boolean(valeurs[c.cle])}
          onChange={(e) => changer(c.cle)(e.currentTarget.checked)}
        />
      )
    if (c.type === 'police' || c.type === 'choix')
      return (
        <Select
          key={c.cle}
          label={c.libelle}
          data={c.options}
          value={valeurs[c.cle]}
          onChange={changer(c.cle)}
          allowDeselect={false}
        />
      )
    return (
      <NumberInput
        key={c.cle}
        label={c.libelle}
        value={valeurs[c.cle]}
        onChange={changer(c.cle)}
        min={c.min}
        max={c.max}
        step={c.pas ?? 1}
        allowDecimal={c.type !== 'entier'}
        decimalScale={c.type === 'entier' ? 0 : undefined}
        {...REGLAGES.modeles.nombre}
      />
    )
  }
  const { menu, contenu } = REGLAGES.admin.colonnes
  const rubrique = rubriques.find((g) => g.cle === choisie)
  return (
    <Container {...REGLAGES.admin.page}>
      <form onSubmit={soumettre}>
        <Stack>
          <Group>
            <Anchor href={adresseRetour}>{libelles.retour}</Anchor>
          </Group>
          <Title order={1}>{titre}</Title>
          <Grid>
            <Grid.Col {...menu}>
              <nav aria-label={titre}>
                {[{ cle: 'general', libelle: libelles.general }, ...rubriques].map((g) => (
                  <NavLink
                    key={g.cle}
                    component="button"
                    type="button"
                    label={g.libelle}
                    active={g.cle === (rubrique ? choisie : 'general')}
                    aria-current={g.cle === (rubrique ? choisie : 'general') ? 'page' : undefined}
                    onClick={() => setChoisie(g.cle)}
                  />
                ))}
              </nav>
            </Grid.Col>
            <Grid.Col {...contenu}>
              <Stack component="section" aria-label={rubrique ? rubrique.libelle : libelles.general}>
                <Title order={2}>{rubrique ? rubrique.libelle : libelles.general}</Title>
                {rubrique ? (
                  champs.filter((c) => c.groupe === rubrique.cle).map(champ)
                ) : (
                  <TextInput
                    label={libelles.nom}
                    value={leNom}
                    onChange={(e) => setNom(e.currentTarget.value)}
                    required
                  />
                )}
              </Stack>
            </Grid.Col>
          </Grid>
          {message ? <Text role="status">{message}</Text> : null}
          <Group>
            <Button {...REGLAGES.boutonSecondaire} onClick={surAnnuler}>
              {libelles.annuler}
            </Button>
            <Button type="submit">{libelles.enregistrer}</Button>
          </Group>
        </Stack>
      </form>
    </Container>
  )
}

/**
 * Les polices de l'instance (back-office, 13/11/2026) : les familles fournies
 * avec amend.ink, celles que l'administrateur a envoyées (leurs fichiers, ce
 * qui leur manque, les modèles qui s'en servent), et l'envoi de fichiers.
 * @param {{
 *   libelles: { fournies: string, envoyees: string, aucune: string, envoyer: string, supprimer: string,
 *     supprimerDe: (fichier: string) => string },
 *   intro: string, aide: string,
 *   fournies: string[],
 *   familles: Array<{ famille: string, avertissement?: string | null, usage?: string | null,
 *     fichiers: Array<{ cle: string, libelle: string, fichier: string }> }>,
 *   message?: string | null, enCours: boolean,
 *   surFichiers: (fichiers: File[]) => void, surSupprimer: (cle: string) => void,
 * }} props
 */
export function PanneauPolices({
  libelles,
  intro,
  aide,
  fournies,
  familles,
  message,
  enCours,
  surFichiers,
  surSupprimer,
}) {
  return (
    <Stack>
      <Text>{intro}</Text>
      <Title order={3}>{libelles.fournies}</Title>
      <Stack component="ul">
        {fournies.map((f) => (
          <Text component="li" key={f}>
            {f}
          </Text>
        ))}
      </Stack>
      <Title order={3}>{libelles.envoyees}</Title>
      {familles.length ? (
        <Stack component="ul">
          {familles.map((f) => (
            <Stack component="li" key={f.famille}>
              <Text {...REGLAGES.polices.famille}>{f.famille}</Text>
              {f.usage ? <Text>{f.usage}</Text> : null}
              {f.avertissement ? <Text role="note">{f.avertissement}</Text> : null}
              <Stack component="ul">
                {f.fichiers.map((x) => (
                  <Group component="li" key={x.cle}>
                    <Text>{x.libelle}</Text>
                    <Button
                      {...REGLAGES.boutonDanger}
                      {...REGLAGES.polices.supprimer}
                      aria-label={libelles.supprimerDe(x.fichier)}
                      onClick={() => surSupprimer(x.cle)}
                    >
                      {libelles.supprimer}
                    </Button>
                  </Group>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Text>{libelles.aucune}</Text>
      )}
      {message ? <Text role="status">{message}</Text> : null}
      <Group>
        <FileButton onChange={surFichiers} accept=".ttf,.otf" multiple>
          {(props) => (
            <Button {...props} loading={enCours}>
              {libelles.envoyer}
            </Button>
          )}
        </FileButton>
      </Group>
      <Text>{aide}</Text>
    </Stack>
  )
}
