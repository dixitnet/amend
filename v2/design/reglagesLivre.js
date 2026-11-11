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

// Les modèles de mise en page des livres exportés en PDF (règle 21 : le
// design des rendus imprimés). Chaque modèle d'amend.ink est une décision
// de Sylvain ; ceux des équipes en dérivent, par des écarts pris dans
// `reglables` (ADR 0011).
export const REGLAGES_LIVRE = {
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
}
