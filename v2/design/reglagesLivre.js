// Les réglages des livres exportés en PDF, décidés par Sylvain (ADR 0008,
// clés `livre.*`) : à part de reglages.js pour ne pas dépendre de Mantine, le
// serveur les lisant aussi (contrôle des modèles d'équipe ; audit partiel du
// 11/11/2026). reglages.js les reprend sous `livre`.

/** Les fichiers d'EB Garamond (romain, italique, demi-gras et son italique). */
const POLICES_EB_GARAMOND = [
  new URL('./polices/EBGaramond-Regular.ttf', import.meta.url).href,
  new URL('./polices/EBGaramond-Italic.ttf', import.meta.url).href,
  new URL('./polices/EBGaramond-SemiBold.ttf', import.meta.url).href,
  new URL('./polices/EBGaramond-SemiBoldItalic.ttf', import.meta.url).href,
]

/** Les familles ajoutées le 13/11/2026 (Sylvain : « une liste de 5 à 10 polices
 * standard à intégrer directement »), sous licence OFL, en versions statiques
 * (le moteur du PDF s'en sert mieux que des polices variables) : romain,
 * italique, gras et gras italique, dans `design/polices/<famille>/` avec la
 * licence de la famille. Le navigateur ne charge les fichiers d'une famille
 * que pour exporter avec un modèle qui s'en sert. */
const famille = (nom, dossier, fichier) => ({
  famille: nom,
  fichiers: ['Regular', 'Italic', 'Bold', 'BoldItalic'].map(
    (style) => new URL(`./polices/${dossier}/${fichier}-${style}.ttf`, import.meta.url).href,
  ),
})
const POLICES_AJOUTEES = [
  famille('Source Serif 4', 'source-serif-4', 'SourceSerif4'),
  famille('Crimson Pro', 'crimson-pro', 'CrimsonPro'),
  famille('Libre Baskerville', 'libre-baskerville', 'LibreBaskerville'),
  famille('Lora', 'lora', 'Lora'),
  famille('Spectral', 'spectral', 'Spectral'),
  famille('Inter', 'inter', 'Inter'),
  famille('Source Sans 3', 'source-sans-3', 'SourceSans3'),
  famille('Roboto', 'roboto', 'Roboto'),
]

const ALIGNEMENTS = ['gauche', 'justifie', 'centre']
const TITRE_COURANT = ['rien', 'titreDocument', 'chapitre']
// Les réglages d'un style, repris de la v1 (`shared/style.js` : taille 5 à 96 pt,
// retrait 0 à 50 mm, espaces) et comptés en lignes de la grille (Sylvain,
// 13/11/2026 : « modifier chacun des styles : titres, texte courant, citation »).
const PROPRIETES_STYLE = {
  police: (cle) => ({ cle, type: 'police' }),
  corps: (cle) => ({ cle, type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.5 }),
  gras: (cle) => ({ cle, type: 'booleen' }),
  italique: (cle) => ({ cle, type: 'booleen' }),
  capitales: (cle) => ({ cle, type: 'booleen' }),
  alignement: (cle) => ({ cle, type: 'choix', options: ALIGNEMENTS }),
  lignesAvant: (cle) => ({ cle, type: 'entier', min: 0, max: 10 }),
  lignesApres: (cle) => ({ cle, type: 'entier', min: 0, max: 10 }),
  alinea: (cle) => ({ cle, type: 'nombre', unite: 'mm', min: 0, max: 50, pas: 0.5 }),
  retrait: (cle) => ({ cle, type: 'nombre', unite: 'mm', min: 0, max: 100, pas: 0.5 }),
}
const reglagesDuStyle = (nom, props) =>
  props.map((p) => ({ ...PROPRIETES_STYLE[p](`styles.${nom}.${p}`), groupe: nom }))
const BLOC = ['police', 'corps', 'gras', 'italique', 'capitales', 'alignement', 'lignesAvant', 'lignesApres']
const mm = (cle, groupe, max = 100) => ({ cle, groupe, type: 'nombre', unite: 'mm', min: 0, max, pas: 0.5 })
/** Les réglages d'un modèle, par groupe du formulaire (un groupe par style) : tout
 * le modèle, pour les équipes comme pour les administrateurs (Sylvain, 13/11/2026). */
