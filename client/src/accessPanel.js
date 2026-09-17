// Panneau « Partager » d'un document : invitations nominatives par email et
// liste des accès — réservé aux éditeurs (voir editor.js,
// server/server.js). Les liens partagés par rôle ont été retirés le
// 15/09/2026 : on invite désormais une adresse précise, qui reçoit un mail
// nommant le document, et son lien ouvre le document directement. Voir
// claude/conception-gestion-utilisateurs.md (projet Amend).

export function openAccessPanel(docId, { jeSuisProprietaire = false } = {}) {
  const overlay = document.createElement('div')
  overlay.className = 'name-modal-overlay'
  overlay.innerHTML = `
    <div class="name-modal access-modal">
      <h2>Partager ce document</h2>
      <p>Invitez une personne par son adresse email : elle recevra un lien qui ouvre ce document directement, valable 14 jours.</p>
      <form class="invite-form">
        <input type="email" required placeholder="personne@exemple.fr" />
        <select>
          <option value="editeur">Éditeur</option>
          <option value="correcteur">Correcteur</option>
        </select>
        <button type="submit">Inviter</button>
      </form>
      <p class="invite-message" hidden></p>
      <h3>Accès</h3>
      <ul class="access-list"></ul>
      <button type="button" class="close-btn">Fermer</button>
    </div>
  `
  document.body.appendChild(overlay)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
  overlay.querySelector('.close-btn').onclick = () => overlay.remove()

  const accessList = overlay.querySelector('.access-list')
  const form = overlay.querySelector('.invite-form')
  const emailInput = form.querySelector('input')
  const roleSelect = form.querySelector('select')
  const message = overlay.querySelector('.invite-message')

  function dire(texte, type) {
    message.textContent = texte
    message.className = `invite-message ${type}`
    message.hidden = false
  }

  function renderAccess(access) {
    accessList.innerHTML = ''
    if (access.length === 0) {
      const li = document.createElement('li')
      li.textContent = 'Personne pour le moment (à part vous).'
      accessList.appendChild(li)
      return
    }
    for (const entry of access) {
      const li = document.createElement('li')
      const label = document.createElement('span')
      label.textContent = `${entry.email} — ${entry.role === 'editeur' ? 'éditeur' : 'correcteur'}`
      li.appendChild(label)

      // Le propriétaire (17/09/2026) : celui qui porte le document. Ce
      // n'est pas un rôle de plus — il est toujours éditeur — mais deux
      // droits que personne d'autre n'a : supprimer, et transmettre.
      if (entry.proprietaire) {
        const badge = document.createElement('span')
        badge.className = 'role-badge'
        badge.textContent = 'propriétaire'
        li.appendChild(badge)
      }

      // « En attente » = invitée, jamais venue. L'accès existe déjà côté
      // serveur ; ce badge dit seulement que la personne n'a pas encore
      // ouvert son lien, pour qu'un éditeur sache qui relancer.
      if (entry.status === 'invite') {
        const badge = document.createElement('span')
        badge.className = 'access-pending'
        badge.textContent = 'en attente'
        li.appendChild(badge)

        const resend = document.createElement('button')
        resend.type = 'button'
        resend.textContent = 'Renvoyer'
        resend.onclick = async () => {
          resend.disabled = true
          const ok = await inviter(entry.email, entry.role)
          resend.disabled = false
          if (ok) dire(`Invitation renvoyée à ${entry.email}.`, 'ok')
        }
        li.appendChild(resend)
      }

      // Le propriétaire n'est ni retirable ni rétrogradable : le document
      // deviendrait orphelin — plus personne pour le porter, ni pour le
      // supprimer. Le serveur refuse de toute façon ; le bouton est absent
      // pour ne pas proposer un geste qui échouera.
      if (!entry.proprietaire) {
        const removeBtn = document.createElement('button')
        removeBtn.type = 'button'
        removeBtn.textContent = entry.status === 'invite' ? 'Annuler' : 'Retirer'
        removeBtn.onclick = async () => {
          removeBtn.disabled = true
          await fetch(`/api/docs/${docId}/access/${encodeURIComponent(entry.email)}`, { method: 'DELETE' })
          load()
        }
        li.appendChild(removeBtn)

        // Transmettre le document — droit exclusif du propriétaire, et
        // seule façon pour lui de s'en défaire. À deux clics : ça ne se
        // reprend pas tout seul.
        if (jeSuisProprietaire && entry.status !== 'invite') {
          const passer = document.createElement('button')
          passer.type = 'button'
          passer.className = 'btn-texte'
          passer.textContent = 'Transmettre'
          passer.title = `Faire de ${entry.email} le propriétaire de ce document`
          let minuteur = null
          passer.onclick = async () => {
            if (!minuteur) {
              passer.textContent = 'Confirmer ?'
              minuteur = setTimeout(() => {
                minuteur = null
                passer.textContent = 'Transmettre'
              }, 3000)
              return
            }
            clearTimeout(minuteur)
            minuteur = null
            passer.disabled = true
            const res = await fetch(`/api/docs/${docId}/owner`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: entry.email }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              passer.disabled = false
              passer.textContent = 'Transmettre'
              dire(data.error || 'le transfert a échoué', 'erreur')
              return
            }
            dire(`${entry.email} porte désormais ce document.`, 'ok')
            // On ne l'est plus : recharger la page remet toute l'interface
            // (bouton Supprimer, droits) d'accord avec la réalité.
            location.reload()
          }
          li.appendChild(passer)
        }
      }
      accessList.appendChild(li)
    }
  }

  async function inviter(email, role) {
    const res = await fetch(`/api/docs/${docId}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      dire(data.error || "l'invitation n'a pas pu être envoyée", 'erreur')
      return false
    }
    await load()
    return true
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = form.querySelector('button')
    btn.disabled = true
    const email = emailInput.value.trim()
    const ok = await inviter(email, roleSelect.value)
    btn.disabled = false
    if (ok) {
      dire(`Invitation envoyée à ${email}.`, 'ok')
      emailInput.value = ''
    }
  })

  async function load() {
    const res = await fetch(`/api/docs/${docId}/access`)
    if (!res.ok) return
    const data = await res.json()
    renderAccess(data.access)
  }

  load()
}
