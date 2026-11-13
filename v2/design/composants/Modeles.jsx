// Composants de présentation de l'export et des modèles de mise en page
// (étape 7, docs/v2-etape-7-modeles-plan.md) : le contenu de la fenêtre
// « Exporter » (comme ModalExport de Docs : un format, et pour le PDF un
// modèle), la liste des modèles d'une équipe et le formulaire d'un modèle.
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
  Fieldset,
  FileButton,
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
 * Les modèles de mise en page d'une équipe : le modèle par défaut, la liste
 * (nom, modèle de base, nombre de documents), et la création d'un modèle.
 * @param {{
 *   libelles: { defaut: string, nom: string, base: string, creer: string, modifier: string, supprimer: string,
 *     aucun: string, modifierDe: (nom: string) => string, supprimerDe: (nom: string) => string },
 *   defaut: { options: Array<any>, valeur: string, surChange: (v: string) => void },
 *   intro?: string | null,
 *   modeles: Array<{ cle: string, nom: string, resume?: string | null, detail: string, parDefaut?: string | null }>,
 *   essayer?: { libelle: string, libelleDe: (nom: string) => string, surClic: (cle: string) => void } | null,
 *   bases: Array<{ value: string, label: string }>, message?: string | null,
 *   surCreer: (nom: string, base: string) => void, surModifier: (cle: string) => void, surSupprimer: (cle: string) => void,
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
  surModifier,
  surSupprimer,
}) {
  const soumettre = (e) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const nom = String(f.get('nom') || '').trim()
    if (nom) {
      surCreer(nom, String(f.get('base')))
      e.currentTarget.reset()
    }
  }
  // Trois blocs titrés (13/11/2026, « clarifier la page modèles ») : le
  // défaut, les modèles, la création ; `intro` explique d'où viennent les modèles.
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
        <Stack component="ul">
          {modeles.map((m) => (
            <Group component="li" key={m.cle}>
              <Stack>
                <Text>{m.nom}</Text>
                {m.resume ? <Text>{m.resume}</Text> : null}
                <Text>{m.detail}</Text>
              </Stack>
              {m.parDefaut ? <Badge>{m.parDefaut}</Badge> : null}
              {essayer ? (
                <Button
                  {...REGLAGES.boutonSecondaire}
                  aria-label={essayer.libelleDe(m.nom)}
                  onClick={() => essayer.surClic(m.cle)}
                >
                  {essayer.libelle}
                </Button>
              ) : null}
              <Button aria-label={libelles.modifierDe(m.nom)} onClick={() => surModifier(m.cle)}>
                {libelles.modifier}
              </Button>
              <Button
                {...REGLAGES.boutonDanger}
                aria-label={libelles.supprimerDe(m.nom)}
                onClick={() => surSupprimer(m.cle)}
              >
                {libelles.supprimer}
              </Button>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text>{libelles.aucun}</Text>
      )}
      {message ? <Text role="status">{message}</Text> : null}
      {titres.creer ? <Title order={3}>{titres.creer}</Title> : null}
      <form onSubmit={soumettre}>
        <Group>
          <TextInput name="nom" label={libelles.nom} required />
          <Select name="base" label={libelles.base} data={bases} defaultValue={bases[0]?.value} allowDeselect={false} />
          <Button type="submit">{libelles.creer}</Button>
        </Group>
      </form>
    </Stack>
  )
}

/**
 * Le formulaire d'un modèle (d'équipe ou de l'instance) : son nom et les
 * réglages ouverts, par groupe (12/11/2026 : format, texte, titres, pages).
 * @param {{
 *   libelles: { nom: string, enregistrer: string, annuler: string },
 *   nom: string,
 *   groupes?: Array<{ cle: string, libelle: string }>,
 *   champs: Array<{ cle: string, type: 'nombre' | 'entier' | 'booleen' | 'police' | 'choix', libelle: string, valeur: any,
 *     groupe?: string, min?: number, max?: number, pas?: number, options?: Array<{ value: string, label: string }> }>,
 *   message?: string | null, surEnregistrer: (o: { nom: string, valeurs: Record<string, any> }) => void,
 *   surAnnuler: () => void,
 * }} props
 */
export function FormulaireModele({ libelles, nom, groupes = [], champs, message, surEnregistrer, surAnnuler }) {
  const [leNom, setNom] = useState(nom)
  const [valeurs, setValeurs] = useState(() => Object.fromEntries(champs.map((c) => [c.cle, c.valeur])))
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
  return (
    <form onSubmit={soumettre}>
      <Stack>
        <TextInput label={libelles.nom} value={leNom} onChange={(e) => setNom(e.currentTarget.value)} required />
        {groupes.length ? (
          <>
            {groupes
              .map((g) => [g, champs.filter((c) => c.groupe === g.cle)])
              .filter(([, cs]) => cs.length)
              .map(([g, cs]) => (
                <Fieldset key={g.cle} legend={g.libelle}>
                  <Stack>{cs.map(champ)}</Stack>
                </Fieldset>
              ))}
            {/* Un réglage sans groupe connu reste visible, après les groupes. */}
            {champs.filter((c) => !groupes.some((g) => g.cle === c.groupe)).map(champ)}
          </>
        ) : (
          champs.map(champ)
        )}
        {message ? <Text role="status">{message}</Text> : null}
        <Group>
          <Button {...REGLAGES.boutonSecondaire} onClick={surAnnuler}>
            {libelles.annuler}
          </Button>
          <Button type="submit">{libelles.enregistrer}</Button>
        </Group>
      </Stack>
    </form>
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
