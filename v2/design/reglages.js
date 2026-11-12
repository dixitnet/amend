// Les réglages de Mantine décidés par Sylvain : le seul endroit de la v2 où
// une valeur de design peut être fixée. Chaque clé doit figurer, avec sa
// décision, dans l'ADR 0008 (« Réglages décidés ») : un contrat statique le
// vérifie. Sans décision, rien ici : Mantine et BlockNote tels quels.
import { DEFAULT_THEME } from '@mantine/core'
import { REGLAGES_LIVRE } from './reglagesLivre.js'
import { APPARENCE } from './apparence.js'

export const REGLAGES = {
  // Le fournisseur Mantine (MantineProvider).
  fournisseur: { defaultColorScheme: 'auto' },
  // Le thème Mantine (createTheme).
  theme: {
    // La couleur principale vient de l'apparence (`couleurs` ci-dessous).
    components: {
      // La colonne du texte, et de toute page en Container : taille sm (720 px).
      Container: { defaultProps: { size: 'sm' } },
      // Les boutons à picto du bandeau et des volets : discrets.
      ActionIcon: { defaultProps: { variant: 'subtle', size: 'lg' } },
    },
  },
  // L'apparence de l'instance, choisie au back-office (Sylvain, 11/11/2026 :
  // « page de réglage du backoffice : modèle d'interface + couleur ») : les
  // noms permis et l'apparence par défaut (design/apparence.js, sans Mantine :
  // le serveur les lit aussi). Le modèle d'interface « atelier » a sa feuille
  // (feuilles/interface-atelier.css) ; « origine » n'en a pas.
  apparence: APPARENCE,
  // Les couleurs proposées (maquette des esthétiques du 11/11/2026) : une
  // palette de 10 nuances et la nuance principale, choisie pour qu'un texte
  // blanc dessus passe le contraste (4,5:1 au moins).
  couleurs: {
    // Vermillon, « encre de correction » : nuance 7 (5,2:1).
    vermillon: {
      palette: [
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
      nuance: 7,
    },
    // Le vert de Mantine, dernière nuance assombrie : le vert du picto
    // (nuance 8) reste dans la palette ; nuance 9 (6,1:1).
    vert: { palette: [...DEFAULT_THEME.colors.green.slice(0, 9), '#237032'], nuance: 9 },
    // Encre noire (`dark` de Mantine) : nuance 8 en clair (16,5:1) ; en sombre,
    // la nuance 0 avec un texte noir (12,7:1, contraste automatique de Mantine).
    encre: { palette: DEFAULT_THEME.colors.dark, nuance: { light: 8, dark: 0 }, contrasteAuto: true },
    // Bleu encre (`indigo`), nuance 8 (5,7:1).
    indigo: { palette: DEFAULT_THEME.colors.indigo, nuance: 8 },
    // Bleu (`blue`), nuance 8 (5,0:1).
    bleu: { palette: DEFAULT_THEME.colors.blue, nuance: 8 },
    // Violet (`violet`), nuance 7 (5,6:1).
    violet: { palette: DEFAULT_THEME.colors.violet, nuance: 7 },
    // Pétrole (`cyan`), nuance 9 (5,6:1).
    petrole: { palette: DEFAULT_THEME.colors.cyan, nuance: 9 },
    // Sépia, nuance 8 (7,0:1).
    sepia: {
      palette: [
        '#f8f3ee',
        '#ece3da',
        '#d9c5b1',
        '#c6a686',
        '#b68b62',
        '#ac7a4b',
        '#a7713f',
        '#925f31',
        '#7c4f27',
        '#66401e',
      ],
      nuance: 8,
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
  nombreSuggestions: { size: 16, inline: true },
  // Les cartes des suggestions : une carte de Mantine bordée par suggestion ;
  // Accepter en vert, Refuser en rouge, tous deux discrets (variante « light »),
  // petits (Sylvain, 12/11/2026, variante vert / rouge).
  suggestions: {
    carte: { withBorder: true, p: 'sm' },
    accepter: { color: 'green', variant: 'light', size: 'xs' },
    refuser: { color: 'red', variant: 'light', size: 'xs' },
  },
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
  // Les pictos ajoutés aux boutons de BlockNote (exposant dans la palette,
  // table des matières dans le menu « / ») : à la taille des siens (16 px dans
  // la palette, 18 px dans le menu), au lieu des 24 px de Tabler.
  pictos: { editeur: { exposant: 16, tableDesMatieres: 18 } },
  // La courbe du back-office (mémoire des processus) : sa proportion, quatre
  // fois plus large que haute.
  courbe: { largeur: 100, hauteur: 25 },
}
