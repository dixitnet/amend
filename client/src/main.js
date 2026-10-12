import { mountHome } from './home.js'
import { mountEditor } from './editor.js'
import { monterPaletteContact } from './contact.js'
import { getUser } from './user.js'
import { mountLogin, mountVerify, mountInviteAccept } from './authPages.js'
import { getSessionEmail } from './auth.js'

const app = document.getElementById('app')
let currentEditor = null

async function route() {
  monterContactSiConnecte()
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
    // Les pages d'administration, des modèles et des versions sont chargées à la
    // demande (point 9) : elles ne pèsent pas dans l'ouverture d'un document.
    const { mountVersions } = await import('./versions.js')
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
    // `myId` : l'identifiant stable du compte, écrit dans ses commentaires (S12).
    const user = { ...(await getUser({ nom: docMeta.myName, couleur: docMeta.myColor })), id: docMeta.myId }
    currentEditor = mountEditor(app, docId, user, docMeta)
    return
  }

  if (hash === '#/modeles') {
    const { mountModeles } = await import('./modeles.js')
    mountModeles(app)
    return
  }

  // L'ancienne page du style par défaut (avant le 01/10/2026) : c'est
  // maintenant le modèle « Par défaut » de la page des modèles. Les
  // marque-pages continuent de marcher.
  if (hash === '#/style') {
    location.replace('#/modeles')
    return
  }

  if (hash === '#/admin/ia') {
    const { mountAdminIa } = await import('./adminIa.js')
    mountAdminIa(app)
    return
  }

  if (hash === '#/admin') {
    const { mountAdmin } = await import('./admin.js')
    mountAdmin(app)
    return
  }

  // La liste d'attente en détail — le serveur vérifie ADMIN_EMAILS, cette
  // route n'est qu'une porte.
  if (hash === '#/inscrits') {
    const { mountInscrits } = await import('./inscrits.js')
    mountInscrits(app)
    return
  }

  mountHome(app)
}

window.addEventListener('hashchange', route)
route()

// La palette de contact (phase de test) : montée hors du routage, pour
// qu'elle survive aux changements de page — et seulement pour les personnes
// connectées, un visiteur anonyme n'ayant rien à signaler qu'il puisse
// décrire. Vérifiée à **chaque** changement de page, pas seulement au
// chargement : une personne invitée ouvre le lien d'invitation sans être
// connectée, et sa session naît pendant la navigation (#/invite, puis
// #/doc), sans rechargement. `getSessionEmail` est mis en cache et vidé à
// chaque ouverture de session ; `monterPaletteContact` ne monte qu'une fois.
function monterContactSiConnecte() {
  getSessionEmail().then((email) => {
    if (email) monterPaletteContact()
  })
}
