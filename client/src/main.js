import { mountHome } from './home.js'
import { mountEditor } from './editor.js'
import { mountAdminStyle } from './adminStyle.js'
import { mountAdmin } from './admin.js'
import { mountVersions } from './versions.js'
import { getUser } from './user.js'
import { mountLogin, mountVerify, mountInviteAccept } from './authPages.js'

const app = document.getElementById('app')
let currentEditor = null

async function route() {
  if (currentEditor) {
    currentEditor.destroy()
    currentEditor = null
  }

  const hash = location.hash || '#/'
  const docMatch = hash.match(/^#\/doc\/([A-Za-z0-9_-]+)$/)
  const versionsMatch = hash.match(/^#\/doc\/([A-Za-z0-9_-]+)\/versions$/)
  const loginMatch = hash.match(/^#\/login$/)
  const verifyMatch = hash.match(/^#\/login\/verify\/([A-Za-z0-9_-]+)$/)
  const inviteMatch = hash.match(/^#\/invite\/([A-Za-z0-9_-]+)$/)

  if (loginMatch) {
    mountLogin(app)
    return
  }

  if (verifyMatch) {
    mountVerify(app, verifyMatch[1])
    return
  }

  if (inviteMatch) {
    mountInviteAccept(app, inviteMatch[1])
    return
  }

  if (versionsMatch) {
    mountVersions(app, versionsMatch[1])
    return
  }

  if (docMatch) {
    const docId = docMatch[1]
    const res = await fetch(`/api/docs/${docId}`)
    if (res.status === 403) {
      app.innerHTML = '<div class="home"><p>Vous n\'avez pas accès à ce document.</p><a href="#/login">Se connecter →</a></div>'
      return
    }
    if (!res.ok) {
      app.innerHTML = '<div class="home"><p>Document introuvable.</p><a href="#/">← Retour</a></div>'
      return
    }
    const docMeta = await res.json()
    const user = await getUser()
    currentEditor = mountEditor(app, docId, user, docMeta)
    return
  }

  if (hash === '#/style') {
    mountAdminStyle(app)
    return
  }

  if (hash === '#/admin') {
    mountAdmin(app)
    return
  }

  mountHome(app)
}

window.addEventListener('hashchange', route)
route()
