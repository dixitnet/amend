// Le panneau « Publier sur le web » (17/09/2026).
//
// Publier est un acte, pas une case à cocher : ce panneau dit en toutes
// lettres ce qui va se passer — une page lisible **par quiconque a le
// lien**, sans compte — avant de le faire, et il affiche l'état en clair
// une fois que c'est fait. Dépublier est au même endroit, aussi facile.
//
// Ce qui est publié est un **instantané** : la page ne suit pas le
// document. C'est dit ici, parce que c'est la première chose qui surprend.

import { etatPublication, publier, depublier } from './publicationExport.js'

function bouton(libelle, classe) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = classe
  b.textContent = libelle
  return b
}

export async function ouvrirPanneauPublication(docId, getDoc, getTitre) {
  const overlay = document.createElement('div')
  overlay.className = 'name-modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'name-modal access-modal publication-modal'
  overlay.appendChild(modal)
  document.body.appendChild(overlay)

  function fermer() {
    overlay.remove()
    document.removeEventListener('keydown', surEchap)
  }
  function surEchap(e) {
    if (e.key === 'Escape') fermer()
  }
  document.addEventListener('keydown', surEchap)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fermer()
  })

  const titre = document.createElement('h2')
  titre.textContent = 'Publier sur le web'
  const statut = document.createElement('p')
  statut.className = 'publication-statut'
  statut.textContent = 'Chargement…'
  modal.append(titre, statut)

  let etat
  try {
    etat = await etatPublication(docId)
  } catch {
    statut.textContent = 'L’état de publication n’a pas pu être lu.'
    modal.appendChild(bouton('Fermer', 'btn-texte')).onclick = fermer
    return
  }

  const corps = document.createElement('div')
  modal.appendChild(corps)

  function dessiner() {
    corps.innerHTML = ''
    statut.className = `publication-statut ${etat.publiee ? 'publiee' : ''}`
    statut.textContent = etat.publiee
      ? 'Ce document a une page publique.'
      : 'Ce document n’a pas de page publique.'

    const explication = document.createElement('p')
    explication.className = 'bo-note'
    explication.textContent = etat.publiee
      ? 'La page est un instantané : elle ne suit pas le document. Republiez pour y reporter vos modifications. Les marques de suivi et les commentaires n’y figurent pas.'
      : 'Une page publique est lisible par quiconque a le lien, sans compte. C’est un instantané du texte au moment où vous publiez : il faudra republier pour y reporter vos modifications. Les marques de suivi et les commentaires n’y figurent jamais.'
    corps.appendChild(explication)

    if (etat.publiee && etat.url) {
      const champ = document.createElement('input')
      champ.type = 'text'
      champ.readOnly = true
      champ.className = 'publication-url'
      champ.value = etat.url
      champ.onclick = () => champ.select()
      corps.appendChild(champ)

      const barreLien = document.createElement('div')
      barreLien.className = 'style-actions'
      const copier = bouton('Copier le lien', 'btn-texte')
      copier.onclick = async () => {
        try {
          await navigator.clipboard.writeText(etat.url)
          copier.textContent = 'Lien copié'
          setTimeout(() => (copier.textContent = 'Copier le lien'), 1500)
        } catch {
          champ.select()
        }
      }
      const ouvrir = document.createElement('a')
      ouvrir.className = 'btn-texte'
      ouvrir.href = etat.url
      ouvrir.target = '_blank'
      ouvrir.rel = 'noopener'
      ouvrir.textContent = 'Ouvrir la page'
      barreLien.append(copier, ouvrir)
      corps.appendChild(barreLien)
    }

    const message = document.createElement('p')
    message.className = 'publication-message'
    message.hidden = true
    message.setAttribute('role', 'status')
    corps.appendChild(message)

    const actions = document.createElement('div')
    actions.className = 'style-actions'

    const principal = bouton(etat.publiee ? 'Republier' : 'Publier', 'btn-primary')
    principal.onclick = async () => {
      principal.disabled = true
      principal.textContent = 'Publication…'
      try {
        const r = await publier(docId, getDoc(), getTitre())
        etat = { ...etat, publiee: true, url: r.url }
        dessiner()
      } catch (err) {
        principal.disabled = false
        principal.textContent = etat.publiee ? 'Republier' : 'Publier'
        message.textContent = err.message
        message.className = 'publication-message erreur'
        message.hidden = false
      }
    }
    actions.appendChild(principal)

    if (etat.publiee) {
      // Dépublier à deux clics : le lien a pu être envoyé à des gens, et
      // il cessera de fonctionner pour eux.
      const retirer = bouton('Retirer la page', 'btn-texte')
      let minuteur = null
      retirer.onclick = async () => {
        if (!minuteur) {
          retirer.textContent = 'Confirmer le retrait ?'
          minuteur = setTimeout(() => {
            minuteur = null
            retirer.textContent = 'Retirer la page'
          }, 3000)
          return
        }
        clearTimeout(minuteur)
        minuteur = null
        retirer.disabled = true
        try {
          await depublier(docId)
          etat = { ...etat, publiee: false, url: null }
          dessiner()
        } catch (err) {
          retirer.disabled = false
          retirer.textContent = 'Retirer la page'
          message.textContent = err.message
          message.className = 'publication-message erreur'
          message.hidden = false
        }
      }
      actions.appendChild(retirer)
    }

    const annuler = bouton('Fermer', 'btn-texte')
    annuler.onclick = fermer
    actions.appendChild(annuler)
    corps.appendChild(actions)
  }

  dessiner()
}
