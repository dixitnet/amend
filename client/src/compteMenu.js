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

import { getSessionEmail, logout, logoutEverywhere } from './auth.js'
import { initials } from './presence.js'
import { ouvrirChangementDeNom } from './nomCompte.js'

/** Les initiales de la pastille : celles du **nom** quand on en a un — les
 * mêmes que dans la liste des présents —, sinon le début de l'adresse. */
function initiales(nom, email) {
  if (nom) return initials(nom)
  const t = (email || '').trim()
  return t ? t.slice(0, 2).toUpperCase() : '?'
}

/**
 * Monte la pastille du compte et son menu dans `container`.
 * Ne bloque pas : la pastille apparaît dès que l'adresse est connue.
 *
 * `couleur` est une **fonction**, pas une valeur : la pastille est montée
 * avant que la couleur de la personne soit connue (elle arrive avec les
 * métadonnées du document), et une fonction se lit au bon moment.
 *
 * `surNom(nom)` est appelé quand la personne vient de changer son nom
 * (10/10/2026) : l'éditeur y met à jour son identité dans le document en
 * cours, sans recharger la page.
 */
export function monterMenuCompte(container, { couleur, surNom } = {}) {
  const menu = document.createElement('div')
  menu.className = 'menu-flottant menu-compte'

  const pastille = document.createElement('button')
  pastille.type = 'button'
  pastille.className = 'compte-pastille'
  pastille.textContent = '…'
  pastille.title = 'Mon compte'
  // La pastille porte **sa** couleur (18/09) : la même que son curseur et
  // ses modifications dans le texte. C'est ce qui fait le lien entre « moi
  // dans l'application » et « moi dans le document », un des premiers
  // repères que cherche quelqu'un qui relit à plusieurs. Elle reste creuse
  // là où la couleur n'a pas de sens — la liste des documents.
  const teinte = couleur && couleur()
  if (teinte) {
    pastille.style.setProperty('--user-color', teinte)
    pastille.classList.add('compte-pastille-coloree')
  }

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
    let nomCourant = null
    const adresse = document.createElement('span')
    adresse.className = 'menu-flottant-entete'
    // L'en-tête dit **qui je suis** : le nom, puis l'adresse qui prouve le
    // compte. La pastille en reprend les initiales.
    const majEntete = () => {
      pastille.textContent = initiales(nomCourant, email)
      pastille.title = nomCourant ? `${nomCourant} — ${email}` : email
      adresse.textContent = nomCourant ? `${nomCourant} · ${email}` : email
    }
    majEntete()
    liste.appendChild(adresse)

    const monNom = document.createElement('button')
    monNom.type = 'button'
    monNom.className = 'compte-mon-nom'
    monNom.textContent = 'Changer mon nom…'
    monNom.onclick = () => {
      liste.hidden = true
      ouvrirChangementDeNom({
        nomActuel: nomCourant || '',
        surChangement: (nom) => {
          nomCourant = nom
          majEntete()
          if (surNom) surNom(nom)
        },
      })
    }
    liste.append(monNom)

    const deconnexion = document.createElement('button')
    deconnexion.type = 'button'
    deconnexion.textContent = 'Se déconnecter'
    deconnexion.onclick = async () => {
      await logout()
      location.hash = '#/'
      location.reload()
    }

    const deconnexionPartout = document.createElement('button')
    deconnexionPartout.type = 'button'
    deconnexionPartout.className = 'compte-deconnexion-partout'
    deconnexionPartout.textContent = 'Se déconnecter partout'
    deconnexionPartout.title = 'Ferme votre session sur tous vos appareils, celui-ci compris'
    deconnexionPartout.onclick = async () => {
      deconnexionPartout.disabled = true
      try {
        await logoutEverywhere()
      } catch {
        /* le serveur injoignable : on se déconnecte au moins d'ici */
        await logout().catch(() => {})
      }
      location.hash = '#/'
      location.reload()
    }

    // Les entrées d'administration ne s'ajoutent que si le serveur le dit —
    // il refuserait de toute façon les autres (403), mais un lien qui mène
    // à un refus est pire qu'un lien absent.
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((moi) => {
        if (moi.nom) {
          nomCourant = moi.nom
          majEntete()
        }
        if (moi.admin) {
          const sep = document.createElement('hr')
          sep.className = 'menu-flottant-separateur'
          const backoffice = document.createElement('a')
          backoffice.href = '#/admin'
          backoffice.textContent = 'Back-office'
          liste.append(sep, backoffice)
        }
      })
      .catch(() => {})
      .finally(() => {
        const sep = document.createElement('hr')
        sep.className = 'menu-flottant-separateur'
        liste.append(sep, deconnexion, deconnexionPartout)
      })
  })

  return {
    destroy() {
      menu.remove()
    },
  }
}