const REGLABLES = [
  { cle: 'page.largeur', groupe: 'format', type: 'nombre', unite: 'mm', min: 80, max: 450, pas: 0.5 },
  { cle: 'page.hauteur', groupe: 'format', type: 'nombre', unite: 'mm', min: 80, max: 450, pas: 0.5 },
  mm('marges.haut', 'format'),
  mm('marges.interieure', 'format'),
  mm('marges.exterieure', 'format'),
  // Le texte courant : son corps est celui de la grille.
  ...reglagesDuStyle('texte', ['police']),
  { cle: 'grille.corps', groupe: 'texte', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.5 },
  { cle: 'grille.interligne', groupe: 'texte', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.1 },
  { cle: 'grille.lignes', groupe: 'texte', type: 'entier', min: 1 },
  ...reglagesDuStyle('texte', ['gras', 'italique', 'alignement', 'alinea']),
  { cle: 'cesure', groupe: 'texte', type: 'booleen' },
  { cle: 'separateur', groupe: 'texte', type: 'choix', options: ['blanc', 'asterisme', 'etoiles', 'trait'] },
  ...reglagesDuStyle('citation', [...BLOC, 'alinea', 'retrait']),
  // Le titre de niveau 1 : l'ouverture de chapitre et son style.
  { cle: 'chapitre.debut', groupe: 'titre1', type: 'choix', options: ['continuer', 'page', 'belle-page'] },
  { cle: 'chapitre.ligneTitre', groupe: 'titre1', type: 'entier', min: 1 },
  { cle: 'chapitre.ligneTexte', groupe: 'titre1', type: 'entier', min: 2 },
  { cle: 'chapitre.interligne', groupe: 'titre1', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.1 },
  ...reglagesDuStyle('titre1', ['police', 'corps', 'gras', 'italique', 'capitales', 'alignement']),
  ...['titre2', 'titre3', 'titre4', 'titre5', 'titre', 'sousTitre', 'legende'].flatMap((nom) =>
    reglagesDuStyle(nom, BLOC),
  ),
  {
    cle: 'folio.position',
    groupe: 'pages',
    type: 'choix',
    options: ['bas-centre', 'bas-exterieur', 'haut-exterieur', 'aucun'],
  },
  { cle: 'folio.depart', groupe: 'pages', type: 'entier', min: 1, max: 9999 },
  mm('folio.bas', 'pages'),
  { cle: 'folio.ouverture', groupe: 'pages', type: 'booleen' },
  { cle: 'enTete.gauche', groupe: 'pages', type: 'choix', options: TITRE_COURANT },
  { cle: 'enTete.droite', groupe: 'pages', type: 'choix', options: TITRE_COURANT },
]

/** Un intertitre de A4 simple : au corps du texte, en italique, une ligne avant. */
const INTERTITRE = {
  police: 'EB Garamond',
  corps: 11,
  gras: false,
  italique: true,
  capitales: false,
  alignement: 'gauche',
  lignesAvant: 1,
  lignesApres: 0,
}

