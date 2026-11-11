// L'apparence de l'instance (Sylvain, 11/11/2026) : un modèle d'interface et
// une couleur, choisis au back-office. Ce fichier ne porte que des noms, sans
// Mantine : le serveur les lit pour valider un choix. Les valeurs de chaque
// couleur sont dans reglages.js (`couleurs`), décisions notées dans l'ADR 0008.
export const APPARENCE = {
  // Les modèles d'interface : « atelier » (page posée sur un plan de travail,
  // texte en Source Serif 4) et « origine » (Mantine et BlockNote tels quels).
  modeles: ['atelier', 'origine'],
  // Les couleurs, dans l'ordre où le back-office les propose.
  couleurs: ['vermillon', 'vert', 'encre', 'indigo', 'bleu', 'violet', 'petrole', 'sepia'],
  // Sans choix au back-office : atelier en vermillon.
  parDefaut: { modele: 'atelier', couleur: 'vermillon' },
}

/** L'apparence retenue : celle donnée, champ par champ, si elle porte des noms
 * connus (une valeur retirée ne vaut plus rien), sinon celle par défaut. Lue
 * par le serveur (configuration) et par le cadre de design. */
export function apparenceRetenue(valeur) {
  const v = valeur && typeof valeur === 'object' ? valeur : {}
  return {
    modele: APPARENCE.modeles.includes(v.modele) ? v.modele : APPARENCE.parDefaut.modele,
    couleur: APPARENCE.couleurs.includes(v.couleur) ? v.couleur : APPARENCE.parDefaut.couleur,
  }
}
