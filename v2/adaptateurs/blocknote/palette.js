// La palette flottante de BlockNote, moins les boutons d'alignement (décision
// de Sylvain du 09/11/2026, tous formats d'écran). Même procédé que Docs, qui
// filtre les boutons de la palette par leur clé. Pour les remettre : vider
// cette liste. Un test vérifie que chaque clé existe dans la palette de
// BlockNote (une clé renommée en amont ne doit pas passer inaperçue).
export const BOUTONS_RETIRES = ['textAlignLeftButton', 'textAlignCenterButton', 'textAlignRightButton']

/** Le bouton après lequel vient l'exposant (11/11/2026) : le barré, dernier des styles. */
export const APRES_EXPOSANT = 'strikeStyleButton'

/** Les boutons de la palette que l'on garde, avec, s'il est donné, le bouton
 * de l'exposant après le barré (à la fin si le barré manque). */
export function boutonsGardes(boutons, exposant = null) {
  const gardes = boutons.filter((bouton) => !BOUTONS_RETIRES.includes(bouton.key))
  if (!exposant) return gardes
  const i = gardes.findIndex((b) => b.key === APRES_EXPOSANT)
  return i < 0 ? [...gardes, exposant] : [...gardes.slice(0, i + 1), exposant, ...gardes.slice(i + 1)]
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
