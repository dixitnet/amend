// La fiche d'un modèle de mise en page (27/11/2026, docs/v2-grille-plan.md, § 10) : le modèle se lit en clair,
// une ligne par réglage, et chaque ligne s'ouvre pour être réglée. Ici, la partie technique : quelles lignes,
// quels champs, ce que dit le résumé de chacune, ce que la grille calcule, et le plan de la page d'aperçu.
// La présentation (`FicheModele`, design) reçoit le tout et ne calcule rien.
import {
  appliquerReglages,
  grille,
  lignesOccupees,
  demiLigneAjoutee,
  blancsDuBloc,
  STYLES_MESURES,
} from '../../domaine/index.js'
import { messageErreur } from '../../i18n/index.js'
import { t } from './commun.js'

/** Les styles de la fiche, dans son ordre, et leur nom. */
const STYLES = {
  titre: () => t('modeles.styles.titre'),
  sousTitre: () => t('modeles.styles.sousTitre'),
  titre1: () => t('modeles.styles.titre1'),
  titre2: () => t('modeles.styles.titre2'),
  titre3: () => t('modeles.styles.titre3'),
  titre4: () => t('modeles.styles.titre4'),
  titre5: () => t('modeles.styles.titre5'),
  citation: () => t('modeles.styles.citation'),
  bibliographie: () => t('modeles.styles.bibliographie'),
  legende: () => t('modeles.styles.legende'),
}
/** Le réglage qui porte le début d'un titre qui peut ouvrir une page. */
const DEBUT = { titre1: 'chapitre.debut', titre2: 'ouverture2.debut' }
const ALLURES = {
  gras: () => t('modeles.propriete.gras'),
  italique: () => t('modeles.propriete.italique'),
  capitales: () => t('modeles.propriete.capitales'),
  petitesCapitales: () => t('modeles.propriete.petitesCapitales'),
}

const nombre = (n) => new Intl.NumberFormat(t.langue, { maximumFractionDigits: 1 }).format(n)
/** Une liste courte, sans « et » : « 11 pt, gras, centré ». */
const enSuite = (parties) => parties.join(t('modeles.fiche.resume.suite'))
/** Un blanc en lignes, la demie écrite « ½ ». */
const demi = (n) => (n % 1 ? (n < 1 ? '½' : `${nombre(Math.floor(n))} ½`) : nombre(n))
const minuscule = (texte) => texte.charAt(0).toLocaleLowerCase(t.langue) + texte.slice(1)

/**
 * Les rubriques et les lignes de la fiche.
 * @param {(cle: string) => object | undefined} champ  le champ d'un réglage, par sa clé (`champsDu`)
 * @returns {Array<{ cle: string, titre: string, lignes: Array<{ cle: string, nom: string, rangs: any[][] }> }>}
 *   `rangs` : les champs d'une ligne ouverte, par rangées ; une rangée de plusieurs nombres les met côte à côte
 */
export function rubriquesDeLaFiche(champ) {
  const rang = (...cles) => cles.map(champ).filter(Boolean)
  const segments = (cle) => [{ ...champ(cle), presentation: 'segments' }]
  /** Des réglages à deux états réunis en pastilles. */
  const pastilles = (cle, libelle, options) => [{ cle, type: 'pastilles', libelle, options }]
  const style = (nom) => ({
    cle: nom,
    nom: STYLES[nom](),
    rangs: [
      ...(DEBUT[nom] ? [segments(DEBUT[nom])] : []),
      rang(`styles.${nom}.corps`, `styles.${nom}.blancAvant`, `styles.${nom}.blancApres`),
      pastilles(`styles.${nom}.allure`, t('modeles.fiche.allure'), [
        ...Object.entries(ALLURES).map(([p, libelle]) => ({ cle: `styles.${nom}.${p}`, libelle: libelle() })),
        // « Centré » : l'alignement, à gauche sinon.
        { cle: `styles.${nom}.alignement`, libelle: t('modeles.fiche.centre'), oui: 'centre', non: 'gauche' },
      ]),
    ],
  })
  return [
    {
      cle: 'page',
      titre: t('modeles.groupes.page'),
      lignes: [
        { cle: 'format', nom: t('modeles.fiche.format'), rangs: [rang('page.largeur', 'page.hauteur')] },
        {
          cle: 'marges',
          nom: t('modeles.fiche.marges'),
          rangs: [rang('marges.haut', 'marges.interieure', 'marges.exterieure')],
        },
        { cle: 'hauteur', nom: t('modeles.fiche.hauteur'), rangs: [rang('grille.lignes')] },
      ],
    },
    {
      cle: 'texte',
      titre: t('modeles.groupes.texte'),
      lignes: [
        {
          cle: 'caractere',
          nom: t('modeles.fiche.caractere'),
          rangs: [rang('styles.texte.police'), rang('grille.corps', 'grille.interligne')],
        },
        {
          cle: 'paragraphes',
          nom: t('modeles.fiche.paragraphes'),
          rangs: [
            segments('styles.texte.alignement'),
            rang('styles.texte.alinea'),
            rang('cesure'),
            rang('chapitre.premierSansAlinea'),
          ],
        },
        { cle: 'separateur', nom: t('modeles.reglage.separateur'), rangs: [segments('separateur')] },
      ],
    },
    { cle: 'styles', titre: t('modeles.groupes.styles'), lignes: Object.keys(STYLES).map(style) },
    {
      cle: 'pages',
      titre: t('modeles.groupes.pages'),
      lignes: [
        {
          cle: 'enTetes',
          nom: t('modeles.fiche.enTetes'),
          rangs: [
            rang('enTete.gauche', 'enTete.droite'),
            rang('enTete.texteGauche', 'enTete.texteDroite'),
            pastilles('enTete.allure', t('modeles.fiche.allure'), [
              { cle: 'enTete.italique', libelle: t('modeles.propriete.italique') },
              { cle: 'enTete.petitesCapitales', libelle: t('modeles.propriete.petitesCapitales') },
            ]),
          ],
        },
        {
          cle: 'folio',
          nom: t('modeles.fiche.folio'),
          rangs: [rang('folio.position', 'folio.depart'), rang('folio.ouverture'), rang('folio.ouverture2')],
        },
      ],
    },
  ]
}

