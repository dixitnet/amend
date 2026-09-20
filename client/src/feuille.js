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
  // Jamais d'empilement.
  fermerFeuille()

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
  const marque = { feuille: true }
  try {
    history.pushState(marque, '')
  } catch {
    /* environnements sans historique (tests) : la croix suffit */
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

  function fermer() {
    if (ouverte !== poste) return
    ouverte = null
    document.removeEventListener('keydown', surTouche, true)
    window.removeEventListener('popstate', surRetour)
    el.remove()
    if (voile) voile.remove()
    // On ne dépile l'historique que si ce n'est pas lui qui nous ferme,
    // sinon on remonterait d'un cran de trop et l'on quitterait le document.
    if (!fermeeParHistorique && history.state && history.state.feuille) {
      try {
        history.back()
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

/** Vrai quand l'interface doit passer en mode « une seule colonne ». Une
 * seule définition, partagée par tout ce qui en dépend : le jour où le
 * seuil bouge, il bouge ici et dans le CSS, nulle part ailleurs. */
export function petitEcran() {
  return window.matchMedia('(max-width: 700px)').matches
}

/** Vrai dès que le plan n'a plus sa colonne (téléphone et tablette). */
export function sansColonnePlan() {
  return window.matchMedia('(max-width: 1100px)').matches
}
