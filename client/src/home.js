import { getSessionEmail, logout, requestReconnectLink } from './auth.js'
import { logoAmend } from './logo.js'

export async function mountHome(root) {
  root.innerHTML = ''
  const email = await getSessionEmail()
  if (email) {
    mountAppHome(root, email)
  } else {
    mountPublicLanding(root)
  }
}

/** Visiteurs non connectés — la page d'accueil publique (17/09/2026).
 *
 * Trois choses, dans cet ordre, parce que le visiteur se pose trois
 * questions dans cet ordre : *qu'est-ce que c'est* (l'en-tête pleine
 * largeur : le logo, une phrase, l'avis de phase de lancement), puis
 * *est-ce que je peux entrer* (deux cartes : la liste d'attente pour qui
 * n'a pas d'accès, la connexion pour qui en a un).
 *
 * Deux décisions qui tiennent la page :
 *
 * 1. **Dire franchement que l'accès est sur invitation.** Sans ça, le
 *    formulaire d'attente ressemble à un formulaire mort, et la personne
 *    qui essaie de se connecter sans accès ne comprend pas son échec.
 * 2. **La connexion est ici, pas ailleurs.** Elle était reléguée derrière
 *    un lien vers `#/login` : deux publics, deux gestes, aucun des deux ne
 *    doit chercher le sien.
 *
 * Ergonomie petit écran (demandée le 17/09) : une seule colonne par
 * défaut, la liste d'attente en premier — le visiteur sans compte est le
 * cas majoritaire — et la deuxième colonne n'apparaît qu'à partir de
 * 760 px. Voir `.landing-*` dans style.css.
 */
function mountPublicLanding(root) {
  const wrap = document.createElement('div')
  wrap.className = 'home landing'

  // --- En-tête, pleine largeur -------------------------------------------
  const entete = document.createElement('header')
  entete.className = 'landing-entete'

  const logo = logoAmend()
  logo.classList.add('landing-logo')
  entete.appendChild(logo)

  const baseline = document.createElement('p')
  baseline.className = 'landing-baseline'
  baseline.textContent = "Écrire et relire à plusieurs, avec un vrai suivi des modifications."
  entete.appendChild(baseline)

  const pitch = document.createElement('p')
  pitch.className = 'landing-pitch'
  pitch.textContent =
    "amend.ink est un éditeur de texte collaboratif, léger et auto-hébergé. " +
    "Chacun voit qui écrit quoi, propose ses corrections plutôt que de les " +
    "imposer, et garde la main sur la mise en page et les exports."
  entete.appendChild(pitch)

  const avis = document.createElement('p')
  avis.className = 'landing-avis'
  avis.textContent =
    "L'application fonctionne, mais elle est en phase de lancement : " +
    "l'accès se fait uniquement sur invitation."
  entete.appendChild(avis)

  wrap.appendChild(entete)

  // --- Deux cartes --------------------------------------------------------
  const colonnes = document.createElement('div')
  colonnes.className = 'landing-colonnes'
  colonnes.append(carteListeAttente(), carteConnexion())
  wrap.appendChild(colonnes)

  const pied = document.createElement('p')
  pied.className = 'landing-pied'
  pied.textContent = 'amend.ink'
  wrap.appendChild(pied)

  root.appendChild(wrap)
}

/** Un formulaire à un champ : libellé, saisie, bouton, et un message qui
 * remplace le tout une fois envoyé. Les deux cartes ont exactement la même
 * mécanique — d'où la fabrique commune. */
function formulaireEmail({ libelleBouton, autocomplete, onEnvoi, messageSucces }) {
  const form = document.createElement('form')
  form.className = 'landing-form'

  const champ = document.createElement('input')
  champ.type = 'email'
  champ.required = true
  champ.placeholder = 'vous@exemple.fr'
  // Pour que le clavier du téléphone arrive dans le bon mode et que
  // l'adresse enregistrée soit proposée.
  champ.setAttribute('inputmode', 'email')
  champ.setAttribute('autocomplete', autocomplete)
  champ.setAttribute('autocapitalize', 'off')
  champ.setAttribute('spellcheck', 'false')
  champ.setAttribute('aria-label', 'Adresse email')

  const bouton = document.createElement('button')
  bouton.type = 'submit'
  bouton.textContent = libelleBouton

  form.append(champ, bouton)

  const message = document.createElement('p')
  message.className = 'landing-message'
  message.hidden = true
  // Le message remplace le formulaire : il doit être annoncé, pas
  // seulement affiché.
  message.setAttribute('role', 'status')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = champ.value.trim()
    if (!email) return
    bouton.disabled = true
    bouton.textContent = 'Envoi…'
    try {
      await onEnvoi(email)
      form.hidden = true
      message.textContent = messageSucces
      message.hidden = false
    } catch {
      bouton.disabled = false
      bouton.textContent = libelleBouton
      message.textContent = "L'envoi a échoué — réessayez dans un instant."
      message.hidden = false
    }
  })

  return { form, message }
}