/**
 * Ce que la fiche dit d'un modèle en cours de réglage : le modèle qui résulterait des valeurs saisies, le résumé
 * de chaque ligne, et ce que la grille calcule.
 * @param {object} complet  le modèle enregistré, complet
 * @param {object} regles  les règles des modèles (réglages, polices)
 * @param {(cle: string) => Record<string, () => string> | undefined} optionsDe  les noms des options d'un réglage à choix
 */
export function lectureDeLaFiche(complet, regles, optionsDe) {
  /** Le modèle que donneraient ces valeurs, ou `null` s'il est impossible. */
  const modeleDe = (valeurs) => {
    const r = appliquerReglages(complet, valeurs, regles)
    return r.ok ? r.modele : null
  }
  const option = (cle, v) => optionsDe(cle)?.[v]?.() ?? String(v)
  const resumeDuStyle = (nom, v) => {
    const cle = (p) => v[`styles.${nom}.${p}`]
    const caractere = enSuite([
      t('modeles.fiche.resume.corps', { corps: cle('corps') }),
      ...Object.keys(ALLURES)
        .filter((p) => cle(p))
        .map((p) => minuscule(ALLURES[p]())),
      ...(cle('alignement') === 'centre' ? [minuscule(t('modeles.fiche.centre'))] : []),
    ])
    const [avant, apres] = [cle('blancAvant') || 0, cle('blancApres') || 0]
    const blancs =
      avant || apres
        ? t('modeles.fiche.resume.blancs', { avant: demi(avant), apres: demi(apres) })
        : t('modeles.fiche.resume.sansBlanc')
    const debut = DEBUT[nom] && v[DEBUT[nom]] !== 'continuer' ? [minuscule(option(DEBUT[nom], v[DEBUT[nom]]))] : []
    return [...debut, caractere, blancs].join(' · ')
  }
  const resumes = {
    format: (v) => t('modeles.format', { largeur: v['page.largeur'], hauteur: v['page.hauteur'] }),
    marges: (v) =>
      t('modeles.fiche.resume.marges', {
        haut: v['marges.haut'],
        interieure: v['marges.interieure'],
        exterieure: v['marges.exterieure'],
      }),
    hauteur: (v) => {
      const m = modeleDe(v)
      return m
        ? t('modeles.fiche.resume.hauteur', {
            lignes: v['grille.lignes'],
            pied: Math.round(grille(m).margeBas * 10) / 10,
          })
        : t('modeles.fiche.resume.lignes', { lignes: v['grille.lignes'] })
    },
    caractere: (v) =>
      t('modeles.fiche.resume.caractere', {
        police: v['styles.texte.police'],
        corps: nombre(v['grille.corps']),
        interligne: nombre(v['grille.interligne']),
      }),
    paragraphes: (v) =>
      enSuite([
        minuscule(option('styles.texte.alignement', v['styles.texte.alignement'])),
        v.cesure ? t('modeles.fiche.resume.cesure') : t('modeles.fiche.resume.sansCesure'),
        v['styles.texte.alinea']
          ? t('modeles.fiche.resume.alinea', { alinea: v['styles.texte.alinea'] })
          : t('modeles.fiche.resume.sansAlinea'),
      ]),
    separateur: (v) => option('separateur', v.separateur),
    enTetes: (v) => {
      const dit = (cote, libre) =>
        v[cote] === 'texte' && v[libre]
          ? t('modeles.fiche.resume.citation', { texte: v[libre] })
          : minuscule(option(cote, v[cote]))
      return t('modeles.fiche.resume.enTetes', {
        gauche: dit('enTete.gauche', 'enTete.texteGauche'),
        droite: dit('enTete.droite', 'enTete.texteDroite'),
      })
    },
    folio: (v) =>
      v['folio.position'] === 'aucun'
        ? option('folio.position', 'aucun')
        : enSuite([
            minuscule(option('folio.position', v['folio.position'])),
            t('modeles.fiche.resume.depart', { depart: v['folio.depart'] }),
            ...(v['folio.ouverture'] ? [] : [t('modeles.fiche.resume.sansOuverture')]),
          ]),
  }
  const notes = {
    marges: () => [{ texte: t('modeles.fiche.note.pied') }],
    hauteur: (v) => (modeleDe(v) ? [] : [{ texte: messageErreur(t, 'modele-impossible'), alerte: true }]),
    caractere: () => [{ texte: t('modeles.fiche.note.pas') }],
    paragraphes: () => [{ texte: t('modeles.fiche.note.alinea') }],
    enTetes: () => [{ texte: t('modeles.fiche.note.enTetes') }],
  }
  const notesDuStyle = (nom, v) => {
    const pas = v['grille.interligne']
    const corps = v[`styles.${nom}.corps`]
    const coefficient = complet.grille.hauteurTitre
    const liste = [
      {
        texte: STYLES_MESURES.includes(nom)
          ? t('modeles.fiche.note.titre', {
              une: lignesOccupees(corps, pas, coefficient),
              deux: lignesOccupees(corps, pas, coefficient, 2),
            })
          : t('modeles.fiche.note.brique'),
      },
    ]
    if (DEBUT[nom] && v[DEBUT[nom]] !== 'continuer') liste.push({ texte: t('modeles.fiche.note.ouvre') })
    if (demiLigneAjoutee(v[`styles.${nom}.blancAvant`], v[`styles.${nom}.blancApres`]))
      liste.push({ texte: t('modeles.fiche.note.demi'), alerte: true })
    return liste
  }
  return {
    modeleDe,
    resume: (ligne, valeurs) => (STYLES[ligne] ? resumeDuStyle(ligne, valeurs) : (resumes[ligne]?.(valeurs) ?? '')),
    notes: (ligne, valeurs) => (STYLES[ligne] ? notesDuStyle(ligne, valeurs) : (notes[ligne]?.(valeurs) ?? [])),
  }
}

