// Tenir une barre au-dessus du clavier virtuel (23/09/2026).
//
// Ce fichier corrige une erreur que j'ai commise le 20/09 en me fiant à une
// lecture trop rapide de la documentation. Deux idées reçues, toutes deux
// fausses sur iPhone :
//
//  1. « `100dvh` suit la zone visible, clavier compris. » Non. Les unités
//     `dvh` tiennent compte des **barres du navigateur** qui apparaissent et
//     disparaissent au défilement, pas du clavier. Sur iOS Safari, ouvrir le
//     clavier ne change ni `100dvh` ni `100vh`.
//  2. « `env(keyboard-inset-height)` donne la hauteur du clavier. » Oui,
//     mais **seulement** dans les navigateurs Chromium, et seulement après
//     avoir demandé `navigator.virtualKeyboard.overlaysContent = true`.
//     Safari ne connaît pas cette API du tout, et une valeur `env()`
//     inconnue vaut simplement son repli — ici zéro.
//
// Conséquence concrète, signalée par Sylvain : sur iPhone, la barre d'outils
// restait collée au bas de la **page**, donc **sous le clavier**, et ne
// réapparaissait qu'au moment où le clavier se refermait. Elle semblait
// n'arriver qu'« après avoir validé une modification ».
//
// Ce que iOS fait réellement : il ne redimensionne pas la page, il réduit la
// *fenêtre visuelle* (`window.visualViewport`) et fait glisser la page
// dessous. La hauteur du clavier est donc la différence entre la hauteur de
// la page et celle de la fenêtre visuelle, décalage de défilement compris.
// C'est cette différence qu'on mesure ici, et qu'on publie dans une variable
// CSS que la feuille de style utilise.

/**
 * Publie sur `el` une variable `--clavier` valant la hauteur occupée par le
 * clavier. Renvoie une fonction pour tout défaire.
 */
export function suivreLeClavier(el) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!el || !vv) return () => {}

  let image = null
  function mesurer() {
    // Le calcul en une ligne : ce que la fenêtre visuelle ne montre pas, en
    // bas, c'est le clavier (plus, le cas échéant, la barre d'outils du
    // navigateur — qui, elle aussi, mérite qu'on ne se cache pas dessous).
    const cache = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    // Sous une vingtaine de pixels, c'est du bruit de barre d'adresse : on
    // n'agite pas l'interface pour ça.
    const hauteur = cache > 20 ? Math.round(cache) : 0
    el.style.setProperty('--clavier', `${hauteur}px`)
  }

  function planifier() {
    if (image) return
    image = requestAnimationFrame(() => {
      image = null
      mesurer()
    })
  }

  vv.addEventListener('resize', planifier)
  // `scroll` autant que `resize` : sur iOS, faire défiler pendant que le
  // clavier est ouvert déplace la fenêtre visuelle sans la redimensionner.
  vv.addEventListener('scroll', planifier)
  mesurer()

  return () => {
    vv.removeEventListener('resize', planifier)
    vv.removeEventListener('scroll', planifier)
    if (image) cancelAnimationFrame(image)
    el.style.removeProperty('--clavier')
  }
}
