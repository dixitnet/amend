// Choisir sa couleur (13/10/2026).
//
// La couleur vit sur le compte (server/users.js), comme le nom : c'est elle
// qu'on reconnaît d'un coup d'œil dans la marge, sur le curseur et sur les
// modifications. Elle était tirée au sort à la création du compte ; on peut
// désormais la choisir, parmi une palette (shared/identite.js) qui exclut le
// vert, réservé à l'IA — une palette et non une roue libre, parce qu'une
// couleur laissée libre finit blanche ou verte, et la marge ne se lit plus.
//
// Ce que ça change et ne change pas, dit dans la fenêtre : la nouvelle
// couleur sert tout de suite aux autres personnes du document et à vos
// prochaines modifications ; celles qui existent déjà gardent la couleur
// qu'elles portaient quand vous les avez faites.

import { COULEURS_CHOIX, NOMS_COULEURS } from '../../shared/identite.js'
import { equiperModale } from './modale.js'

/**
 * Ouvre la fenêtre « Ma couleur ». `surChangement(couleur, nom)` est appelé
 * une fois la couleur enregistrée. Renvoie une promesse de la nouvelle
 * couleur, ou `null` si la personne a renoncé.
 */
export function ouvrirChoixDeCouleur({ couleurActuelle = '', surChangement } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'name-modal-overlay'
    overlay.innerHTML = `
      <form class="name-modal couleur-modal">
        <h2>Ma couleur</h2>
        <p>C’est elle qu’on voit sur votre curseur et sur vos modifications. Celles que vous avez déjà faites gardent la couleur qu’elles portaient.</p>
        <div class="couleur-grille" role="radiogroup" aria-label="Couleur"></div>
        <p class="name-modal-erreur" role="alert" hidden></p>
        <div class="name-modal-actions">
          <button type="button" class="name-modal-annuler">Annuler</button>
          <button type="submit" class="name-modal-ok">Enregistrer</button>
        </div>
      </form>
    `
    const form = overlay.querySelector('form')
    const grille = overlay.querySelector('.couleur-grille')
    const erreur = overlay.querySelector('.name-modal-erreur')
    const ok = overlay.querySelector('.name-modal-ok')
    let choisie = String(couleurActuelle || '').toLowerCase()

    const pastilles = COULEURS_CHOIX.map((couleur) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'couleur-choix'
      b.dataset.couleur = couleur
      b.setAttribute('role', 'radio')
      b.title = NOMS_COULEURS[couleur] || couleur
      b.setAttribute('aria-label', NOMS_COULEURS[couleur] || couleur)
      b.style.setProperty('--user-color', couleur)
      b.onclick = () => {
        choisie = couleur
        marquer()
      }
      grille.appendChild(b)
      return b
    })
    function marquer() {
      for (const b of pastilles) {
        const actif = b.dataset.couleur === choisie
        b.setAttribute('aria-checked', String(actif))
        b.classList.toggle('couleur-choix-actif', actif)
      }
    }
    marquer()
    // Les flèches passent d'une pastille à l'autre, comme dans tout groupe
    // de boutons radio.
    grille.addEventListener('keydown', (e) => {
      const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
      if (!pas) return
      const i = pastilles.indexOf(document.activeElement)
      if (i < 0) return
      e.preventDefault()
      const suivante = pastilles[(i + pas + pastilles.length) % pastilles.length]
      choisie = suivante.dataset.couleur
      marquer()
      suivante.focus()
    })

    let fini = false
    const fermerModale = equiperModale(overlay, {
      surFermeture: () => {
        if (!fini) {
          fini = true
          resolve(null)
        }
      },
    })
    const terminer = (valeur) => {
      fini = true
      fermerModale()
      resolve(valeur)
    }
    overlay.querySelector('.name-modal-annuler').onclick = () => fermerModale()

    const dire = (texte) => {
      erreur.textContent = texte
      erreur.hidden = !texte
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!choisie) return dire('Choisissez une couleur.')
      if (choisie === String(couleurActuelle || '').toLowerCase()) return fermerModale()
      ok.disabled = true
      dire('')
      try {
        const res = await fetch('/api/auth/couleur', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ couleur: choisie }),
        })
        const corps = await res.json().catch(() => ({}))
        if (!res.ok) {
          const raison = corps && corps.error ? String(corps.error) : ''
          dire(raison ? `Couleur refusée : ${raison}.` : 'La couleur n’a pas pu être enregistrée. Réessayez.')
          ok.disabled = false
          return
        }
        if (surChangement) surChangement(corps.couleur, corps.nom)
        terminer(corps.couleur)
      } catch {
        dire('La couleur n’a pas pu être enregistrée (connexion ?). Réessayez.')
        ok.disabled = false
      }
    })

    document.body.appendChild(overlay)
    const premier = pastilles.find((b) => b.dataset.couleur === choisie) || pastilles[0]
    if (premier) premier.focus()
  })
}
