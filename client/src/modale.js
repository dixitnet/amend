// Comportement commun des fenêtres modales (point 57 de la feuille de route,
// audit C17, 11/10/2026).
//
// Quatre modales (partage, publication, nom, nom au premier passage) refaisaient
// chacune à leur façon la superposition et la fermeture, et aucune n'était
// annoncée comme une fenêtre de dialogue, n'avait de piège de focus, ou ne
// rendait le focus à ce qui l'avait ouverte. `equiperModale` pose le tout, une
// fois.
//
//   const fermer = equiperModale(overlay, { surFermeture })
//
// `overlay` est la superposition (`.name-modal-overlay`) déjà construite, avec
// la boîte `.name-modal` dedans. La fonction renvoyée ferme la modale (retire
// la superposition, les écouteurs, rend le focus) ; elle peut être appelée
// plusieurs fois sans effet.

const FOCALISABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let compteur = 0

function focalisables(boite) {
  return [...boite.querySelectorAll(FOCALISABLES)].filter((el) => !el.hidden && !el.closest('[hidden]'))
}

/**
 * @param {HTMLElement} overlay    la superposition
 * @param {object} [options]
 * @param {boolean} [options.echap=true]  Échap ferme la modale (false pour une saisie obligatoire)
 * @param {boolean} [options.clic=true]   un clic sur le fond ferme la modale
 * @param {string}  [options.libelle]     nom accessible, à défaut du premier titre
 * @param {() => void} [options.surFermeture]  appelé une fois, à la fermeture
 */
export function equiperModale(overlay, { echap = true, clic = true, libelle = '', surFermeture = null } = {}) {
  const boite = overlay.querySelector('.name-modal') || overlay.firstElementChild || overlay
  boite.setAttribute('role', boite.getAttribute('role') || 'dialog')
  boite.setAttribute('aria-modal', 'true')
  if (libelle) boite.setAttribute('aria-label', libelle)
  else if (!boite.hasAttribute('aria-labelledby') && !boite.hasAttribute('aria-label')) {
    const titre = boite.querySelector('h1, h2, h3')
    if (titre) {
      if (!titre.id) titre.id = `modale-titre-${++compteur}`
      boite.setAttribute('aria-labelledby', titre.id)
    }
  }

  const avant = document.activeElement
  let fermee = false

  function fermer() {
    if (fermee) return
    fermee = true
    document.removeEventListener('keydown', surTouche, true)
    overlay.removeEventListener('mousedown', surFond)
    overlay.remove()
    // Rendre le focus à ce qui avait ouvert la modale, s'il est encore là.
    if (avant && avant !== document.body && typeof avant.focus === 'function' && avant.isConnected) avant.focus()
    if (surFermeture) surFermeture()
  }

  function surFond(e) {
    if (clic && e.target === overlay) fermer()
  }

  function surTouche(e) {
    if (fermee) return
    // Seule la modale du dessus répond (deux modales empilées).
    const toutes = document.querySelectorAll('.name-modal-overlay')
    if (toutes.length && toutes[toutes.length - 1] !== overlay) return
    if (e.key === 'Escape' && echap) {
      e.stopPropagation()
      e.preventDefault()
      fermer()
      return
    }
    if (e.key !== 'Tab') return
    const liste = focalisables(boite)
    if (!liste.length) {
      e.preventDefault()
      boite.focus?.()
      return
    }
    const premier = liste[0]
    const dernier = liste[liste.length - 1]
    const actif = document.activeElement
    if (!boite.contains(actif)) {
      e.preventDefault()
      ;(e.shiftKey ? dernier : premier).focus()
    } else if (e.shiftKey && actif === premier) {
      e.preventDefault()
      dernier.focus()
    } else if (!e.shiftKey && actif === dernier) {
      e.preventDefault()
      premier.focus()
    }
  }

  document.addEventListener('keydown', surTouche, true)
  overlay.addEventListener('mousedown', surFond)

  // Focus initial : le champ marqué `autofocus`, sinon le premier élément
  // focalisable, sinon la boîte elle-même.
  if (!boite.contains(document.activeElement)) {
    const voulu = boite.querySelector('[autofocus]') || focalisables(boite)[0]
    if (voulu) voulu.focus()
    else {
      boite.setAttribute('tabindex', '-1')
      boite.focus()
    }
  }
  return fermer
}
