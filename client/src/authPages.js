// Pages de connexion : demande de lien magique (#/login), vérification du
// lien reçu (#/login/verify/:token), et acceptation d'un lien d'invitation
// (#/invite/:token). Même style de superposition que la modale "Ton nom"
// (voir user.js / .name-modal dans style.css).
import { requestReconnectLink, verifyReconnectToken, fetchInvite, acceptInvite } from './auth.js'

function modal(innerHtml) {
  const overlay = document.createElement('div')
  overlay.className = 'name-modal-overlay'
  overlay.innerHTML = `<div class="name-modal">${innerHtml}</div>`
  return overlay
}

export function mountLogin(root) {
  root.innerHTML = ''
  const overlay = modal(`
    <h2>Se connecter</h2>
    <p>Indiquez votre adresse email, un lien de connexion valable 20 minutes vous sera envoyé.</p>
    <form>
      <input type="email" required placeholder="vous@exemple.fr" autofocus />
      <button type="submit">Recevoir le lien</button>
    </form>
    <p class="login-sent" hidden>Si cette adresse est connue, un email vient de partir — pensez aussi aux spams.</p>
    <a href="#/" class="back-link">← Retour</a>
  `)
  root.appendChild(overlay)
  const form = overlay.querySelector('form')
  const sentMsg = overlay.querySelector('.login-sent')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = overlay.querySelector('input').value.trim()
    const btn = form.querySelector('button')
    btn.disabled = true
    await requestReconnectLink(email)
    form.hidden = true
    sentMsg.hidden = false
  })
}

export function mountVerify(root, token) {
  root.innerHTML = ''
  const overlay = modal(`<h2>Connexion…</h2><p class="verify-status">Vérification du lien en cours.</p>`)
  root.appendChild(overlay)
  const status = overlay.querySelector('.verify-status')
  verifyReconnectToken(token).then((email) => {
    if (email) {
      location.hash = '#/'
    } else {
      status.textContent = 'Ce lien est invalide ou a expiré.'
      const retry = document.createElement('a')
      retry.href = '#/login'
      retry.className = 'back-link'
      retry.textContent = 'Redemander un lien →'
      overlay.querySelector('.name-modal').appendChild(retry)
    }
  })
}

export function mountInviteAccept(root, token) {
  root.innerHTML = ''
  const overlay = modal(`<p>Chargement de l'invitation…</p>`)
  root.appendChild(overlay)
  const box = overlay.querySelector('.name-modal')

  fetchInvite(token).then((invite) => {
    if (!invite) {
      box.innerHTML = `<h2>Lien invalide</h2><p>Ce lien d'invitation n'existe pas ou plus.</p><a href="#/" class="back-link">← Retour</a>`
      return
    }
    const roleLabel = invite.role === 'editeur' ? 'éditeur' : 'correcteur'
    box.innerHTML = `
      <h2>Rejoindre « ${escapeHtml(invite.docTitle || 'Sans titre')} »</h2>
      <p>Vous avez été invité·e comme <strong>${roleLabel}</strong>. Indiquez votre adresse email pour accéder au document.</p>
      <form>
        <input type="email" required placeholder="vous@exemple.fr" autofocus />
        <button type="submit">Accéder au document</button>
      </form>
    `
    const form = box.querySelector('form')
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = box.querySelector('input').value.trim()
      const btn = form.querySelector('button')
      btn.disabled = true
      const docId = await acceptInvite(token, email)
      if (docId) {
        location.hash = `#/doc/${docId}`
      } else {
        btn.disabled = false
        btn.textContent = 'Erreur — réessayer'
      }
    })
  })
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
