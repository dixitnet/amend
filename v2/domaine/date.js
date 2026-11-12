// La date du jour au format AAAA-MM-JJ (Sylvain, 12/11/2026 : titre des notes,
// « /date » dans le texte), à l'heure locale de la personne. JavaScript pur.

const deux = (n) => String(n).padStart(2, '0')

/** @param {Date} [d] @returns {string} `2026-11-12` */
export function dateDuJour(d = new Date()) {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
}
