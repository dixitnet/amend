// Le menu du compte — la quatrième zone du bandeau (17/09/2026).
//
// C'est le seul endroit du bandeau qui ne parle pas du document mais de la
// personne : son adresse, ses outils d'administration s'il y a lieu, et la
// déconnexion. Il est à l'extrême droite, séparé des pastilles de présence
// par toute la largeur de la barre — les deux montrent des rondes colorées,
// et les confondre serait fâcheux : l'une dit « qui est là », l'autre dit
// « moi ».
//
// Volontairement chargé une seule fois et partagé : la liste des documents
// et l'éditeur y accèdent tous les deux, et l'appel à `/api/auth/me` sert
// aussi à savoir si la personne est administratrice.

import { getSessionEmail, logout } from './auth.js'

function initiales(texte) {
  const t = (texte || '').trim()
  if (!t) return '?'
  return t.slice(0, 2).toUpperCase()
}

/**
 * Monte la pastille du compte et son menu dans `container`.
 * Ne bloque pas : la pastille apparaît dès que l'adresse est connue.
 */
export function monterMenuCompte(container) {
  const menu = document.createElement('div')
  menu.className = 'menu-flottant menu-compte'

  const pastille = document.createElement('button')
  pastille.type = 'button'
  pastille.className = 'compte-pastille'
  pastille.textContent = '…'
  pastille.title = 'Mon compte'

  const liste = document.createElement('div')
  liste.className = 'menu-flottant-liste menu-flottant-droite'
  liste.hidden = true

  menu.append(pastille, liste)
  container.appendChild(menu)

  pastille.onclick = (e) => {
    e.stopPropagation()
    liste.hidden = !liste.hidden
  }
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) liste.hidden = true
  })

  getSessionEmail().then((email) => {
    if (!email) {
      menu.hidden = true
      return
    }
    pastille.textContent = initiales(email)
    pastille.title = email

    const adresse = document.createElement('span')
    adresse.className = 'menu-flottant-entete'
    adresse.textContent = email
    liste.appendChild(adresse)

    const deconnexion = document.createElement('button')
    deconnexion.type = 'button'
    deconnexion.textContent = 'Se déconnecter'
    deconnexion.onclick = async () => {
      await logout()
      location.hash = '#/'
      location.reload()
    }

    // Les entrées d'administration ne s'ajoutent que si le serveur le dit —
    // il refuserait de toute façon les autres (403), mais un lien qui mène
    // à un refus est pire qu'un lien absent.
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((moi) => {
        if (moi.admin) {
          const sep = document.createElement('hr')
          sep.className = 'menu-flottant-separateur'
          const backoffice = document.createElement('a')
          backoffice.href = '#/admin'
          backoffice.textContent = 'Back-office'
          const styleDefaut = document.createElement('a')
          styleDefaut.href = '#/style'
          styleDefaut.textContent = 'Style par défaut'
          liste.append(sep, backoffice, styleDefaut)
        }
      })
      .catch(() => {})
      .finally(() => {
        const sep = document.createElement('hr')
        sep.className = 'menu-flottant-separateur'
        liste.append(sep, deconnexion)
      })
  })

  return {
    destroy() {
      menu.remove()
    },
  }
}
