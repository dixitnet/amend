// Les noms des auteurs des suggestions (couche application) : quels
// identifiants demander maintenant. Fonction pure, sans texte.

/** Délai avant de redemander le nom d'un identifiant resté introuvable. */
export const DELAI_NOM_INTROUVABLE_MS = 60_000

/**
 * Les identifiants dont il faut demander le nom : ceux qu'on ne connaît pas
 * encore et qu'on n'a pas demandés depuis `delai` ms. `essais` garde l'heure
 * du dernier essai de chaque identifiant (une `Map` que l'appelant conserve) ;
 * elle est mise à jour pour les identifiants rendus.
 * @param {Iterable<string | null | undefined>} auteurs
 * @param {Record<string, string>} connus
 * @param {Map<string, number>} essais
 * @param {number} maintenant
 * @param {number} [delai]
 * @returns {string[]}
 */
export function nomsAdemander(auteurs, connus, essais, maintenant, delai = DELAI_NOM_INTROUVABLE_MS) {
  const aDemander = [...new Set(auteurs)].filter(
    (id) => id && !(id in connus) && !(essais.has(id) && maintenant - essais.get(id) < delai),
  )
  for (const id of aDemander) essais.set(id, maintenant)
  return aDemander
}
