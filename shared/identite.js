// Ce que le serveur et le client disent de la même façon : la palette des
// couleurs de personnes et le nom des rôles à l'écran. Une seule source
// (audit du 10/10/2026, C14) — avant, ces listes étaient recopiées dans
// `server/users.js`, `client/src/user.js` et trois écrans.

/** La palette dont on tire la couleur d'une personne.
 *
 * **Aucun vert, délibérément** : le vert est réservé à l'IA, qui est aussi
 * l'accent de l'application — une personne qui en hériterait verrait ses
 * modifications se confondre avec les siennes dans la marge. Les deux verts
 * d'origine (`#81b29a` sauge et `#588157` sapin) ont été remplacés par un brun
 * et une framboise : ce n'est pas une question de nuance exacte mais de coup
 * d'œil. */
export const COULEURS = ['#e07a5f', '#3d5a80', '#8d6e63', '#f2cc8f', '#9b5de5', '#00b4d8', '#e56b6f', '#c9184a']

/** Les couleurs que la personne peut choisir (13/10/2026) : les huit du tirage
 * au sort, plus huit autres. Une palette et non une roue libre : une couleur
 * choisie à la main finit blanche ou verte, et l'on ne lirait plus la marge. Le
 * tirage au sort initial ne puise que dans `COULEURS`. Aucun vert, ici non
 * plus. */
export const COULEURS_CHOIX = [
  ...COULEURS,
  '#f48c06',
  '#ffb703',
  '#7209b7',
  '#0077b6',
  '#b5838d',
  '#6d597a',
  '#a44a3f',
  '#ff006e',
]

/** Le nom d'une couleur de la palette, pour qui ne la voit pas (lecteur
 * d'écran) et pour l'info-bulle. */
export const NOMS_COULEURS = {
  '#e07a5f': 'terracotta',
  '#3d5a80': 'bleu nuit',
  '#8d6e63': 'brun',
  '#f2cc8f': 'sable',
  '#9b5de5': 'violet',
  '#00b4d8': 'cyan',
  '#e56b6f': 'rose corail',
  '#c9184a': 'framboise',
  '#f48c06': 'orange',
  '#ffb703': 'ambre',
  '#7209b7': 'pourpre',
  '#0077b6': 'bleu franc',
  '#b5838d': 'vieux rose',
  '#6d597a': 'prune',
  '#a44a3f': 'rouille',
  '#ff006e': 'magenta',
}

/** Les rôles, dans la langue de l'interface. Un rôle inconnu s'affiche tel
 * quel plutôt que de disparaître : le jour où un rôle entrera dans
 * `server/roles.js`, les badges l'afficheront sans qu'on touche à ces écrans. */
export const LIBELLES_ROLE = {
  editeur: 'éditeur',
  correcteur: 'correcteur',
  lecteur: 'lecteur',
}

export function libelleDuRole(role) {
  return LIBELLES_ROLE[role] || role
}

// Le texte d'une pastille (initiales) sur la couleur de la personne : blanc ou
// presque noir, celui des deux qui se lit le mieux. Le blanc fixe de départ
// donnait 2,5 : 1 sur le cyan et 1,9 : 1 sur l'ambre (passage axe du
// 21/10/2026) — la palette compte beaucoup de teintes claires.
const TEXTE_CLAIR = '#ffffff'
const TEXTE_SOMBRE = '#1f1d19'

function luminance(hex) {
  let h = String(hex).replace('#', '')
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return null
  const lin = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
}

/** `#ffffff` ou `#1f1d19`, selon ce qui contraste le mieux avec `couleur`
 * (blanc si elle est illisible, par prudence : c'était le comportement
 * d'avant). */
export function texteSurCouleur(couleur) {
  const l = luminance(couleur)
  if (l === null) return TEXTE_CLAIR
  const contrasteClair = 1.05 / (l + 0.05)
  const contrasteSombre = (l + 0.05) / (luminance(TEXTE_SOMBRE) + 0.05)
  return contrasteSombre > contrasteClair ? TEXTE_SOMBRE : TEXTE_CLAIR
}
