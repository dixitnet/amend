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
const famille = (famille, dossier, fichier) => ({
  famille,
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

const corps = (cle, groupe) => ({ cle, groupe, type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.5 })
const mm = (cle, groupe, max = 100) => ({ cle, groupe, type: 'nombre', unite: 'mm', min: 0, max, pas: 0.5 })
const TITRE_COURANT = ['rien', 'titreDocument', 'chapitre']
/** Réglages ouverts aux équipes, par groupe du formulaire. */
const REGLABLES_EQUIPE = [
  { cle: 'page.largeur', groupe: 'format', type: 'nombre', unite: 'mm', min: 80, max: 450, pas: 0.5 },
  { cle: 'page.hauteur', groupe: 'format', type: 'nombre', unite: 'mm', min: 80, max: 450, pas: 0.5 },
  mm('marges.haut', 'format'),
  mm('marges.interieure', 'format'),
  mm('marges.exterieure', 'format'),
  { cle: 'police', groupe: 'texte', type: 'police' },
  corps('grille.corps', 'texte'),
  { cle: 'grille.interligne', groupe: 'texte', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.1 },
  { cle: 'grille.lignes', groupe: 'texte', type: 'entier', min: 1 },
  mm('alinea', 'texte', 50),
  { cle: 'cesure', groupe: 'texte', type: 'booleen' },
  { cle: 'separateur', groupe: 'texte', type: 'choix', options: ['blanc', 'asterisme', 'etoiles', 'trait'] },
  { cle: 'chapitre.debut', groupe: 'titres', type: 'choix', options: ['continuer', 'page', 'belle-page'] },
  corps('titre.corps', 'titres'),
  corps('sousTitre.corps', 'titres'),
  {
    cle: 'folio.position',
    groupe: 'pages',
    type: 'choix',
    options: ['bas-centre', 'bas-exterieur', 'haut-exterieur', 'aucun'],
  },
  { cle: 'folio.depart', groupe: 'pages', type: 'entier', min: 1, max: 9999 },
  { cle: 'enTete.gauche', groupe: 'pages', type: 'choix', options: TITRE_COURANT },
  { cle: 'enTete.droite', groupe: 'pages', type: 'choix', options: TITRE_COURANT },
]
/** Réglages d'un modèle de l'instance : ceux des équipes, et le reste du modèle. */
const REGLABLES_INSTANCE = [
  ...REGLABLES_EQUIPE,
  { cle: 'chapitre.ligneTitre', groupe: 'titres', type: 'entier', min: 1 },
  { cle: 'chapitre.ligneTexte', groupe: 'titres', type: 'entier', min: 2 },
  corps('chapitre.corps', 'titres'),
  { cle: 'chapitre.interligne', groupe: 'titres', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.1 },
  { cle: 'chapitre.graisse', groupe: 'titres', type: 'entier', min: 100, max: 900, pas: 100 },
  { cle: 'titre.graisse', groupe: 'titres', type: 'entier', min: 100, max: 900, pas: 100 },
  { cle: 'sousTitre.italique', groupe: 'titres', type: 'booleen' },
  { cle: 'intertitres.italique', groupe: 'titres', type: 'booleen' },
  { cle: 'intertitres.lignesAvant', groupe: 'titres', type: 'entier', min: 0, max: 10 },
  { cle: 'intertitres.lignesApres', groupe: 'titres', type: 'entier', min: 0, max: 10 },
  mm('citation.retrait', 'texte', 50),
  mm('folio.bas', 'pages'),
  { cle: 'folio.ouverture', groupe: 'pages', type: 'booleen' },
]

// Les modèles de mise en page des livres exportés en PDF (règle 21 : le
// design des rendus imprimés). Chaque modèle d'amend.ink est une décision
// de Sylvain ; ceux des équipes en dérivent, par des écarts pris dans
// `reglables` (ADR 0011).
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
      police: 'EB Garamond',
      polices: POLICES_EB_GARAMOND,
      alinea: 5,
      folio: { bas: 15, position: 'bas-centre', depart: 1, ouverture: true },
      enTete: { gauche: 'rien', droite: 'rien' },
      chapitre: { debut: 'page', ligneTitre: 3, ligneTexte: 7, corps: 16, interligne: 19, graisse: 600 },
      intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
      citation: { retrait: 8 },
      titre: { corps: 20, graisse: 600 },
      sousTitre: { corps: 14, italique: true },
      separateur: 'blanc',
      cesure: true,
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
        police: 'EB Garamond',
        alinea: 4.5,
        folio: { bas: 18, position: 'bas-centre', depart: 1, ouverture: true },
        enTete: { gauche: 'rien', droite: 'rien' },
        chapitre: { debut: 'belle-page', ligneTitre: 7, ligneTexte: 12, corps: 13, interligne: 14, graisse: 600 },
        intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
        citation: { retrait: 5 },
        titre: { corps: 13, graisse: 600 },
        sousTitre: { corps: 13, italique: true },
        separateur: 'blanc',
        cesure: true,
      },
    },
  ],
  // Les réglages qu'une équipe peut changer dans son modèle (Sylvain,
  // 10/11/2026, « tout » : format, marges, corps, interligne, lignes,
  // police, alinéa, chapitre ; 12/11/2026 : titre et sous-titre, folio,
  // titre courant, séparateur, césure). Bornes et pas reprises de la v1
  // (shared/style.js : format 80 à 450 mm, marges 0 à 100 mm, corps 5 à
  // 96 pt, retrait 0 à 50 mm, par 0,5) ; le nombre de lignes n'a que la
  // borne basse, la grille dit s'il tient. `groupe` : la section du formulaire.
  reglables: REGLABLES_EQUIPE,
  // Les réglages d'un modèle de l'instance (administrateurs, 12/11/2026 :
  // « tout le modèle ») : ceux des équipes et le reste du modèle.
  reglablesInstance: REGLABLES_INSTANCE,
  // Largeur utile minimale entre les marges, en mm (v1, `UTILE_MIN`).
  largeurUtileMin: 40,
}
