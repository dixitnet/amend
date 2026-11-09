// Les réglages de Mantine décidés par Sylvain : le seul endroit de la v2 où
// une valeur de design peut être fixée. Chaque clé doit figurer, avec sa
// décision, dans l'ADR 0008 (« Réglages décidés ») : un contrat statique le
// vérifie. Sans décision, rien ici : Mantine et BlockNote tels quels.
export const REGLAGES = {
  // Le fournisseur Mantine (MantineProvider).
  fournisseur: { defaultColorScheme: 'auto' },
  // Le thème Mantine (createTheme) : Mantine par défaut, sauf ce qui suit.
  theme: {
    // Boutons à icône discrets (bandeau du format S, maquette validée le 09/11/2026).
    components: { ActionIcon: { defaultProps: { variant: 'subtle' } } },
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
}