function carteListeAttente() {
  const carte = document.createElement('section')
  carte.className = 'landing-carte'

  const h2 = document.createElement('h2')
  h2.textContent = "Rejoindre la liste d'attente"
  const p = document.createElement('p')
  p.textContent = "Laissez votre adresse : vous serez prévenu·e dès qu'une place se libère."
  carte.append(h2, p)

  const { form, message } = formulaireEmail({
    libelleBouton: "M'inscrire",
    autocomplete: 'email',
    messageSucces: 'Merci — vous êtes sur la liste. On vous écrit dès que possible.',
    onEnvoi: async (email) => {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('refusé')
    },
  })
  carte.append(form, message)

  return carte
}

function carteConnexion() {
  const carte = document.createElement('section')
  carte.className = 'landing-carte'

  const h2 = document.createElement('h2')
  h2.textContent = "J'ai déjà un accès"
  const p = document.createElement('p')
  p.textContent = 'Recevez un lien de connexion, valable vingt minutes. Aucun mot de passe à retenir.'
  carte.append(h2, p)

  const { form, message } = formulaireEmail({
    libelleBouton: 'Recevoir mon lien',
    autocomplete: 'username',
    // Volontairement ambigu : la réponse est la même que l'adresse soit
    // connue ou non, pour ne pas révéler qui a un accès (voir
    // server/server.js, /api/auth/request-link).
    messageSucces:
      'Si cette adresse est connue, un email vient de partir. Pensez aussi à vos indésirables.',
    onEnvoi: (email) => requestReconnectLink(email),
  })
  carte.append(form, message)

  return carte
}

/** Ce qu'on est sur ce document, pour le badge à côté du titre.
 *
 * Toujours quelque chose : « propriétaire », puis le rôle. La propriété
 * l'emporte parce qu'elle est plus forte que le rôle — un propriétaire est
 * éditeur de toute façon, et c'est la propriété qui explique le bouton
 * « Supprimer » plutôt que « Quitter ».
 *
 * Le repli sur la valeur brute du rôle est délibéré : le jour où
 * « lecteur » entrera dans `server/roles.js`, le badge l'affichera sans
 * qu'on touche à ce fichier. Un rôle inconnu vaut mieux affiché tel quel
 * que disparu.
 */
const LIBELLES_ROLE = {
  editeur: 'éditeur',
  correcteur: 'correcteur',
  lecteur: 'lecteur',
}

function libelleRole(doc) {
  if (doc.jeSuisProprietaire) return { cle: 'proprietaire', libelle: 'propriétaire' }
  if (!doc.myRole) return null
  return { cle: doc.myRole, libelle: LIBELLES_ROLE[doc.myRole] || doc.myRole }
}

/** Un bouton qui demande confirmation par un second clic, plutôt qu'une
 * boîte de dialogue du navigateur. Deux usages — supprimer et quitter —
 * qui n'ont pas les mêmes conséquences mais le même besoin : ne pas partir
 * sur un clic malheureux. */
