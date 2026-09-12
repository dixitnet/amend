import { mountHome } from './home.js'
import { mountEditor } from './editor.js'
import { mountAdminStyle } from './adminStyle.js'
import { getUser } from './user.js'

const app = document.getElementById('app')
let currentEditor = null

async function route() {
  if (currentEditor) {
    currentEditor.destroy()
    currentEditor = null
  }

  const hash = location.hash || '#/'
  const docMatch = hash.match(/^#\/doc\/([A-Za-z0-9_-]+)$/)

  if (docMatch) {
    const docId = docMatch[1]
    const res = await fetch(`/api/docs/${docId}`)
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

  mountHome(app)
}

window.addEventListener('hashchange', route)
route()
