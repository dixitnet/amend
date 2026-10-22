// Ce que le serveur et le client disent de la même façon : la palette des
// couleurs de personnes et le nom des rôles à l'écran. Une seule source
// (audit du 10/10/2026, C14) — avant, ces listes étaient recopiées dans
// `server/users.js`, `client/src/user.js` et trois écrans.

/** La couleur de l'IA (Margo, Claude invité) et de l'accent de l'interface
 * (22/10/2026 : « menthe profonde », contraste 5,1 : 1 avec le blanc). C'est la
 * couleur **écrite** dans les nouvelles modifications. Les modifications déjà
 * dans les documents portent l'ancien vert amande : on le reconnaît encore
 * (`estCouleurIA`), sans quoi « Rejeter les modifications de l'IA » ne les
 * trouverait plus. */
export const COULEUR_IA = '#017d5e'
export const COULEURS_IA_ANCIENNES = ['#5f7a4a']

/** Cette couleur est-elle celle de l'IA, d'hier ou d'aujourd'hui ? */
export function estCouleurIA(couleur) {
  const c = String(couleur || '').toLowerCase()
  return c === COULEUR_IA || COULEURS_IA_ANCIENNES.includes(c)
}

/** La palette des couleurs de personnes : douze teintes (22/10/2026), la même
 * pour le tirage au sort à la création du compte et pour le choix de la
 * personne (`COULEURS_CHOIX`, alias). Construites en OKLCH — même clarté et
 * même saturation perçues — et rangées par teinte, du rouge au rose, comme
 * on les montre dans « Ma couleur » ; on alterne des teintes profondes (texte
 * blanc sur la pastille) et des teintes claires (texte sombre), pour que deux
 * personnes proches dans la marge se distinguent par la clarté autant que par
 * la teinte.
 *
 * **Aucun vert, délibérément** : le vert est réservé à l'IA, qui est aussi
 * l'accent de l'application — une personne qui en hériterait verrait ses
 * modifications se confondre avec les siennes dans la marge. Ce n'est pas une
 * question de nuance exacte mais de coup d'œil. Le turquoise de la première
 * planche a été écarté pour la même raison (trop près de la menthe), remplacé
 * par un orange. */
export const COULEURS = [
  '#f58ca6', // framboise
  '#b6322b', // corail
  '#e57255', // terracotta
  '#ffbc64', // orange
  '#8b6001', // moutarde
  '#027493', // cyan
  '#6ab7fe', // bleu ciel
  '#3760c9', // bleu
  '#a9a5ff', // indigo
  '#8048b6', // violet
  '#dd92db', // magenta
  '#ab3276', // rose
]

/** Les couleurs que la personne peut choisir : les mêmes douze. Une palette et
 * non une roue libre : une couleur choisie à la main finit blanche ou verte, et
 * l'on ne lirait plus la marge. (Avant le 22/10/2026 : seize couleurs, dont
 * huit pour le seul choix.) */
export const COULEURS_CHOIX = COULEURS

/** Le nom d'une couleur de la palette, pour qui ne la voit pas (lecteur
 * d'écran) et pour l'info-bulle. */
export const NOMS_COULEURS = {
  '#f58ca6': 'framboise',
  '#b6322b': 'corail',
  '#e57255': 'terracotta',
  '#ffbc64': 'orange',
  '#8b6001': 'moutarde',
  '#027493': 'cyan',
  '#6ab7fe': 'bleu ciel',
  '#3760c9': 'bleu',
  '#a9a5ff': 'indigo',
  '#8048b6': 'violet',
  '#dd92db': 'magenta',
  '#ab3276': 'rose',
}

/** Les couleurs retirées, et la couleur de la palette qui les remplace. Un
 * compte créé avant le 22/10/2026 porte l'une des seize couleurs d'alors (ou
 * l'un des deux verts d'avant le 17/09/2026) : on ne le laisse pas, mais on ne
 * réattribue pas non plus au hasard — la couleur d'une personne est ce qu'on
 * lit d'un coup d'œil dans la marge, et la voir changer sans raison est
 * déroutant. La correspondance est donc fixe, choisie pour rester proche de
 * la teinte d'origine. Les modifications déjà écrites dans les documents
 * gardent la couleur qu'elles portaient. */
export const COULEURS_REMPLACEES = {
  '#e07a5f': '#e57255', // terracotta
  '#3d5a80': '#3760c9', // bleu nuit
  '#8d6e63': '#8b6001', // brun
  '#f2cc8f': '#ffbc64', // sable
  '#9b5de5': '#8048b6', // violet
  '#00b4d8': '#6ab7fe', // cyan clair
  '#e56b6f': '#f58ca6', // rose corail
  '#c9184a': '#b6322b', // framboise foncé
  '#f48c06': '#ffbc64', // orange
  '#ffb703': '#ffbc64', // ambre
  '#7209b7': '#8048b6', // pourpre
  '#0077b6': '#3760c9', // bleu franc
  '#b5838d': '#f58ca6', // vieux rose
  '#6d597a': '#a9a5ff', // prune
  '#a44a3f': '#b6322b', // rouille
  '#ff006e': '#ab3276', // magenta vif
  '#81b29a': '#8b6001', // sauge (vert, retiré le 17/09/2026)
  '#588157': '#ab3276', // sapin (vert, retiré le 17/09/2026)
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
