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
