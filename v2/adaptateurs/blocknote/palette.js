// La palette flottante de BlockNote, moins les boutons d'alignement (décision
// de Sylvain du 09/11/2026, tous formats d'écran). Même procédé que Docs, qui
// filtre les boutons de la palette par leur clé. Pour les remettre : vider
// cette liste. Un test vérifie que chaque clé existe dans la palette de
// BlockNote (une clé renommée en amont ne doit pas passer inaperçue).
export const BOUTONS_RETIRES = ['textAlignLeftButton', 'textAlignCenterButton', 'textAlignRightButton']

/** Les boutons de la palette que l'on garde. */
export function boutonsGardes(boutons) {
  return boutons.filter((bouton) => !BOUTONS_RETIRES.includes(bouton.key))
}

// En mode Suggérer, pas de mise en forme (contournement temporaire, veille :
// une suggestion de mise en forme n'est pas arbitrable ; Sylvain, 11/11/2026).
export const BOUTONS_DE_FORME = [
  'blockTypeSelect',
  'boldStyleButton',
  'italicStyleButton',
  'underlineStyleButton',
  'strikeStyleButton',
  'colorStyleButton',
  'nestBlockButton',
  'unnestBlockButton',
]

/** Les boutons gardés en mode Suggérer. */
export function boutonsGardesEnSuggestion(boutons) {
  return boutonsGardes(boutons).filter((bouton) => !BOUTONS_DE_FORME.includes(bouton.key))
}
