// L'aide en ligne (10/10/2026) : une page publiée avec amend.ink lui-même
// (« Publier sur le web »), donc lisible sans compte, y compris par quelqu'un
// qui n'a pas encore d'accès et se demande ce qu'est l'application.
//
// Son adresse est ici, et nulle part ailleurs : la republier depuis le
// document d'aide la met à jour sans toucher à l'application, mais la
// déplacer demande de changer cette ligne.
export const URL_AIDE = '/p/scissors-dad-mechanic'

/** Un lien qui ouvre l'aide dans un nouvel onglet : on ne quitte pas le
 * document qu'on était en train d'écrire pour la lire. */
export function lienAide({ classe = '', libelle = 'Aide' } = {}) {
  const a = document.createElement('a')
  a.href = URL_AIDE
  a.target = '_blank'
  a.rel = 'noopener'
  if (classe) a.className = classe
  a.textContent = libelle
  a.title = 'Ouvrir l’aide d’amend.ink (nouvel onglet)'
  return a
}
