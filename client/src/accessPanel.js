// Panneau "Partager" d'un document : liens d'invitation (un par rôle,
// auto-connectants et réutilisables) et liste des accès accordés —
// réservé aux éditeurs (voir editor.js, server/server.js). Voir
// claude/conception-gestion-utilisateurs.md (projet Amend).

export function openAccessPanel(docId) {
  const overlay = document.createElement('div')
  overlay.className = 'name-modal-overlay'
  overlay.innerHTML = `
    <div class="name-modal access-modal">
      <h2>Partager ce document</h2>
      <p>Un lien par rôle, réutilisable par plusieurs personnes (ex. partagé dans un message de groupe) — chacune doit indiquer son email pour accéder au document.</p>
      <div class="invite-links">
        <div class="invite-link-row" data-role="editeur">
          <strong>Éditeur</strong>
          <input type="text" readonly />
          <button type="button" class="copy-btn">Copier</button>
          <button type="button" class="regen-btn">Régénérer</button>
        </div>
        <div class="invite-link-row" data-role="correcteur">
          <strong>Correcteur</strong>
          <input type="text" readonly />
          <button type="button" class="copy-btn">Copier</button>
          <button type="button" class="regen-btn">Régénérer</button>
        </div>
      </div>
      <h3>Accès actuels</h3>
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
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.textContent = 'Retirer'
      removeBtn.onclick = async () => {
        removeBtn.disabled = true
        await fetch(`/api/docs/${docId}/access/${encodeURIComponent(entry.email)}`, { method: 'DELETE' })
        load()
      }
      li.append(label, removeBtn)
      accessList.appendChild(li)
    }
  }

  async function load() {
    const res = await fetch(`/api/docs/${docId}/access`)
    if (!res.ok) return
    const data = await res.json()
    renderAccess(data.access)
    for (const role of ['editeur', 'correcteur']) {
      const row = overlay.querySelector(`.invite-link-row[data-role="${role}"]`)
      row.querySelector('input').value = `${location.origin}/#/invite/${data.inviteLinks[role]}`
    }
  }

  overlay.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input')
      input.select()
      navigator.clipboard?.writeText(input.value).catch(() => {})
    })
  })
  overlay.querySelectorAll('.regen-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const role = btn.parentElement.dataset.role
      btn.disabled = true
      await fetch(`/api/docs/${docId}/invite-link/${role}/regenerate`, { method: 'POST' })
      await load()
      btn.disabled = false
    })
  })

  load()
}
