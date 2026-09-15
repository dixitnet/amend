// Pages de connexion : demande de lien magique (#/login), vérification du
// lien reçu (#/login/verify/:token), et acceptation d'une invitation
// nominative (#/invite/:token). Même style de superposition que la modale
// "Ton nom" (voir user.js / .name-modal dans style.css).
import { requestReconnectLink, verifyReconnectToken, acceptInvitation } from './auth.js'

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

/** Le lien d'invitation mène droit au document : plus de formulaire ni
 * d'email à saisir, puisque le jeton a été envoyé à une adresse précise
 * (voir server/server.js, route /api/invitations/:token). On n'affiche donc
 * qu'un état d'attente, et un message clair si le lien a expiré. */
export function mountInviteAccept(root, token) {
  root.innerHTML = ''
  const overlay = modal(`<h2>Ouverture du document…</h2><p class="verify-status">Vérification de votre invitation.</p>`)
  root.appendChild(overlay)
  const box = overlay.querySelector('.name-modal')

  acceptInvitation(token).then((res) => {
    if (res.docId) {
      location.hash = `#/doc/${res.docId}`
      return
    }
    box.innerHTML = `
      <h2>Invitation inutilisable</h2>
      <p>${escapeHtml(res.error)} — demandez à la personne qui vous a invité·e de vous en renvoyer une.</p>
      <a href="#/" class="back-link">← Retour</a>
    `
  })
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}
