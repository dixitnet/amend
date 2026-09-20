// Le plan dans une feuille basse — pour tablette et téléphone (20/09/2026).
//
// Le parti pris qui rend ce fichier court : on ne redessine pas le plan,
// **on le déménage**. Le panneau existant (`mountOutlinePanel`) sait déjà
// tout faire — se tenir à jour à chaque frappe sans rebalayer le document,
// mettre en évidence la section courante et le chemin qui y mène, amener un
// titre en haut de l'écran quand on le touche. Le dupliquer pour le petit
// écran, ce serait deux plans à faire évoluer ensemble, et un jour un seul
// des deux corrigé.
//
// La colonne est donc simplement masquée en CSS sous 1100 px, et son
// élément est transplanté dans la feuille le temps qu'elle est ouverte,
// puis remis à sa place. Il ne perd rien au passage : c'est le même nœud,
// avec le même greffon derrière.

import { ouvrirFeuille } from './feuille.js'

/** Au-delà de ce nombre de titres, le champ de filtrage apparaît : dans un
 * document long, chercher « Propositions » bat le défilement. En deçà, il
 * ne ferait qu'occuper la place de deux entrées. */
const SEUIL_FILTRE = 20

/**
 * Ouvre le plan. `colonne` est l'élément `.outline-sidebar` que l'éditeur a
 * construit ; il est rendu à sa place à la fermeture, quoi qu'il arrive.
 */
export function ouvrirPlan(colonne) {
  if (!colonne) return null
  const place = colonne.parentNode
  const voisin = colonne.nextSibling

  const feuille = ouvrirFeuille('Plan du document', {
    hauteur: 0.6,
    surFermeture() {
      observateur.disconnect()
      // Remis exactement là où il était, et non à la fin : l'ordre des
      // colonnes compte pour la mise en page en grand écran.
      if (place) place.insertBefore(colonne, voisin)
      colonne.classList.remove('outline-dans-feuille')
    },
  })

  colonne.classList.add('outline-dans-feuille')

  const filtre = document.createElement('input')
  filtre.type = 'search'
  filtre.className = 'feuille-filtre'
  filtre.placeholder = 'Filtrer les titres…'
  filtre.setAttribute('aria-label', 'Filtrer les titres')

  let motif = ''
  function appliquer() {
    const cherche = motif.trim().toLowerCase()
    let visibles = 0
    for (const item of colonne.querySelectorAll('.outline-list > li')) {
      const texte = item.textContent.toLowerCase()
      const garde = cherche === '' || texte.includes(cherche)
      item.hidden = !garde
      if (garde) visibles++
    }
    videMessage.hidden = visibles > 0 || cherche === ''
  }
  filtre.addEventListener('input', () => {
    motif = filtre.value
    appliquer()
  })

  const videMessage = document.createElement('p')
  videMessage.className = 'feuille-vide'
  videMessage.textContent = 'Aucun titre ne correspond.'
  videMessage.hidden = true

  // Le greffon reconstruit sa liste quand les titres changent — y compris
  // pendant qu'on lit la feuille, si quelqu'un d'autre écrit. Le filtre doit
  // donc se réappliquer à la liste neuve, sinon il disparaît en silence.
  const observateur = new MutationObserver(() => appliquer())
  observateur.observe(colonne, { childList: true, subtree: true })

  // Toucher un titre ferme la feuille : on y va pour aller quelque part.
  colonne.addEventListener('click', (e) => {
    if (e.target.closest('.outline-link')) feuille.fermer()
  })

  const titres = colonne.querySelectorAll('.outline-link').length
  if (titres > SEUIL_FILTRE) feuille.corps.appendChild(filtre)
  feuille.corps.append(colonne, videMessage)
  if (titres > SEUIL_FILTRE) filtre.focus()

  // La section courante est déjà mise en évidence par le greffon : on
  // l'amène simplement dans le champ de vision.
  const courant = colonne.querySelector('.outline-courante')
  if (courant && courant.scrollIntoView) courant.scrollIntoView({ block: 'center' })

  return feuille
}
