// La palette flottante de BlockNote, moins les boutons d'alignement (décision
// de Sylvain du 09/11/2026, tous formats d'écran). Même procédé que Docs, qui
// filtre les boutons de la palette par leur clé. Pour les remettre : vider
// cette liste. Un test vérifie que chaque clé existe dans la palette de
// BlockNote (une clé renommée en amont ne doit pas passer inaperçue).
export const BOUTONS_RETIRES = ['textAlignLeftButton', 'textAlignCenterButton', 'textAlignRightButton']

/** Le bouton après lequel vient l'exposant (11/11/2026) : le barré, dernier des styles. */
export const APRES_EXPOSANT = 'strikeStyleButton'

/** Les boutons de la palette que l'on garde, avec, s'ils sont donnés, nos boutons de style (l'exposant, le
 * surlignage) après le barré (à la fin si le barré manque). */
export function boutonsGardes(boutons, ajouts = []) {
  const gardes = boutons.filter((bouton) => !BOUTONS_RETIRES.includes(bouton.key))
  const nos = ajouts.filter(Boolean)
  if (!nos.length) return gardes
  const i = gardes.findIndex((b) => b.key === APRES_EXPOSANT)
  return i < 0 ? [...gardes, ...nos] : [...gardes.slice(0, i + 1), ...nos, ...gardes.slice(i + 1)]
}

// En mode Suggérer, pas de mise en forme (contournement temporaire, veille :
// une suggestion de mise en forme n'est pas arbitrable ; Sylvain, 11/11/2026).
const BOUTONS_DE_FORME = [
  'blockTypeSelect',
  'boldStyleButton',
  'italicStyleButton',
  'underlineStyleButton',
  'strikeStyleButton',
  'colorStyleButton',
  // Un lien est une mise en forme comme les autres (Sylvain, 11/11/2026).
  'createLinkButton',
  'nestBlockButton',
  'unnestBlockButton',
]

/** Les boutons gardés en mode Suggérer. */
export function boutonsGardesEnSuggestion(boutons) {
  return boutonsGardes(boutons).filter((bouton) => !BOUTONS_DE_FORME.includes(bouton.key))
}

// Au format S (téléphone), la barre garde le choix du style (titre, citation, liste…),
// comme Docs : elle défile en largeur (Sylvain, 17/11/2026 ; retiré le 12/11, rétabli).

/**
 * Une cible d'événement est-elle dans la barre de mise en forme du téléphone (celle de BlockNote, rendue
 * hors de l'éditeur) ? La barre défile en largeur pour atteindre ses boutons : ce glissement n'est pas un
 * défilement de la page (22/11/2026).
 */
export const dansLaBarreMobile = (cible) => Boolean(cible?.closest?.('.bn-mobile-formatting-toolbar'))
