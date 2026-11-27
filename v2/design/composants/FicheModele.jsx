// La fiche d'un modèle de mise en page (Sylvain, 27/11/2026 : « On reprend tout le design […] le plus simple et
// le plus lisible » ; docs/v2-grille-plan.md, § 10). Le modèle se lit en clair, une ligne par réglage sous quatre
// rubriques ; une ligne s'ouvre pour être réglée, une seule à la fois (Accordion de Mantine). À côté, en formats
// L et M, une page d'aperçu qui suit ce qu'on règle.
// Présentation seule : les lignes, leurs champs, leur résumé, ce que la grille calcule et le plan de la page
// viennent de l'application ; les gestes remontent par les fonctions de rappel. Mantine sans réglage ; les mesures
// de la page d'aperçu sont celles du modèle, posées en variables pour sa feuille (design/feuilles/apercu-modele.css).
import {
  Accordion,
  Alert,
  Anchor,
  Button,
  Chip,
  Container,
  Grid,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { REGLAGES } from '../reglages.js'

/** Pose des variables sur un élément : les mesures du modèle, lues par la feuille. */
const poser = (variables) => (el) => {
  if (el) for (const [nom, v] of Object.entries(variables)) el.style.setProperty(`--amend-${nom}`, String(v))
}
const MM_EN_PT = 72 / 25.4
const CENT = 100
/** Une ligne sans signe garde sa hauteur. */
const INSECABLE = String.fromCharCode(160)
/** L'ascendante et la descendante d'une police, par unité de corps : pour poser les lignes de base sur la grille. */
function metriques(police) {
  const defaut = { haut: 0.95, bas: 0.3 }
  if (typeof document === 'undefined') return defaut
  const toile = document.createElement('canvas').getContext('2d')
  if (!toile) return defaut
  // Mesurée à cent pixels, puis ramenée à l'unité : une mesure, non un réglage.
  toile.font = `${CENT}px "${police}", Georgia, serif`
  const m = toile.measureText('Hxg')
  return { haut: (m.fontBoundingBoxAscent ?? 95) / CENT, bas: (m.fontBoundingBoxDescent ?? 30) / CENT }
}

/**
 * Une page d'aperçu : le papier, la zone de texte, les blocs comptés en lignes.
 * @param {{ plan: object, grille: boolean, ouvert: string | null, police: number }} props
 *   `plan` : le plan de la page (application) ; `police` change quand la police du modèle est chargée
 */
function PageApercu({ plan, grille, ouvert, police }) {
  const boite = useRef(null)
  const page = useRef(null)
  const [largeur, setLargeur] = useState(0)
  useEffect(() => {
    if (!boite.current || typeof ResizeObserver === 'undefined') return undefined
    const suivi = new ResizeObserver(() => setLargeur(boite.current.clientWidth))
    suivi.observe(boite.current)
    setLargeur(boite.current.clientWidth)
    return () => suivi.disconnect()
  }, [])
  // Un millimètre et un point du livre, en pixels de l'écran ; le pas tombe sur un trente-deuxième de pixel, pour
  // que les demi-lignes s'additionnent sans dérive.
  const mm = largeur / plan.largeur
  const pt = mm / MM_EN_PT
  const pas = Math.round(plan.pas * pt * 32) / 32
  const corps = plan.corps * pt
  const m = metriques(plan.police)
  /** La ligne de base d'une ligne de ce corps, depuis le haut de sa boîte de hauteur `h`. */
  const base = (h, c) => (h - (m.haut + m.bas) * c) / 2 + m.haut * c
  const baseDuTexte = base(pas, corps)
  // Un titre est mesuré : sa hauteur arrondie à la ligne supérieure, le complément au-dessus, sa dernière ligne
  // de base sur la grille (comme le gabarit Typst).
  useLayoutEffect(() => {
    if (!page.current || !pas) return
    for (const titre of page.current.querySelectorAll('[data-titre]')) {
      titre.style.setProperty('--amend-complement', '0')
      const h = titre.getBoundingClientRect().height
      titre.style.setProperty('--amend-complement', String(Math.ceil(h / pas - 1e-4) * pas - h))
    }
  })
  const bloc = (b, i) => {
    if (b.sorte === 'texte')
      return (
        <p key={i} ref={poser({ alinea: b.alinea * mm })}>
          {b.texte}
        </p>
      )
    if (b.sorte === 'blanc' || b.sorte === 'ajout')
      return <div key={i} className="amend-apercu-vide" data-sorte={b.sorte} ref={poser({ n: b.lignes })} />
    if (b.sorte === 'image')
      return (
        <div key={i} className="amend-apercu-image" ref={poser({ n: b.lignes })}>
          {b.texte}
        </div>
      )
    if (b.sorte === 'signe')
      return (
        <div key={i} className="amend-apercu-signe">
          {b.texte || INSECABLE}
        </div>
      )
    if (b.sorte === 'saut')
      return (
        <div key={i} className="amend-apercu-saut">
          {b.texte}
        </div>
      )
    const c = b.corps * pt
    const interligne = b.sorte === 'titre' ? b.interligne * pt : pas
    // La ligne de base du bloc rejoint celle de la grille : depuis le bas de sa dernière ligne, comme le texte.
    const decalage = interligne - base(interligne, c) - (pas - baseDuTexte)
    return (
      <div
        key={i}
        className="amend-apercu-bloc"
        data-titre={b.sorte === 'titre' ? '' : undefined}
        data-ouvert={b.cle === ouvert ? '' : undefined}
        data-gras={b.gras ? '' : undefined}
        data-italique={b.italique ? '' : undefined}
        data-capitales={b.capitales ? '' : undefined}
        data-petites-capitales={b.petitesCapitales ? '' : undefined}
        data-centre={b.centre ? '' : undefined}
        data-justifie={b.justifie ? '' : undefined}
        data-suspendu={b.suspendu ? '' : undefined}
        ref={poser({
          'corps-bloc': c,
          interligne,
          decalage,
          retrait: b.retrait * mm,
          suspendu: b.suspendu * mm,
        })}
      >
        <span>{b.texte}</span>
      </div>
    )
  }
  const enHaut = plan.folio?.place === 'haut-exterieur'
  return (
    <div ref={boite}>
      {largeur ? (
        <div
          ref={(el) => {
            page.current = el
            poser({
              largeur,
              hauteur: plan.hauteur * mm,
              pas,
              corps,
              haut: plan.marges.haut * mm,
              gauche: plan.marges.gauche * mm,
              utile: largeur - (plan.marges.gauche + plan.marges.droite) * mm,
              lignes: plan.lignes,
              base: baseDuTexte,
              police: `"${plan.police}"`,
            })(el)
          }}
          className="amend-apercu"
          data-grille={grille ? '' : undefined}
          data-justifie={plan.justifie ? '' : undefined}
          data-cesure={plan.cesure ? '' : undefined}
          data-police={police}
          lang={typeof document === 'undefined' ? undefined : document.documentElement.lang}
          aria-hidden="true"
        >
          {plan.enTete || (plan.folio && enHaut) ? (
            <div
              className="amend-apercu-hors-texte"
              data-place="haut"
              data-cote={plan.folio && enHaut ? 'exterieur' : undefined}
            >
              {plan.enTete ? (
                <span
                  data-italique={plan.enTete.italique ? '' : undefined}
                  data-petites-capitales={plan.enTete.petitesCapitales ? '' : undefined}
                >
                  {plan.enTete.texte}
                </span>
              ) : null}
              {plan.folio && enHaut ? <span> {plan.folio.texte}</span> : null}
            </div>
          ) : null}
          <div className="amend-apercu-zone">{plan.blocs.map(bloc)}</div>
          {plan.folio && !enHaut ? (
            <div
              className="amend-apercu-hors-texte"
              data-place="bas"
              data-cote={plan.folio.place === 'bas-exterieur' ? 'exterieur' : undefined}
            >
              {plan.folio.texte}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * @param {{
 *   libelles: { nom: string, retour: string, enregistrer: string, annuler: string, apercu: string, grille: string, legende: string },
 *   titre: string, adresseRetour: string, nom: string,
 *   rubriques: Array<{ cle: string, titre: string, lignes: Array<{ cle: string, nom: string, rangs: any[][] }> }>,
 *   valeurs: Record<string, any>,
 *   resume: (ligne: string, valeurs: Record<string, any>) => string,
 *   notes: (ligne: string, valeurs: Record<string, any>) => Array<{ texte: string, alerte?: boolean }>,
 *   apercu?: { vues: Array<{ value: string, label: string }>, vueDe: (ligne: string) => string | null,
 *     plan: (valeurs: Record<string, any>, vue: string) => object | null, chargerPolice: (famille: string) => Promise<void> } | null,
 *   message?: string | null, surEnregistrer: (o: { nom: string, valeurs: Record<string, any> }) => void, surAnnuler: () => void,
 * }} props
 *   un champ d'un rang : `{ cle, type: 'nombre' | 'entier' | 'booleen' | 'police' | 'choix' | 'texte' | 'pastilles', libelle,
 *   min?, max?, pas?, aide?, options?, presentation?: 'segments', visibleSi? }` ; les pastilles réunissent des réglages à
 *   deux états (`options: [{ cle, libelle, oui?, non? }]`)
 */
export function FicheModele({
  libelles,
  titre,
  adresseRetour,
  nom,
  rubriques,
  valeurs: depart,
  resume,
  notes,
  apercu = null,
  message,
  surEnregistrer,
  surAnnuler,
}) {
  const [leNom, setNom] = useState(nom)
  const [valeurs, setValeurs] = useState(depart)
  const [ouverte, setOuverte] = useState(null)
  const [vue, setVue] = useState(apercu?.vues[0]?.value ?? null)
  const [grille, setGrille] = useState(true)
  const [police, setPolice] = useState(0)
  const changer = (cle) => (v) => setValeurs((x) => ({ ...x, [cle]: v }))
  const ouvrir = (cle) => {
    setOuverte(cle)
    // L'aperçu montre ce qu'on règle.
    const visee = cle && apercu?.vueDe(cle)
    if (visee) setVue(visee)
  }
  const plan = apercu && vue ? apercu.plan(valeurs, vue) : null
  // La police du modèle, chargée pour l'écran : la page se redessine quand elle arrive.
  const famille = plan?.police
  useEffect(() => {
    let vivant = true
    if (famille && apercu) apercu.chargerPolice(famille).then(() => vivant && setPolice((n) => n + 1))
    return () => {
      vivant = false
    }
  }, [famille])
  const visible = (c) =>
    !(c.visibleSi && 'egal' in c.visibleSi && valeurs[c.visibleSi.cle] !== c.visibleSi.egal) &&
    !(c.visibleSi && 'different' in c.visibleSi && valeurs[c.visibleSi.cle] === c.visibleSi.different)
  const champ = (c) => {
    if (c.type === 'texte')
      return (
        <TextInput
          key={c.cle}
          label={c.libelle}
          value={valeurs[c.cle] ?? ''}
          onChange={(e) => changer(c.cle)(e.currentTarget.value)}
          maxLength={c.max}
        />
      )
    if (c.type === 'booleen')
      return (
        <Switch
          key={c.cle}
          label={c.libelle}
          checked={Boolean(valeurs[c.cle])}
          onChange={(e) => changer(c.cle)(e.currentTarget.checked)}
        />
      )
    if (c.type === 'pastilles')
      return (
        <Chip.Group
          key={c.cle}
          multiple
          value={c.options.filter((o) => valeurs[o.cle] === (o.oui ?? true)).map((o) => o.cle)}
          onChange={(choisies) =>
            setValeurs((x) => ({
              ...x,
              ...Object.fromEntries(
                c.options.map((o) => [o.cle, choisies.includes(o.cle) ? (o.oui ?? true) : (o.non ?? false)]),
              ),
            }))
          }
        >
          <Group role="group" aria-label={c.libelle} {...REGLAGES.fiche.pastilles}>
            {c.options.map((o) => (
              <Chip key={o.cle} value={o.cle}>
                {o.libelle}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      )
    if (c.presentation === 'segments')
      return (
        <SegmentedControl
          key={c.cle}
          aria-label={c.libelle}
          data={c.options}
          value={valeurs[c.cle]}
          onChange={changer(c.cle)}
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
        description={c.aide}
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
  const rang = (champs, i) => {
    const vus = champs.filter(visible)
    if (!vus.length) return null
    if (vus.length === 1) return champ(vus[0])
    return (
      <SimpleGrid key={i} {...REGLAGES.fiche.rangee(vus.length)}>
        {vus.map(champ)}
      </SimpleGrid>
    )
  }
  const ligne = (l) => (
    <Accordion.Item key={l.cle} value={l.cle}>
      <Accordion.Control>
        <Text>{l.nom}</Text>
        <Text {...REGLAGES.fiche.resume}>{resume(l.cle, valeurs)}</Text>
      </Accordion.Control>
      <Accordion.Panel>
        {/* Les champs d'une ligne fermée ne sont pas montés : dix-huit lignes, une seule ouverte. */}
        {ouverte === l.cle ? (
          <Stack>
            {l.rangs.map(rang)}
            {notes(l.cle, valeurs).map((n) =>
              n.alerte ? (
                <Alert key={n.texte} {...REGLAGES.fiche.alerte}>
                  {n.texte}
                </Alert>
              ) : (
                <Text key={n.texte} {...REGLAGES.fiche.note}>
                  {n.texte}
                </Text>
              ),
            )}
          </Stack>
        ) : null}
      </Accordion.Panel>
    </Accordion.Item>
  )
  const soumettre = (e) => {
    e.preventDefault()
    surEnregistrer({ nom: leNom.trim(), valeurs })
  }
  return (
    <Container {...REGLAGES.admin.page}>
      <form onSubmit={soumettre}>
        <Stack>
          <Group>
            <Anchor href={adresseRetour}>{libelles.retour}</Anchor>
          </Group>
          <Title order={1}>{titre}</Title>
          <Grid>
            <Grid.Col {...REGLAGES.fiche.colonnes.fiche}>
              <Stack>
                <TextInput
                  label={libelles.nom}
                  value={leNom}
                  onChange={(e) => setNom(e.currentTarget.value)}
                  required
                />
                <Accordion value={ouverte} onChange={ouvrir} {...REGLAGES.fiche.lignes}>
                  {rubriques.map((r) => (
                    <section key={r.cle} aria-label={r.titre}>
                      <Title order={2} {...REGLAGES.fiche.rubrique}>
                        {r.titre}
                      </Title>
                      {r.lignes.map(ligne)}
                    </section>
                  ))}
                </Accordion>
              </Stack>
            </Grid.Col>
            {apercu ? (
              <Grid.Col {...REGLAGES.fiche.colonnes.apercu}>
                <Stack className="amend-apercu-colonne" component="section" aria-label={libelles.apercu}>
                  <Group {...REGLAGES.fiche.commandes.rangee}>
                    <SegmentedControl
                      aria-label={libelles.apercu}
                      data={apercu.vues}
                      value={vue}
                      onChange={setVue}
                      {...REGLAGES.fiche.commandes.taille}
                    />
                    <Switch
                      label={libelles.grille}
                      checked={grille}
                      onChange={(e) => setGrille(e.currentTarget.checked)}
                      {...REGLAGES.fiche.commandes.taille}
                    />
                  </Group>
                  {plan ? <PageApercu plan={plan} grille={grille} ouvert={ouverte} police={police} /> : null}
                  <Text {...REGLAGES.fiche.legende}>{libelles.legende}</Text>
                </Stack>
              </Grid.Col>
            ) : null}
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
