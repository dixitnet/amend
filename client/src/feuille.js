// La feuille basse — la brique d'interface du petit écran (20/09/2026,
// voir claude/conception-mobile.md).
//
// Sur un écran de poche, une colonne permanente est un luxe qu'on n'a pas :
// le plan, les commentaires, la relecture ne peuvent pas *rester* affichés,
// ils doivent être **convoqués** puis rendus. C'est le motif standard, et
// les recommandations du Nielsen Norman Group en fixent les règles, toutes
// reprises ici :
//
//  - une croix de fermeture **explicite**, jamais la seule poignée à tirer,
//    qu'un utilisateur non averti ne devine pas ;
//  - Échap ferme, et le bouton « retour » du téléphone aussi — d'où l'entrée
//    poussée dans l'historique ;
//  - **jamais deux feuilles empilées** : on ne saurait plus laquelle se
//    ferme. Ouvrir une feuille ferme celle qui est ouverte ;
//  - non modale par défaut (on continue de voir et de toucher le texte
//    dessous), modale seulement quand il faut trancher.
//
// Ce fichier ne connaît aucun contenu : il ouvre, ferme, et rend un corps à
// remplir. Le plan, les commentaires et la relecture s'en servent.

let ouverte = null

/** Ferme la feuille ouverte, s'il y en a une. */
export function fermerFeuille() {
  if (ouverte) ouverte.fermer()
}

/**
 * Ouvre une feuille. Renvoie `{ el, corps, fermer, estOuverte }` —
 * `corps` est l'élément à remplir par l'appelant.
 *
 * `hauteur` est une fraction de l'écran (0.5 = la moitié). `modale` pose un
 * voile et bloque le fond. `surFermeture` est rappelé quelle que soit la
 * façon dont la feuille se ferme, y compris quand une autre la chasse.
 */
export function ouvrirFeuille(titre, { hauteur = 0.5, modale = false, surFermeture = null } = {}) {
  // Jamais d'empilement. Une feuille qui en remplace une autre reprend
  // **l'entrée d'historique de celle-ci** au lieu d'en créer une seconde.
  //
  // Sans cela, le plan ne s'affichait pas du tout (bug signalé le
  // 23/09/2026), et le chemin était le suivant : fermer la première feuille
  // appelait `history.back()`, qui est **asynchrone** ; la seconde feuille
  // était construite et posait son écouteur `popstate` avant que
  // l'évènement ne soit distribué ; c'est donc elle qui le recevait, et
  // elle se fermait aussitôt. La feuille s'ouvrait et disparaissait dans la
  // même image — indiscernable de « rien ne s'affiche ».
  //
  // Une entrée d'historique pour « une feuille est ouverte », et non une
  // par feuille : c'est aussi le modèle juste, puisqu'il n'y en a jamais
  // deux.
  const remplaceUneAutre = !!ouverte
  if (ouverte) ouverte.fermer({ remplacee: true })

  const el = document.createElement('div')
  el.className = `feuille${modale ? ' feuille-modale' : ''}`
  el.style.setProperty('--feuille-hauteur', `${Math.round(hauteur * 100)}dvh`)
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', titre)

  const poignee = document.createElement('div')
  poignee.className = 'feuille-poignee'

  const entete = document.createElement('div')
  entete.className = 'feuille-entete'
  const nom = document.createElement('h2')
  nom.textContent = titre
  const croix = document.createElement('button')
  croix.type = 'button'
  croix.className = 'feuille-fermer'
  croix.setAttribute('aria-label', 'Fermer')
  croix.textContent = '✕'
  entete.append(nom, croix)

  const corps = document.createElement('div')
  corps.className = 'feuille-corps'

  el.append(poignee, entete, corps)

  let voile = null
  if (modale) {
    voile = document.createElement('div')
    voile.className = 'feuille-voile'
    document.body.appendChild(voile)
  }
  document.body.appendChild(el)

  // Le bouton « retour » du téléphone doit fermer la feuille, et non quitter
  // le document : on pousse une entrée d'historique, et on l'écoute.
  // `window.history` et non `history` tout court : dans un environnement
  // sans navigateur complet, la variable globale n'existe pas, et une
  // feuille qui refuse de se fermer parce que l'historique manque serait un
  // défaut bien réel pour un confort optionnel.
  const historique = typeof window !== 'undefined' && window.history ? window.history : null
  const marque = { feuille: true }
  try {
    if (historique && !remplaceUneAutre) historique.pushState(marque, '')
  } catch {
    /* environnements sans historique : la croix suffit */
  }
  let fermeeParHistorique = false

  const surTouche = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      fermer()
    }
  }
  const surRetour = () => {
    fermeeParHistorique = true
    fermer()
  }
  const surClicVoile = () => fermer()

  document.addEventListener('keydown', surTouche, true)
  window.addEventListener('popstate', surRetour)
  if (voile) voile.addEventListener('click', surClicVoile)
  croix.onclick = fermer

  // Tirer la poignée vers le bas ferme, vers le haut agrandit. Geste
  // attendu — mais il ne remplace jamais la croix.
  let depart = null
  poignee.addEventListener('touchstart', (e) => {
    depart = e.touches[0].clientY
  }, { passive: true })
  poignee.addEventListener('touchmove', (e) => {
    if (depart === null) return
    const delta = e.touches[0].clientY - depart
    if (delta > 60) {
      depart = null
      fermer()
    } else if (delta < -60) {
      depart = null
      el.classList.add('feuille-pleine')
    }
  }, { passive: true })

  function fermer({ remplacee = false } = {}) {
    if (ouverte !== poste) return
    ouverte = null
    document.removeEventListener('keydown', surTouche, true)
    window.removeEventListener('popstate', surRetour)
    el.remove()
    if (voile) voile.remove()
    // On ne dépile l'historique que si ce n'est pas lui qui nous ferme
    // (sinon on remonterait d'un cran de trop et l'on quitterait le
    // document), ni lorsqu'une autre feuille prend la place : celle-ci
    // hérite de l'entrée et la dépilera à son tour.
    if (!remplacee && !fermeeParHistorique && historique && historique.state && historique.state.feuille) {
      try {
        historique.back()
      } catch {
        /* sans historique, rien à défaire */
      }
    }
    if (surFermeture) surFermeture()
  }

  const poste = { el, corps, fermer, estOuverte: () => ouverte === poste }
  ouverte = poste
  return poste
}

/** Une requête média, sans supposer que `matchMedia` existe. Elle manque
 * dans jsdom — et le test de fumée de l'éditeur l'a immédiatement attrapé,
 * ce qui est exactement son rôle. Un repli « grand écran » plutôt qu'une
 * exception : une interface un peu large vaut mieux qu'une page blanche. */
export function media(requete) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { matches: false, addEventListener() {}, removeEventListener() {} }
  }
  return window.matchMedia(requete)
}

/** Vrai quand l'interface doit passer en mode « une seule colonne ». Une
 * seule définition, partagée par tout ce qui en dépend : le jour où le
 * seuil bouge, il bouge ici et dans le CSS, nulle part ailleurs. */
export const REQUETE_PETIT_ECRAN = '(max-width: 700px)'
export const REQUETE_SANS_COLONNE_PLAN = '(max-width: 1100px)'

export function petitEcran() {
  return media(REQUETE_PETIT_ECRAN).matches
}

/** Vrai dès que le plan n'a plus sa colonne (téléphone et tablette). */
export function sansColonnePlan() {
  return media(REQUETE_SANS_COLONNE_PLAN).matches
}
