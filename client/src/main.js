import { mountHome } from './home.js'
import { mountEditor } from './editor.js'
import { mountAdminStyle } from './stylePanel.js'
import { mountAdmin } from './admin.js'
import { mountInscrits } from './inscrits.js'
import { monterPaletteContact } from './contact.js'
import { mountVersions } from './versions.js'
import { getUser } from './user.js'
import { mountLogin, mountVerify, mountInviteAccept } from './authPages.js'
import { getSessionEmail } from './auth.js'

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
    // Le nom et la couleur arrivent avec les métadonnées du document
    // (myName/myColor) : `myName` à null veut dire « ce compte n'a pas
    // encore de nom », et c'est la seule chose qui déclenche la modale.
    const user = await getUser({ nom: docMeta.myName, couleur: docMeta.myColor })
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

  // La liste d'attente en détail — le serveur vérifie ADMIN_EMAILS, cette
  // route n'est qu'une porte.
  if (hash === '#/inscrits') {
    mountInscrits(app)
    return
  }

  mountHome(app)
}

window.addEventListener('hashchange', route)
route()

// La palette de contact (phase de test) : montée une fois, hors du routage,
// pour qu'elle survive aux changements de page — et seulement pour les
// personnes connectées, un visiteur anonyme n'ayant rien à signaler qu'il
// puisse décrire.
getSessionEmail().then((email) => {
  if (email) monterPaletteContact()
})
