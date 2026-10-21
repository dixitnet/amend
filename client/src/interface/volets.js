// Les volets latéraux (lot L1, 21/10/2026, revu le jour même à la demande de
// Sylvain — claude/vues-reference-formats.md).
//
// La rangée sous le bandeau est fixe : au bord gauche de la fenêtre le bouton
// du plan, un trait, la barre d'édition (alignée sur le bord gauche du texte),
// un trait, puis au bord droit les boutons Modifications et Margo. Ouvrir ou
// fermer un volet ne change **rien** à cette rangée : les boutons restent
// les mêmes, à la même place ; seul leur état (enfoncé ou non) change.
//
// Un volet = une colonne (le plan à gauche ; Modifications ou Margo à
// droite). Ses boutons ne sont pas dans la colonne mais dans la rangée
// (`hoteBoutons`) : la coquille (editor.js) les y pose. Toucher le bouton
// d'un panneau fermé l'ouvre ; toucher celui du panneau ouvert ferme le volet.
//
// L'état (« ferme », ou le panneau ouvert) est retenu **par appareil** dans le
// stockage local : c'est une habitude de travail, pas un réglage du document
// ni du compte. Stockage absent ou refusé (navigation privée) : on garde
// l'état du moment, sans erreur.
//
// Ce module ne sait rien de ce qu'il contient, ni de la place disponible :
// pousser le texte ou passer par-dessus, c'est disposition.js qui le décide.

import { icone } from './icones.js'

function lire(cle) {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    /* stockage indisponible : l'état ne survivra pas au rechargement */
  }
}

export const FERME = 'ferme'

/**
 * @param {object} o
 * @param {HTMLElement} o.colonne      la colonne (reçoit `volet`, `volet-ferme`, `data-panneau`)
 * @param {HTMLElement} o.hoteBoutons  où poser les boutons (dans la rangée fixe)
 * @param {{id:string, libelle:string, court?:string, icone:string, panneau:HTMLElement, compte?:HTMLElement}[]} o.panneaux
 *        `court` : le mot affiché à côté de l'icône quand le volet est ouvert (vue V1)
 * @param {string} o.cleMemoire        clé du stockage local
 * @param {string} o.defaut            panneau ouvert par défaut, ou 'ferme'
 * @param {(etat:string)=>void} [o.surChangement]  après chaque changement (panneau ou 'ferme')
 */
export function monterVolet({ colonne, hoteBoutons, panneaux, cleMemoire, defaut, surChangement }) {
  colonne.classList.add('volet')
  const boutons = new Map()
  for (const p of panneaux) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'volet-bouton'
    b.dataset.panneau = p.id
    b.title = p.libelle
    b.setAttribute('aria-label', p.libelle)
    b.setAttribute('aria-pressed', 'false')
    const mot = document.createElement('span')
    mot.className = 'volet-libelle'
    mot.textContent = p.court || p.libelle
    b.append(icone(p.icone, 18), mot)
    if (p.compte) b.appendChild(p.compte)
    b.addEventListener('click', () => basculer(p.id))
    hoteBoutons.appendChild(b)
    boutons.set(p.id, b)
    p.panneau.classList.add('volet-panneau')
    p.panneau.dataset.panneau = p.id
    if (p.panneau.parentNode !== colonne) colonne.appendChild(p.panneau)
  }

  const disponibles = () => panneaux.filter((p) => !boutons.get(p.id).hidden).map((p) => p.id)
  let etat = null

  function appliquer(nouvel) {
    if (nouvel !== FERME && !disponibles().includes(nouvel)) nouvel = disponibles()[0] || FERME
    etat = nouvel
    const ferme = etat === FERME
    colonne.classList.toggle('volet-ferme', ferme)
    colonne.dataset.panneau = ferme ? '' : etat
    for (const [id, b] of boutons) {
      const actif = !ferme && id === etat
      b.classList.toggle('actif', actif)
      b.setAttribute('aria-pressed', String(actif))
    }
    for (const p of panneaux) p.panneau.hidden = ferme || p.id !== etat
    ecrire(cleMemoire, etat)
    if (surChangement) surChangement(etat)
  }

  /** Le bouton d'un panneau fermé l'ouvre ; celui du panneau ouvert ferme le volet. */
  function basculer(id) {
    appliquer(etat === id ? FERME : id)
  }

  appliquer(lire(cleMemoire) || defaut)

  return {
    etat: () => etat,
    ouvert: () => etat !== FERME,
    ouvrir: (id) => appliquer(id),
    fermer: () => appliquer(FERME),
    /** Montrer ou cacher un bouton (Margo, selon les droits de la personne). */
    afficherPanneau(id, visible) {
      const b = boutons.get(id)
      if (!b) return
      b.hidden = !visible
      if (!visible && etat === id) appliquer(disponibles()[0] || FERME)
    },
  }
}
