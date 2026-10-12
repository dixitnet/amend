/** Un bouton qui demande confirmation par un second clic, plutôt qu'une
 * boîte de dialogue du navigateur : il devient « Confirmer ? » pendant
 * 3 secondes, un second clic dans ce délai agit — sinon il revient tout seul
 * à son état normal. Sert à tout ce qu'on ne veut pas faire sur un clic
 * malheureux : mettre à la corbeille, quitter, supprimer pour de bon.
 *
 * `action` renvoie la réponse du serveur (ou ce qui y ressemble) ; seul
 * `res.ok` déclenche `surSucces`. */
export function boutonADeuxClics({ libelle, titre, classe, action, surSucces }) {
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.className = classe
  bouton.textContent = libelle
  bouton.title = titre
  let minuteur = null
  function remettre() {
    clearTimeout(minuteur)
    minuteur = null
    bouton.textContent = libelle
    bouton.classList.remove('confirming')
  }
  bouton.addEventListener('click', async () => {
    if (!minuteur) {
      bouton.textContent = 'Confirmer ?'
      bouton.classList.add('confirming')
      minuteur = setTimeout(remettre, 3000)
      return
    }
    remettre()
    bouton.disabled = true
    const res = await action()
    if (res && res.ok) surSucces()
    else bouton.disabled = false
  })
  return bouton
}