// Les modèles de mise en page des livres exportés en PDF (règle 21 : le
// design des rendus imprimés). Chaque modèle d'amend.ink est une décision
// de Sylvain ; un modèle créé par une équipe ou l'instance en est une copie,
// indépendante ensuite (ADR 0011, revu le 13/11/2026).
export const REGLAGES_LIVRE = {
  // Le catalogue des polices (licences OFL), seules permises dans un modèle.
  polices: [{ famille: 'EB Garamond', fichiers: POLICES_EB_GARAMOND }, ...POLICES_AJOUTEES],
  modeles: [
    {
      // « A4 simple » (12/11/2026, valeurs proposées par Claude, à valider
      // par Sylvain sur le PDF) : le modèle par défaut, base de tous les
      // autres. A4, grille de 50 lignes de 11/14 pt, chapitre en page
      // suivante, folio centré en bas.
      id: 'a4',
      page: { largeur: 210, hauteur: 297 },
      marges: { haut: 25, interieure: 20, exterieure: 20 },
      grille: { corps: 11, interligne: 14, lignes: 50 },
      folio: { bas: 15, position: 'bas-centre', depart: 1, ouverture: true },
      enTete: { gauche: 'rien', droite: 'rien' },
      separateur: 'blanc',
      cesure: true,
      chapitre: { debut: 'page', ligneTitre: 3, ligneTexte: 7, interligne: 19 },
      styles: {
        texte: { police: 'EB Garamond', gras: false, italique: false, alignement: 'justifie', alinea: 5 },
        citation: {
          police: 'EB Garamond',
          corps: 11,
          gras: false,
          italique: false,
          capitales: false,
          alignement: 'justifie',
          lignesAvant: 0,
          lignesApres: 0,
          alinea: 5,
          retrait: 8,
        },
        titre1: {
          police: 'EB Garamond',
          corps: 16,
          gras: true,
          italique: false,
          capitales: false,
          alignement: 'centre',
        },
        titre2: { ...INTERTITRE },
        titre3: { ...INTERTITRE },
        titre4: { ...INTERTITRE },
        titre5: { ...INTERTITRE },
        titre: {
          police: 'EB Garamond',
          corps: 20,
          gras: true,
          italique: false,
          capitales: false,
          alignement: 'centre',
          lignesAvant: 0,
          lignesApres: 1,
        },
        sousTitre: {
          police: 'EB Garamond',
          corps: 14,
          gras: false,
          italique: true,
          capitales: false,
          alignement: 'centre',
          lignesAvant: 0,
          lignesApres: 1,
        },
        legende: {
          police: 'EB Garamond',
          corps: 9,
          gras: false,
          italique: true,
          capitales: false,
          alignement: 'centre',
          lignesAvant: 0,
          lignesApres: 1,
        },
      },
    },
  ],
  // « TàT - Poche » (Sylvain, 09/11/2026), relevé sur un livre de poche de
  // référence : quitte le code le 12/11/2026 pour devenir un modèle de
  // l'instance, recréé une fois au démarrage du serveur avec ces valeurs
  // (base `a4`). Ses documents et modèles d'équipe sont repris.
  reprise: [
    {
      id: 'tat-poche',
      nom: 'TàT - Poche',
      valeurs: {
        page: { largeur: 120, hauteur: 180 },
        marges: { haut: 18, interieure: 13, exterieure: 13 },
        grille: { corps: 10.5, interligne: 12.4, lignes: 31 },
        folio: { bas: 18, position: 'bas-centre', depart: 1, ouverture: true },
        enTete: { gauche: 'rien', droite: 'rien' },
        separateur: 'blanc',
        cesure: true,
        chapitre: { debut: 'belle-page', ligneTitre: 7, ligneTexte: 12, interligne: 14 },
        styles: {
          texte: { police: 'EB Garamond', gras: false, italique: false, alignement: 'justifie', alinea: 4.5 },
          citation: {
            police: 'EB Garamond',
            corps: 10.5,
            gras: false,
            italique: false,
            capitales: false,
            alignement: 'justifie',
            lignesAvant: 0,
            lignesApres: 0,
            alinea: 4.5,
            retrait: 5,
          },
          titre1: {
            police: 'EB Garamond',
            corps: 13,
            gras: true,
            italique: false,
            capitales: false,
            alignement: 'centre',
          },
          titre2: { ...INTERTITRE, corps: 10.5 },
          titre3: { ...INTERTITRE, corps: 10.5 },
          titre4: { ...INTERTITRE, corps: 10.5 },
          titre5: { ...INTERTITRE, corps: 10.5 },
          titre: {
            police: 'EB Garamond',
            corps: 13,
            gras: true,
            italique: false,
            capitales: false,
            alignement: 'centre',
            lignesAvant: 0,
            lignesApres: 1,
          },
          sousTitre: {
            police: 'EB Garamond',
            corps: 13,
            gras: false,
            italique: true,
            capitales: false,
            alignement: 'centre',
            lignesAvant: 0,
            lignesApres: 1,
          },
          legende: {
            police: 'EB Garamond',
            corps: 9,
            gras: false,
            italique: true,
            capitales: false,
            alignement: 'centre',
            lignesAvant: 0,
            lignesApres: 1,
          },
        },
      },
    },
  ],
  // Les réglages d'un modèle (Sylvain, 13/11/2026) : tout le modèle, pour les
  // équipes comme pour les administrateurs, un groupe par style ; bornes et pas
  // repris de la v1 (shared/style.js). `groupe` : la section du formulaire.
  reglables: REGLABLES,
  // Largeur utile minimale entre les marges, en mm (v1, `UTILE_MIN`).
  largeurUtileMin: 40,
}
