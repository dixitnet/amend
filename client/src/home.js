import { getSessionEmail } from './auth.js'

export async function mountHome(root) {
  root.innerHTML = ''
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
  wrap.appendChild(authStatus)
  getSessionEmail().then((email) => {
    authStatus.textContent = email ? `Connecté comme ${email}` : ''
    if (!email) {
      const loginLink = document.createElement('a')
      loginLink.href = '#/login'
      loginLink.textContent = 'Se connecter'
      authStatus.appendChild(loginLink)
    }
  })

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

      const starBtn = document.createElement('button')
      starBtn.type = 'button'
      starBtn.className = 'star-btn'
      starBtn.textContent = doc.starred ? '★' : '☆'
      starBtn.classList.toggle('starred', !!doc.starred)
      starBtn.title = doc.starred ? 'Retirer des favoris' : 'Mettre en favori'
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

      // Suppression à deux clics plutôt qu'un window.confirm() : le bouton
      // devient "Confirmer ?" pendant 3 secondes, un second clic dans ce
      // délai supprime réellement — sinon il revient tout seul à son état
      // normal (clic ailleurs, ou simplement le temps qui passe).
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

      item.append(titleWrap, date, deleteBtn)
      list.appendChild(item)
    }
  }

  const res = await fetch('/api/docs')
  const { docs } = await res.json()
  renderList(docs)
}
