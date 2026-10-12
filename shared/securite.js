// Ce qui vient du document partagé n'est pas de confiance : n'importe quel
// participant peut écrire ce qu'il veut dans la structure Yjs, sans passer
// par l'interface. Ces trois fonctions sont le seul endroit où l'on décide
// si une valeur lue dans le document peut entrer dans un attribut `style`,
// une adresse d'image ou du HTML (audit du 10/10/2026, C1, C2, C13).

/** Une couleur d'utilisateur ou de commentaire : `#rgb`, `#rrggbb` ou
 * `#rrggbbaa`, rien d'autre. Tout le reste (`red;background:url(…)`,
 * `url(…)`, `var(…)`) est remplacé par `repli`. */
export function couleurSure(couleur, repli = '#888888') {
  return typeof couleur === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(couleur) ? couleur : repli
}

/** L'adresse d'une image du document : seulement celles que ce serveur a
 * enregistrées pour un document (`/api/docs/<id>/images/<nom>.png|jpg`).
 * Une image externe ferait fuiter l'adresse IP et la présence de chaque
 * lecteur vers un tiers. */
export const ADRESSE_IMAGE = /^\/api\/docs\/[A-Za-z0-9_-]+\/images\/[A-Za-z0-9_-]+\.(png|jpg)$/

export function imageAutorisee(src) {
  return typeof src === 'string' && ADRESSE_IMAGE.test(src)
}

/** Échappement HTML qui accepte n'importe quelle valeur (un nom venu d'un
 * pair peut ne pas être du texte). */
export function echapperHtml(valeur) {
  return String(valeur ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}
