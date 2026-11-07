// Le thème de l'éditeur, dérivé des jetons (ADR 0008, règle 18) : chaque
// valeur renvoie à une variable de jetons.css, si bien que le mode sombre et
// tout changement de jeton atteignent l'éditeur sans toucher à ce fichier.
const v = (nom) => `var(--${nom})`

export const themeEditeur = {
  colors: {
    editor: { text: v('couleur-texte'), background: v('couleur-fond') },
    menu: { text: v('couleur-texte'), background: v('couleur-surface') },
    tooltip: { text: v('couleur-texte'), background: v('couleur-surface') },
    hovered: { text: v('couleur-texte'), background: v('couleur-survol') },
    selected: { text: v('couleur-accent-texte'), background: v('couleur-accent') },
    disabled: { text: v('couleur-texte-discret'), background: v('couleur-survol') },
    shadow: v('couleur-bordure'),
    border: v('couleur-bordure'),
    sideMenu: v('couleur-texte-discret'),
  },
  borderRadius: 6,
  fontFamily: v('police-texte'),
}
