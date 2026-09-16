import { getSessionEmail, logout } from './auth.js'

export async function mountHome(root) {
  root.innerHTML = ''
  const email = await getSessionEmail()
  if (email) {
    mountAppHome(root, email)
  } else {
    mountPublicLanding(root)
  }
}

/** Visiteurs non connectés : texte de présentation + liste d'attente,
 * jamais la liste des documents ni le formulaire de création (voir
 * claude/conception-gestion-utilisateurs.md, projet Amend — texte de
 * présentation laissé simple/générique, à personnaliser). */
function mountPublicLanding(root) {
  const wrap = document.createElement('div')
  wrap.className = 'home landing'

  wrap.innerHTML = `
    <h1>Amend</h1>
    <p class="subtitle">Édition collaborative avec suivi des modifications et assistance IA.</p>
    <p class="landing-pitch">
      Amend est un éditeur de texte collaboratif, léger et auto-hébergé,
      pensé pour écrire et relire à plusieurs avec un vrai suivi des
      modifications — et un coup de main de l'IA quand il en faut.
      Encore en accès restreint : laissez votre email pour être prévenu·e.
    </p>
  `

  const form = document.createElement('form')
  form.className = 'waitlist-form'
  const input = document.createElement('input')
  input.type = 'email'
  input.required = true
  input.placeholder = 'vous@exemple.fr'
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = "Rejoindre la liste d'attente"
  form.append(input, submit)
  const sentMsg = document.createElement('p')
  sentMsg.className = 'waitlist-sent'
  sentMsg.hidden = true
  sentMsg.textContent = 'Merci — on vous recontacte bientôt.'

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    submit.disabled = true
    await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: input.value.trim() }),
    })
    form.hidden = true
    sentMsg.hidden = false
  })

  wrap.append(form, sentMsg)

  const loginLink = document.createElement('a')
  loginLink.href = '#/login'
  loginLink.className = 'landing-login-link'
  loginLink.textContent = 'Déjà un accès ? Se connecter'
  wrap.appendChild(loginLink)

  root.appendChild(wrap)
}

/** Visiteurs connectés : l'appli telle qu'avant (créer/lister les
 * documents) — inchangée à part la prise en compte du rôle par document
 * pour masquer étoile/suppression aux correcteurs (déjà refusées côté
 * serveur, voir server.js : canManageDocument — masquées ici seulement
 * pour éviter un clic qui échoue sans explication). */
function mountAppHome(root, email) {
  const wrap = document.createElement('div')
  wrap.className = 'home'

  const h1 = document.createElement('h1')
  h1.textContent = 'Amend'
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
      if (doc.myRole === 'correcteur') {
        const badge = document.createElement('span')
        badge.className = 'role-badge'
        badge.textContent = 'correcteur'
        titleWrap.appendChild(badge)
      }

      item.append(titleWrap, date)

      if (canManage) {
        // Suppression à deux clics plutôt qu'un window.confirm() : le
        // bouton devient "Confirmer ?" pendant 3 secondes, un second clic
        // dans ce délai supprime réellement — sinon il revient tout seul à
        // son état normal (clic ailleurs, ou simplement le temps qui
        // passe).
        const deleteBtn = document.createElement('button')
        deleteBtn.type = 'button'
        deleteBtn.className = 'delete-doc-btn'
        deleteBtn.textContent = 'Supprimer'
        deleteBtn.title = 'Supprimer ce document'
        let confirmTimer = null
        function resetDeleteBtn() {
          clearTimeout(confirmTimer)
          confirmTimer = null
          deleteBtn.textContent = 'Supprimer'
          deleteBtn.classList.remove('confirming')
        }
        deleteBtn.addEventListener('click', async () => {
          if (!confirmTimer) {
            deleteBtn.textContent = 'Confirmer ?'
            deleteBtn.classList.add('confirming')
            confirmTimer = setTimeout(resetDeleteBtn, 3000)
            return
          }
          resetDeleteBtn()
          deleteBtn.disabled = true
          const res = await fetch(`/api/docs/${doc.id}`, { method: 'DELETE' })
          if (res.ok) {
            item.remove()
          } else {
            deleteBtn.disabled = false
          }
        })
        item.appendChild(deleteBtn)
      }

      list.appendChild(item)
    }
  }

  fetch('/api/docs')
    .then((res) => res.json())
    .then(({ docs }) => renderList(docs))
}
