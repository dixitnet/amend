// Les nombres de signes, dits partout de la même façon (13/10/2026) : toujours
// des **signes, espaces compris** — jamais des pages. Une espace fine
// insécable entre les milliers, une espace insécable avant l'unité.

/** « 12 345 » (espace fine insécable entre les milliers). */
export function nombre(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** « 12 345 signes » ; « 1 signe ». */
export function signes(n) {
  const v = Math.round(Number(n) || 0)
  return `${nombre(v)} ${v === 1 ? 'signe' : 'signes'}`
}

/** « 1 234 / 30 000 signes » : ce qu'on utilise sur ce qu'on a droit à. */
export function rapport(utilise, max) {
  return `${nombre(utilise)} / ${nombre(max)} signes`
}
