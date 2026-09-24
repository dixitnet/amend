// Amener une position du document dans le champ de vision (24/09/2026).
//
// Ce fichier existe parce que la zone qui défile n'est plus la même partout.
// Sur ordinateur, c'est `.editor-container`, une colonne qui défile pour son
// compte entre le bandeau et les panneaux. Sur téléphone, c'est désormais la
// **page** : le conteneur ne défile plus, et quatre endroits du code qui
// faisaient `conteneur.scrollTop += …` ne faisaient donc plus rien.
//
// Pourquoi ce changement : WebKit bâtit le placement du curseur et
// l'évitement du clavier autour du défilement de la page. Dans un
// défilement interne, poser le curseur au doigt après avoir fait défiler
// échouait — le curseur restait en haut du document (signalé par Sylvain les
// 23 et 24/09). Rendre à Safari sa propre mécanique est le remède qu'on
// essaie ici, avant d'en venir à remplacer l'éditeur par des champs de
// formulaire.

/**
 * La zone qui défile réellement autour de l'éditeur, ou `null` quand c'est
 * la page. On remonte les ancêtres jusqu'à en trouver un qui déborde et qui
 * a le droit de défiler.
 */
export function zoneDeDefilement(view) {
  let el = view && view.dom ? view.dom.parentNode : null
  while (el && el.nodeType === 1) {
    let style = null
    try {
      style = getComputedStyle(el)
    } catch {
      return null
    }
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) return el
    el = el.parentNode
  }
  return null
}

/** Ce que le haut de l'écran nous cache : l'en-tête collant du téléphone. */
function hautCache() {
  const entete = typeof document !== 'undefined' ? document.querySelector('.tel-entete') : null
  if (!entete || !entete.getBoundingClientRect) return 0
  const r = entete.getBoundingClientRect()
  // Collant en haut : il ne masque que s'il y est.
  return r.top <= 1 ? Math.round(r.height) : 0
}

/**
 * Amène `pos` à `marge + fraction × hauteur visible` du haut de la zone
 * visible, que celle-ci soit une colonne ou la page.
 */
export function defilerVers(view, pos, { fraction = 0, marge = 0 } = {}) {
  if (!view) return
  const zone = zoneDeDefilement(view)
  if (zone) {
    const coords = mesurer(view, pos)
    if (!coords) return
    const rect = zone.getBoundingClientRect()
    zone.scrollTop += coords.top - (rect.top + marge + zone.clientHeight * fraction)
    return
  }
  if (typeof window === 'undefined' || !window.scrollTo) return
  const coords = mesurer(view, pos)
  if (!coords) return
  const haut = hautCache()
  const vue = window.visualViewport ? window.visualViewport.height : window.innerHeight
  const hauteur = Math.max(0, vue - haut)
  window.scrollTo(0, Math.max(0, (window.scrollY || 0) + coords.top - (haut + marge + hauteur * fraction)))
}

function mesurer(view, pos) {
  try {
    return view.coordsAtPos(pos)
  } catch {
    // Position pas encore dessinée — un re-rendu est en cours.
    return null
  }
}
