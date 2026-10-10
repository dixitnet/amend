// Changer son nom (10/10/2026).
//
// Le nom vit sur le compte (server/users.js) : on le choisit à la première
// ouverture d'un document (user.js), et on peut le changer ici, depuis le
// menu du compte et la page d'accueil. La couleur ne change pas : c'est
// elle qu'on reconnaît d'un coup d'œil dans la marge.
//
// Ce que ça change et ne change pas, dit dans la fenêtre : le nouveau nom
// sert tout de suite aux autres personnes qui sont dans le document, et à
// vos prochaines modifications ; celles qui existent déjà gardent le nom
// qu'elles portaient quand vous les avez faites.

/**
 * Ouvre la fenêtre « Mon nom ». `surChangement(nom, couleur)` est appelé
 * une fois le nom enregistré. Renvoie une promesse du nouveau nom, ou
 * `null` si la personne a renoncé.
 */
export function ouvrirChangementDeNom({ nomActuel = '', surChangement } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'name-modal-overlay'
    overlay.innerHTML = `
      <form class="name-modal" role="dialog" aria-modal="true" aria-labelledby="nom-titre">
        <h2 id="nom-titre">Mon nom</h2>
        <p>Affiché aux autres personnes qui travaillent avec vous. Vos modifications déjà faites gardent le nom qu’elles portaient.</p>
        <input type="text" maxlength="40" autocomplete="name" aria-label="Votre nom" />
        <p class="name-modal-erreur" role="alert" hidden></p>
        <div class="name-modal-actions">
          <button type="button" class="name-modal-annuler">Annuler</button>
          <button type="submit" class="name-modal-ok">Enregistrer</button>
        </div>
      </form>
    `
    const form = overlay.querySelector('form')
    const input = overlay.querySelector('input')
    const erreur = overlay.querySelector('.name-modal-erreur')
    const ok = overlay.querySelector('.name-modal-ok')
    input.value = nomActuel

    const fermer = (valeur) => {
      document.removeEventListener('keydown', surTouche, true)
      overlay.remove()
      resolve(valeur)
    }
    function surTouche(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        fermer(null)
      }
    }
    document.addEventListener('keydown', surTouche, true)
    overlay.querySelector('.name-modal-annuler').onclick = () => fermer(null)
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) fermer(null)
    })

    const dire = (texte) => {
      erreur.textContent = texte
      erreur.hidden = !texte
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const nom = input.value.trim()
      if (!nom) return dire('Le nom ne peut pas être vide.')
      if (nom === nomActuel) return fermer(null)
      ok.disabled = true
      dire('')
      try {
        const res = await fetch('/api/auth/name', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nom }),
        })
        const corps = await res.json().catch(() => ({}))
        if (!res.ok) {
          const raison = corps && corps.error ? String(corps.error) : ''
          dire(raison ? `Nom refusé : ${raison}.` : 'Le nom n’a pas pu être enregistré. Réessayez.')
          ok.disabled = false
          return
        }
        if (surChangement) surChangement(corps.nom, corps.couleur)
        fermer(corps.nom)
      } catch {
        dire('Le nom n’a pas pu être enregistré (connexion ?). Réessayez.')
        ok.disabled = false
      }
    })

    document.body.appendChild(overlay)
    input.focus()
    input.select()
  })
}
