// Les réglages de Mantine décidés par Sylvain : le seul endroit de la v2 où
// une valeur de design peut être fixée. Chaque clé doit figurer, avec sa
// décision, dans l'ADR 0008 (« Réglages décidés ») : un contrat statique le
// vérifie. Sans décision, rien ici : Mantine et BlockNote tels quels.
import { DEFAULT_THEME } from '@mantine/core'

/** Les fichiers d'EB Garamond (romain, italique, demi-gras et son italique). */
const POLICES_EB_GARAMOND = [
  new URL('./polices/EBGaramond-Regular.ttf', import.meta.url).href,
  new URL('./polices/EBGaramond-Italic.ttf', import.meta.url).href,
  new URL('./polices/EBGaramond-SemiBold.ttf', import.meta.url).href,
  new URL('./polices/EBGaramond-SemiBoldItalic.ttf', import.meta.url).href,
]

export const REGLAGES = {
  // Le fournisseur Mantine (MantineProvider).
  fournisseur: { defaultColorScheme: 'auto' },
  // Le thème Mantine (createTheme).
  theme: {
    // Le vert de Mantine, dernière nuance assombrie : le vert du picto
    // (nuance 8) reste dans la palette, et un texte blanc sur la nuance 9
    // passe le contraste (6,1:1).
    colors: { vert: [...DEFAULT_THEME.colors.green.slice(0, 9), '#237032'] },
    primaryColor: 'vert',
    primaryShade: 9,
    components: {
      // La colonne du texte, et de toute page en Container : taille sm (720 px).
      Container: { defaultProps: { size: 'sm' } },
      // Les boutons à picto du bandeau et des volets : discrets.
      ActionIcon: { defaultProps: { variant: 'subtle', size: 'lg' } },
    },
  },
  // Les modèles de mise en page des livres exportés en PDF (règle 21 : le
  // design des rendus imprimés). Chaque modèle d'amend.ink est une décision
  // de Sylvain ; ceux des équipes en dérivent, par des écarts pris dans
  // `reglables` (ADR 0011).
  livre: {
    // Le catalogue des polices (licences OFL), seules permises dans un modèle.
    polices: [{ famille: 'EB Garamond', fichiers: POLICES_EB_GARAMOND }],
    modeles: [
      {
        // « TàT - Poche » (Sylvain, 09/11/2026), relevé sur un livre de poche
        // de référence : grille de 31 lignes, folio à 18 mm du bas, chapitre
        // en belle page, titre à la 7e ligne, texte à la 12e.
        id: 'tat-poche',
        page: { largeur: 120, hauteur: 180 },
        marges: { haut: 18, interieure: 13, exterieure: 13 },
        grille: { corps: 10.5, interligne: 12.4, lignes: 31 },
        police: 'EB Garamond',
        polices: POLICES_EB_GARAMOND,
        alinea: 4.5,
        folio: { bas: 18 },
        chapitre: { bellePage: true, ligneTitre: 7, ligneTexte: 12, corps: 13, interligne: 14, graisse: 600 },
        intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
        citation: { retrait: 5 },
      },
    ],
    // Les réglages qu'une équipe peut changer dans son modèle (Sylvain,
    // 10/11/2026, « tout » : format, marges, corps, interligne, lignes,
    // police, alinéa, chapitre en belle page). Bornes et pas reprises de la
    // v1 (shared/style.js : format 80 à 450 mm, marges 0 à 100 mm, corps 5 à
    // 96 pt, retrait 0 à 50 mm, par 0,5) ; le nombre de lignes n'a que la
    // borne basse, la grille dit s'il tient.
    reglables: [
      { cle: 'page.largeur', type: 'nombre', unite: 'mm', min: 80, max: 450, pas: 0.5 },
      { cle: 'page.hauteur', type: 'nombre', unite: 'mm', min: 80, max: 450, pas: 0.5 },
      { cle: 'marges.haut', type: 'nombre', unite: 'mm', min: 0, max: 100, pas: 0.5 },
      { cle: 'marges.interieure', type: 'nombre', unite: 'mm', min: 0, max: 100, pas: 0.5 },
      { cle: 'marges.exterieure', type: 'nombre', unite: 'mm', min: 0, max: 100, pas: 0.5 },
      { cle: 'grille.corps', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.5 },
      { cle: 'grille.interligne', type: 'nombre', unite: 'pt', min: 5, max: 96, pas: 0.1 },
      { cle: 'grille.lignes', type: 'entier', min: 1 },
      { cle: 'police', type: 'police' },
      { cle: 'alinea', type: 'nombre', unite: 'mm', min: 0, max: 50, pas: 0.5 },
      { cle: 'chapitre.bellePage', type: 'booleen' },
    ],
    // Largeur utile minimale entre les marges, en mm (v1, `UTILE_MIN`).
    largeurUtileMin: 40,
  },
  // La coquille des formats M et L (AppShell de Mantine).
  coquille: {
    bandeau: 60,
    voletGauche: { largeur: 300, min: 300, max: 450 },
    voletDroit: 300,
    // En dessous, l'AppShell passe au format S (hors périmètre) ; au-dessus
    // de `unVolet`, deux volets peuvent être ouverts ensemble.
    pointDeRupture: 'sm',
    unVolet: 'md',
  },
  // Boutons secondaires (Partager, Annuler) : la variante « default » de Mantine.
  boutonSecondaire: { variant: 'default' },
  // Le bouton d'une action qui détruit (supprimer, retirer) : rouge, comme Docs.
  boutonDanger: { color: 'red' },
  // Les messages passagers (notifications), comme les toasts de Docs : 3 s ;
  // en rouge pour une erreur, sinon la couleur de l'interface.
  messages: { duree: 3000, erreur: { color: 'red' } },
  // La pastille du nombre de suggestions : 10 px par défaut, trop petite pour un chiffre.
  nombreSuggestions: { size: 16 },
  // L'arbre du volet « Documents » : les valeurs des liens imbriqués de Mantine
  // (NavLink : lignes jointives, enfants en retrait de `lg`), le menu « … » à
  // côté de chaque ligne.
  arbre: {
    racine: { gap: 0 },
    ligne: { wrap: 'nowrap', gap: 0 },
    enfants: { gap: 0, pl: 'lg' },
  },
  // L'alerte hors ligne, comme AlertOffline de Docs.
  alerteHorsLigne: { variant: 'light', color: 'orange' },
}
