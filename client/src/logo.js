// Le logo d'Amend — une signature typographique, pas une icône.
//
// Le mot « amand » est corrigé en « amend » sous les yeux du lecteur : le
// « a » barré, le « e » inséré et souligné, puis « .ink » ajouté de la même
// main, et le curseur qui clignote au bout. Le logo dit donc exactement ce
// que fait l'application, sans un mot d'explication — et il est fait de la
// même matière qu'elle : du texte, des marques de suivi, un curseur.
//
// C'est un **asset partagé** (demandé le 17/09/2026) : page d'accueil,
// courriers, aide, pages publiées. D'où la fabrique plutôt qu'un bloc de
// HTML recopié, et d'où le fait que la taille soit le seul réglage.
//
// Deux partis pris dans la feuille de style (voir `.amend-logo` dans
// style.css) :
//
//   - tout est en `em`, donc le logo se dimensionne par `font-size` et
//     tient aussi bien à 20 px dans un en-tête qu'à 70 px sur l'accueil ;
//   - les couleurs sont celles de l'application (`--fg`, `--muted`,
//     `--accent`), pas des valeurs à lui. Le vert de l'insertion est déjà
//     celui de l'IA et des acceptations : le logo hérite du thème clair ou
//     sombre sans une ligne de plus.

/**
 * Renvoie l'élément du logo.
 * @param {object} [opts]
 * @param {string} [opts.taille] taille CSS du logo (`font-size`), ex. '70px'
 * @param {boolean} [opts.curseur] curseur clignotant final (vrai par défaut)
 */
export function logoAmend({ taille, curseur = true } = {}) {
  const el = document.createElement('span')
  el.className = 'amend-logo'
  // Le logo est une image pour qui ne le voit pas : sans ça, un lecteur
  // d'écran énoncerait « am a e nd .ink », lettre à lettre et avec le « a »
  // supprimé.
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', 'amend.ink')
  if (taille) el.style.fontSize = taille

  el.innerHTML =
    '<span class="logo-base">am</span>' +
    '<span class="logo-diff"><span class="logo-del">a</span><span class="logo-ins">e</span></span>' +
    '<span class="logo-base">nd</span>' +
    '<span class="logo-diff"><span class="logo-ins">.ink</span></span>' +
    (curseur ? '<span class="logo-curseur"></span>' : '')

  return el
}
