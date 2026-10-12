// Ce que l'éditeur ouvert dit au reste de la page : pour l'instant, le rôle de
// la personne sur le document. La palette de contact le joint au signalement
// (contact.js) — une même page ne se comporte pas pareil selon le rôle, et
// c'est la première chose qu'on demanderait sinon. Un module plutôt qu'une
// variable de `window` (audit du 10/10/2026, C14) : il se teste et se lit.

let role = null

export function poserRoleDeLaPage(valeur) {
  role = valeur || null
}

export function roleDeLaPage() {
  return role
}

/** Le rôle d'une page qu'on quitte ne doit pas partir avec le signalement fait
 * depuis la suivante : on n'efface que s'il est encore le nôtre. */
export function oublierRoleDeLaPage(valeur) {
  if (role === (valeur || null)) role = null
}
