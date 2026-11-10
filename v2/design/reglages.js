// Les réglages de Mantine décidés par Sylvain : le seul endroit de la v2 où
// une valeur de design peut être fixée. Chaque clé doit figurer, avec sa
// décision, dans l'ADR 0008 (« Réglages décidés ») : un contrat statique le
// vérifie. Sans décision, rien ici : Mantine et BlockNote tels quels.
import { DEFAULT_THEME } from '@mantine/core'

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
  // design des rendus imprimés). Chaque modèle est une décision de Sylvain.
  livre: {
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
        polices: [
          new URL('./polices/EBGaramond-Regular.ttf', import.meta.url).href,
          new URL('./polices/EBGaramond-Italic.ttf', import.meta.url).href,
          new URL('./polices/EBGaramond-SemiBold.ttf', import.meta.url).href,
          new URL('./polices/EBGaramond-SemiBoldItalic.ttf', import.meta.url).href,
        ],
        alinea: 4.5,
        folio: { bas: 18 },
        chapitre: { bellePage: true, ligneTitre: 7, ligneTexte: 12, corps: 13, interligne: 14, graisse: 600 },
        intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
        citation: { retrait: 5 },
      },
    ],
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
  // L'alerte hors ligne, comme AlertOffline de Docs.
  alerteHorsLigne: { variant: 'light', color: 'orange' },
}
