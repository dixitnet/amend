// Le suivi de l'instance, côté back-office (couche application) : de quoi
// tracer la mémoire d'un processus à partir des relevés du serveur. Sans
// texte ni appel : des nombres.

/**
 * La courbe de la mémoire d'un processus sur une période : les relevés
 * ramenés entre 0 et 1 (x : le temps dans la période ; y : la part du plus
 * haut relevé, la base à zéro), et de quoi la décrire, en octets. `null` s'il
 * n'y a pas au moins deux relevés.
 * @param {Array<{ le: number, processus: string, memoire: number }>} mesures  dans l'ordre du temps
 * @param {string} processus
 * @param {{ debut: number, fin: number }} periode  en millisecondes
 * @returns {{ points: Array<{ x: number, y: number }>, min: number, max: number, dernier: number } | null}
 */
export function courbeDeMemoire(mesures, processus, { debut, fin }) {
  const releves = mesures.filter((m) => m.processus === processus && m.le >= debut && m.le <= fin)
  if (releves.length < 2 || fin <= debut) return null
  const valeurs = releves.map((m) => m.memoire)
  const max = Math.max(...valeurs)
  if (!(max > 0)) return null
  return {
    points: releves.map((m) => ({ x: (m.le - debut) / (fin - debut), y: m.memoire / max })),
    min: Math.min(...valeurs),
    max,
    dernier: valeurs[valeurs.length - 1],
  }
}