// --- La page d'aperçu ----------------------------------------------------------
//
// Une approximation dessinée à l'écran (plan, § 10, point 5) : le bouton « Essayer » reste la vérité. Le plan de
// la page est une liste de blocs comptés en lignes ; il lit la règle dans le domaine, comme le gabarit Typst.

/** Les trois vues de l'aperçu, et celle que montre chaque ligne de la fiche. */
export const VUES_APERCU = ['titre', 'ouverture', 'courante']
export const vueDeLaLigne = (ligne) =>
  ligne === 'titre' || ligne === 'sousTitre'
    ? 'titre'
    : ligne === 'titre1' || ligne === 'titre2'
      ? 'ouverture'
      : STYLES[ligne] || ligne === 'separateur' || ligne === 'enTetes' || ligne === 'paragraphes'
        ? 'courante'
        : null

/**
 * Le plan d'une page d'aperçu.
 * @param {object} modele  un modèle compté en lignes
 * @param {'titre' | 'ouverture' | 'courante'} vue
 * @returns {object}  la page (mm), la grille (pt), l'en-tête, le numéro de page et les blocs, de haut en bas
 */
export function planDePage(modele, vue) {
  const { page, marges, grille: g, styles } = modele
  const texte = styles.texte
  const blocs = []
  let apresTitre = false
  const p = (contenu) => {
    blocs.push({
      sorte: 'texte',
      texte: contenu,
      alinea: apresTitre && modele.chapitre.premierSansAlinea ? 0 : texte.alinea,
    })
    apresTitre = false
  }
  const blanc = (lignes, ajoute = false) => lignes > 0 && blocs.push({ sorte: ajoute ? 'ajout' : 'blanc', lignes })
  const bloc = (nom, contenu, ouvre = false) => {
    const st = styles[nom]
    const mesure = STYLES_MESURES.includes(nom)
    const b = blancsDuBloc(st.blancAvant, st.blancApres, ouvre)
    const ajoute = demiLigneAjoutee(st.blancAvant, st.blancApres) ? 0.5 : 0
    blanc(ajoute, true)
    blanc(b.dehors + b.dedans - ajoute)
    blocs.push({
      sorte: mesure ? 'titre' : 'brique',
      cle: nom,
      texte: contenu,
      corps: st.corps,
      // Un titre a son interligne (`hauteurTitre` fois son corps) ; une brique, le pas de la page.
      interligne: mesure ? g.hauteurTitre * st.corps : g.interligne,
      gras: Boolean(st.gras),
      italique: Boolean(st.italique),
      capitales: Boolean(st.capitales),
      petitesCapitales: Boolean(st.petitesCapitales) && !st.capitales,
      centre: st.alignement === 'centre',
      retrait: nom === 'citation' ? texte.alinea : 0,
      suspendu: nom === 'bibliographie' ? texte.alinea : 0,
      justifie: nom === 'citation' && texte.alignement === 'justifie' && st.alignement !== 'centre',
    })
    blanc(b.apres)
    apresTitre = mesure
  }
  const ouvre1 = modele.chapitre.debut !== 'continuer'
  const ouvre2 = modele.ouverture2.debut !== 'continuer'
  let ouverture = false
  if (vue === 'titre') {
    ouverture = true
    bloc('titre', t('modeles.apercu.titre'))
    bloc('sousTitre', t('modeles.apercu.sousTitre'))
    for (const cle of ['a', 'b', 'c', 'd']) p(TEXTES[cle]())
  } else if (vue === 'ouverture') {
    ouverture = ouvre1
    if (!ouvre1) p(TEXTES.d())
    bloc('titre1', t('modeles.apercu.titre1'), ouvre1)
    // Un titre 2 qui ouvre une page à son tour : la page suivante commence ici.
    if (ouvre1 && ouvre2) blocs.push({ sorte: 'saut', texte: t('modeles.apercu.pageSuivante') })
    else p(TEXTES.a())
    bloc('titre2', t('modeles.apercu.titre2'), ouvre2)
    for (const cle of ['b', 'c', 'a', 'd', 'b']) p(TEXTES[cle]())
  } else {
    p(t('modeles.apercu.court'))
    bloc('titre3', t('modeles.apercu.titre3'))
    p(TEXTES.c())
    bloc('citation', t('modeles.apercu.citation'))
    p(TEXTES.d())
    bloc('titre4', t('modeles.apercu.titre4'))
    p(TEXTES.d())
    bloc('titre5', t('modeles.apercu.titre5'))
    p(TEXTES.c())
    blocs.push({ sorte: 'signe', texte: SIGNES[modele.separateur] ?? '' })
    p(TEXTES.b())
    blocs.push({ sorte: 'image', lignes: 3, texte: t('modeles.apercu.image') })
    bloc('legende', t('modeles.apercu.legende'))
    bloc('bibliographie', t('modeles.apercu.bibliographie1'))
    bloc('bibliographie', t('modeles.apercu.bibliographie2'))
    p(TEXTES.a())
  }
  // Une page de droite : l'en-tête de droite, le numéro à l'extérieur à droite.
  const e = modele.enTete
  const libre = e.droite === 'texte' ? e.texteDroite : ''
  const courant = { titreDocument: t('modeles.apercu.titre'), chapitre: t('modeles.apercu.titre1'), texte: libre }[
    e.droite
  ]
  const f = modele.folio
  const numerote = f.position !== 'aucun' && vue !== 'titre' && (!ouverture || f.ouverture)
  return {
    largeur: page.largeur,
    hauteur: page.hauteur,
    marges: { haut: marges.haut, gauche: marges.interieure, droite: marges.exterieure },
    pas: g.interligne,
    corps: g.corps,
    lignes: g.lignes,
    police: texte.police,
    justifie: texte.alignement === 'justifie',
    cesure: modele.cesure !== false,
    enTete:
      !ouverture && courant
        ? { texte: courant, italique: Boolean(e.italique), petitesCapitales: Boolean(e.petitesCapitales) }
        : null,
    folio: numerote ? { texte: String((f.depart ?? 1) + (vue === 'ouverture' ? 6 : 12)), place: f.position } : null,
    blocs,
  }
}

const SIGNES = { asterisme: '⁂', etoiles: '* * *', points: '• • •', trait: '—' }
const TEXTES = {
  a: () => t('modeles.apercu.texteA'),
  b: () => t('modeles.apercu.texteB'),
  c: () => t('modeles.apercu.texteC'),
  d: () => t('modeles.apercu.texteD'),
}