function boutonADeuxClics({ libelle, titre, classe, action, surSucces }) {
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

/** Visiteurs connectés : l'appli telle qu'avant (créer/lister les
 * documents) — inchangée à part la prise en compte du rôle par document
 * pour masquer étoile/suppression aux correcteurs (déjà refusées côté
 * serveur, voir server.js : canManageDocument — masquées ici seulement
 * pour éviter un clic qui échoue sans explication). */
function mountAppHome(root, email) {
  const wrap = document.createElement('div')
  wrap.className = 'home'

  // Le même logo que sur la page publique, en petit : une seule signature
  // pour toute l'application (asset partagé, voir logo.js).
  const h1 = document.createElement('h1')
  h1.appendChild(logoAmend({ taille: '30px', curseur: false }))
  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent = 'Édition collaborative avec suivi des modifications et assistance IA.'
  wrap.append(h1, subtitle)

  const authStatus = document.createElement('p')
  authStatus.className = 'auth-status'
  authStatus.textContent = `Connecté comme ${email} `
  // Entrée du back-office, visible seulement pour les administrateurs — la
  // route serveur refuse de toute façon les autres (403).
  fetch('/api/auth/me')
    .then((r) => r.json())
    .then((moi) => {
      if (!moi.admin) return
      const lien = document.createElement('a')
      lien.href = '#/admin'
      lien.textContent = 'Back-office'
      authStatus.appendChild(lien)
    })
    .catch(() => {})
  const logoutLink = document.createElement('a')
  logoutLink.href = '#'
  logoutLink.textContent = 'Se déconnecter'
  logoutLink.addEventListener('click', async (e) => {
    e.preventDefault()
    await logout()
    location.reload()
  })
  authStatus.appendChild(logoutLink)
  wrap.appendChild(authStatus)

  const styleLink = document.createElement('a')
  styleLink.href = '#/style'
  styleLink.className = 'style-admin-link'
  styleLink.textContent = 'Mise en page →'
  wrap.appendChild(styleLink)

  const form = document.createElement('form')
  form.className = 'new-doc-form'
  const input = document.createElement('input')
  input.placeholder = 'Titre du nouveau document'
  input.required = true
  const submit = document.createElement('button')
  submit.textContent = 'Créer'
  submit.type = 'submit'
  form.append(input, submit)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: input.value }),
    })
    if (res.status === 401) {
      location.hash = '#/login'
      return
    }
    const doc = await res.json()
    location.hash = `#/doc/${doc.id}`
  })
  wrap.appendChild(form)

  const titreListe = document.createElement('h2')
  // Pas `doc-list-title` : cette classe désigne déjà le titre de chaque
  // document dans la liste (voir plus bas). La réutiliser appliquait à
  // chaque ligne la taille et la marge de ce titre de section.
  titreListe.className = 'doc-list-heading'
  titreListe.textContent = 'Mes documents'
  wrap.appendChild(titreListe)

  const list = document.createElement('ul')
  list.className = 'doc-list'
  wrap.appendChild(list)
  root.appendChild(wrap)

  // Tri par étoile fait côté serveur (voir Storage.listDocs) — ce module ne
  // fait qu'afficher dans l'ordre reçu, et redemande la liste triée après
  // chaque bascule plutôt que de trier une seconde fois ici.
  function renderList(docs) {
    list.innerHTML = ''
    if (docs.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'doc-list-empty'
      empty.textContent = 'Aucun document pour le moment.'
      list.appendChild(empty)
      return
    }
    for (const doc of docs) {
      const item = document.createElement('li')
      const canManage = doc.myRole !== 'correcteur'

      const starBtn = document.createElement('button')
      starBtn.type = 'button'
      starBtn.className = 'star-btn'
      starBtn.textContent = doc.starred ? '★' : '☆'
      starBtn.classList.toggle('starred', !!doc.starred)
      starBtn.title = doc.starred ? 'Retirer des favoris' : 'Mettre en favori'
      if (!canManage) starBtn.disabled = true
      starBtn.addEventListener('click', async () => {
        starBtn.disabled = true
        try {
          const res = await fetch(`/api/docs/${doc.id}/star`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ starred: !doc.starred }),
          })
          if (!res.ok) return
          const refreshed = await fetch('/api/docs')
          const { docs: freshDocs } = await refreshed.json()
          renderList(freshDocs)
        } finally {
          starBtn.disabled = false
        }
      })

      const link = document.createElement('a')
      link.href = `#/doc/${doc.id}`
      link.textContent = doc.title || 'Sans titre'
      const date = document.createElement('span')
      date.className = 'doc-date'
      date.textContent = new Date(doc.updatedAt).toLocaleString('fr-FR')

      const titleWrap = document.createElement('span')
      titleWrap.className = 'doc-list-title'
      titleWrap.append(starBtn, link)
      // Ce qu'on est sur ce document — voir libelleRole.
      const badge = libelleRole(doc)
      if (badge) {
        const el = document.createElement('span')
        // Même forme pour tous, la couleur seule distingue — voir
        // .role-badge dans style.css.
        el.className = `role-badge role-${badge.cle}`
        el.textContent = badge.libelle
        titleWrap.appendChild(el)
      }

      item.append(titleWrap, date)

      // Supprimer ou quitter (17/09/2026) — jamais les deux, et jamais
      // l'un déguisé en l'autre. Le propriétaire supprime le document,
      // définitivement, pour tout le monde. Les autres le quittent : ils
      // retirent leur propre accès et ne touchent à rien chez personne.
      // Le propriétaire, lui, ne peut pas quitter le sien — le document
      // deviendrait orphelin ; il transfère d'abord (panneau Partager).
      //
      // Deux clics plutôt qu'un window.confirm() : le bouton devient
      // « Confirmer ? » pendant 3 secondes, un second clic dans ce délai
      // agit — sinon il revient tout seul à son état normal.
      if (doc.jeSuisProprietaire || !doc.owner) {
        item.appendChild(
          boutonADeuxClics({
            libelle: 'Supprimer',
            titre: 'Supprimer définitivement ce document, pour tout le monde',
            classe: 'delete-doc-btn',
            action: () => fetch(`/api/docs/${doc.id}`, { method: 'DELETE' }),
            surSucces: () => item.remove(),
          })
        )
      } else {
        item.appendChild(
          boutonADeuxClics({
            libelle: 'Quitter',
            titre: 'Retirer mon accès à ce document — il n’est pas supprimé',
            classe: 'delete-doc-btn',
            action: () => fetch(`/api/docs/${doc.id}/access/moi`, { method: 'DELETE' }),
            surSucces: () => item.remove(),
          })
        )
      }

      list.appendChild(item)
    }
  }

  fetch('/api/docs')
    .then((res) => res.json())
    .then(({ docs }) => renderList(docs))
}
