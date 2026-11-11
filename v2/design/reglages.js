// Les réglages de Mantine décidés par Sylvain : le seul endroit de la v2 où
// une valeur de design peut être fixée. Chaque clé doit figurer, avec sa
// décision, dans l'ADR 0008 (« Réglages décidés ») : un contrat statique le
// vérifie. Sans décision, rien ici : Mantine et BlockNote tels quels.
import { DEFAULT_THEME } from '@mantine/core'
import { REGLAGES_LIVRE } from './reglagesLivre.js'

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
  // L'esthétique de l'instance (Sylvain, 11/11/2026 : « on garde 2
  // esthétiques : atelier + vermillon, et l'interface par défaut ; on bascule
  // sur la 1 » ; choix au back-office plus tard, au niveau de l'instance).
  esthetique: 'atelier',
  // Les esthétiques : chacune complète le thème commun ci-dessus (surcharges
  // de createTheme) ; ses règles de feuille sont dans design/feuilles/,
  // limitées à [data-amend-esthetique='…']. `origine` : le thème commun seul
  // (vert foncé), sans feuille.
  esthetiques: {
    origine: { theme: {} },
    atelier: {
      theme: {
        // Vermillon, « encre de correction » : nuance 7 pour l'interface
        // (texte blanc dessus : 5,2:1), en clair et en sombre.
        colors: {
          vermillon: [
            '#fff0ee',
            '#ffdcd6',
            '#fbb4a8',
            '#f78a77',
            '#f3654d',
            '#f14e33',
            '#e5442a',
            '#c9381f',
            '#b03018',
            '#962611',
          ],
        },
        primaryColor: 'vermillon',
        primaryShade: 7,
      },
    },
  },
  // Les modèles de mise en page des livres (design/reglagesLivre.js, sans
  // Mantine : le serveur les lit aussi, audit du 11/11/2026).
  livre: REGLAGES_LIVRE,
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
  // Le zoom du texte de l'éditeur, en pour cent (Sylvain, 11/11/2026 : « 50,
  // 100, 150 », dans le menu « … », comme le réglage de la v1).
  zoom: { paliers: [50, 100, 150], parDefaut: 100 },
  // L'alerte hors ligne, comme AlertOffline de Docs.
  alerteHorsLigne: { variant: 'light', color: 'orange' },
}
