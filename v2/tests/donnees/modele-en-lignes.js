// Un modèle compté en lignes, pour les tests (27/11/2026) : « TàT 140 × 220 » converti à la main
// (docs/v2-grille-plan.md, § 5). Les modèles livrés viendront du design (lot 2).
const style = (corps, blancAvant, blancApres, autres = {}) => ({ corps, blancAvant, blancApres, ...autres })

export const MODELE_EN_LIGNES = Object.freeze({
  regle: 'lignes',
  page: { largeur: 140, hauteur: 220 },
  marges: { haut: 25, interieure: 21, exterieure: 18 },
  grille: { corps: 11, interligne: 14, lignes: 33, hauteurTitre: 1.15 },
  folio: { position: 'bas-centre', depart: 1, ouverture: false, ouverture2: true },
  enTete: { gauche: 'titreDocument', droite: 'chapitre', italique: false, petitesCapitales: true },
  chapitre: { debut: 'belle-page', premierSansAlinea: false },
  ouverture2: { debut: 'belle-page' },
  separateur: 'blanc',
  cesure: true,
  styles: {
    texte: { police: 'EB Garamond', alignement: 'justifie', alinea: 5 },
    titre: style(20, 5, 1, { gras: true, alignement: 'centre' }),
    sousTitre: style(14, 0, 4, { italique: true, alignement: 'centre' }),
    titre1: style(14, 13, 0, { petitesCapitales: true, alignement: 'centre' }),
    titre2: style(11, 5, 4, { gras: true, alignement: 'centre' }),
    titre3: style(13, 1.5, 0.5, { gras: true }),
    titre4: style(11, 1, 0, { italique: true }),
    titre5: style(11, 0.5, 0, { italique: true }),
    citation: style(10, 0.5, 0.5),
    bibliographie: style(10, 0, 0),
    legende: style(9, 0.5, 0.5, { italique: true, alignement: 'centre' }),
  },
})
