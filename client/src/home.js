import { getSessionEmail, logout, requestReconnectLink } from './auth.js'
import { logoAmend } from './logo.js'
import { lienAide } from './aide.js'
import { ouvrirChangementDeNom } from './nomCompte.js'
import { monterListeDocuments } from './listeDocuments.js'

export async function mountHome(root) {
  root.innerHTML = ''
  const email = await getSessionEmail()
  if (email) {
    mountAppHome(root, email)
  } else {
    mountPublicLanding(root)
  }
}

/** Visiteurs non connectés — la page d'accueil publique (17/09/2026).
 *
 * Trois choses, dans cet ordre, parce que le visiteur se pose trois
 * questions dans cet ordre : *qu'est-ce que c'est* (l'en-tête pleine
 * largeur : le logo, une phrase, l'avis de phase de lancement), puis
 * *est-ce que je peux entrer* (deux cartes : la liste d'attente pour qui
 * n'a pas d'accès, la connexion pour qui en a un).
 *
 * Deux décisions qui tiennent la page :
 *
 * 1. **Dire franchement que l'accès est sur invitation.** Sans ça, le
 *    formulaire d'attente ressemble à un formulaire mort, et la personne
 *    qui essaie de se connecter sans accès ne comprend pas son échec.
 * 2. **La connexion est ici, pas ailleurs.** Elle était reléguée derrière
 *    un lien vers `#/login` : deux publics, deux gestes, aucun des deux ne
 *    doit chercher le sien.
 *
 * Ergonomie petit écran (demandée le 17/09) : une seule colonne par
 * défaut, la liste d'attente en premier — le visiteur sans compte est le
 * cas majoritaire — et la deuxième colonne n'apparaît qu'à partir de
 * 760 px. Voir `.landing-*` dans style.css.
 */
function mountPublicLanding(root) {
  const wrap = document.createElement('div')
  wrap.className = 'home landing'

  // --- En-tête, pleine largeur -------------------------------------------
  const entete = document.createElement('header')
  entete.className = 'landing-entete'

  const logo = logoAmend()
  logo.classList.add('landing-logo')
  entete.appendChild(logo)

  const baseline = document.createElement('p')
  baseline.className = 'landing-baseline'
  baseline.textContent = "Écrire et relire à plusieurs, avec un vrai suivi des modifications."
  entete.appendChild(baseline)

  const pitch = document.createElement('p')
  pitch.className = 'landing-pitch'
  pitch.textContent =
    "amend.ink est un éditeur de texte collaboratif, léger et auto-hébergé. " +
    "Chacun voit qui écrit quoi, propose ses corrections plutôt que de les " +
    "imposer, et garde la main sur la mise en page et les exports."
  entete.appendChild(pitch)

  const avis = document.createElement('p')
  avis.className = 'landing-avis'
  avis.textContent =
    "L'application fonctionne, mais elle est en phase de lancement : " +
    "l'accès se fait uniquement sur invitation."
  entete.appendChild(avis)

  // L'aide est lisible sans compte (10/10/2026) : c'est ici qu'un visiteur
  // se demande ce qu'est l'application.
  const aide = document.createElement('p')
  aide.className = 'landing-avis'
  aide.appendChild(lienAide({ libelle: 'Lire l’aide d’amend.ink →' }))
  entete.appendChild(aide)

  wrap.appendChild(entete)

  // --- Deux cartes --------------------------------------------------------
  const colonnes = document.createElement('div')
  colonnes.className = 'landing-colonnes'
  colonnes.append(carteListeAttente(), carteConnexion())
  wrap.appendChild(colonnes)

  // Le pied de page porte les pages légales et le contact (03/10/2026) :
  // ce sont les liens qu'un filtre web cherche pour classer un site, et
  // ceux qu'un visiteur attend d'un service qui lui demande son adresse.
  const pied = document.createElement('p')
  pied.className = 'landing-pied'
  const liens = [
    ['Mentions légales', '/mentions-legales.html'],
    ['Confidentialité', '/confidentialite.html'],
    ['contact@dixit.net', 'mailto:contact@dixit.net'],
  ]
  pied.append('amend.ink')
  for (const [libelle, href] of liens) {
    pied.append(' · ')
    const a = document.createElement('a')
    a.href = href
    a.textContent = libelle
    pied.appendChild(a)
  }
  wrap.appendChild(pied)

  root.appendChild(wrap)
}

/** Un formulaire à un champ : libellé, saisie, bouton, et un message qui
 * remplace le tout une fois envoyé. Les deux cartes ont exactement la même
 * mécanique — d'où la fabrique commune. */
function formulaireEmail({ libelleBouton, autocomplete, onEnvoi, messageSucces }) {
  const form = document.createElement('form')
  form.className = 'landing-form'

  const champ = document.createElement('input')
  champ.type = 'email'
  champ.required = true
  champ.placeholder = 'vous@exemple.fr'
  champ.name = 'email'
  champ.setAttribute('aria-label', 'Votre adresse e-mail')
  // Pour que le clavier du téléphone arrive dans le bon mode et que
  // l'adresse enregistrée soit proposée.
  champ.setAttribute('inputmode', 'email')
  champ.setAttribute('autocomplete', autocomplete)
  champ.setAttribute('autocapitalize', 'off')
  champ.setAttribute('spellcheck', 'false')
  champ.setAttribute('aria-label', 'Adresse email')

  const bouton = document.createElement('button')
  bouton.type = 'submit'
  bouton.textContent = libelleBouton

  form.append(champ, bouton)

  const message = document.createElement('p')
  message.className = 'landing-message'
  message.hidden = true
  // Le message remplace le formulaire : il doit être annoncé, pas
  // seulement affiché.
  message.setAttribute('role', 'status')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = champ.value.trim()
    if (!email) return
    bouton.disabled = true
    bouton.textContent = 'Envoi…'
    try {
      await onEnvoi(email)
      form.hidden = true
      message.textContent = messageSucces
      message.hidden = false
    } catch {
      bouton.disabled = false
      bouton.textContent = libelleBouton
      message.textContent = "L'envoi a échoué — réessayez dans un instant."
      message.hidden = false
    }
  })

  return { form, message }
}

function carteListeAttente() {
  const carte = document.createElement('section')
  carte.className = 'landing-carte'

  const h2 = document.createElement('h2')
  h2.textContent = "Rejoindre la liste d'attente"
  const p = document.createElement('p')
  p.textContent = "Laissez votre adresse : vous serez prévenu·e dès qu'une place se libère."
  carte.append(h2, p)

  const { form, message } = formulaireEmail({
    libelleBouton: "M'inscrire",
    autocomplete: 'email',
    messageSucces: 'Merci — vous êtes sur la liste. On vous écrit dès que possible.',
    onEnvoi: async (email) => {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('refusé')
    },
  })
  carte.append(form, message)

  return carte
}

function carteConnexion() {
  const carte = document.createElement('section')
  carte.className = 'landing-carte'

  const h2 = document.createElement('h2')
  h2.textContent = "J'ai déjà un accès"
  const p = document.createElement('p')
  p.textContent = 'Recevez un lien de connexion, valable vingt minutes. Aucun mot de passe à retenir.'
  carte.append(h2, p)

  const { form, message } = formulaireEmail({
    libelleBouton: 'Recevoir mon lien',
    autocomplete: 'username',
    // Volontairement ambigu : la réponse est la même que l'adresse soit
    // connue ou non, pour ne pas révéler qui a un accès (voir
    // server/server.js, /api/auth/request-link).
    messageSucces:
      'Si cette adresse est connue, un email vient de partir. Pensez aussi à vos indésirables.',
    onEnvoi: (email) => requestReconnectLink(email),
  })
  carte.append(form, message)

  return carte
}

/** Visiteurs connectés : l'en-tête, la création d'un document, puis la
 * liste (listeDocuments.js) — favoris, dossiers, recherche, corbeille. */
function mountAppHome(root, email) {
  const wrap = document.createElement('div')
  wrap.className = 'home'

  // Le même logo que sur la page publique, en petit : une seule signature
  // pour toute l'application (asset partagé, voir logo.js).
  const h1 = document.createElement('h1')
  h1.appendChild(logoAmend({ taille: '30px', curseur: false }))
  const subtitle = document.createElement('p')
  subtitle.className = 'subtitle'
  subtitle.textContent = 'Édition collaborative avec suivi des modifications, et Margo, l’IA qui propose sans décider.'
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
  // L'aide et le nom (10/10/2026) : ce sont les deux choses qu'on vient
  // chercher ici sans le dire. L'aide ouvre un nouvel onglet.
  const aideLink = lienAide({ libelle: 'Aide' })
  const nomLink = document.createElement('a')
  nomLink.href = '#'
  nomLink.textContent = 'Changer mon nom'
  let nomAffiche = ''
  const dire = document.createTextNode(`Connecté comme ${email} `)
  authStatus.textContent = ''
  authStatus.appendChild(dire)
  fetch('/api/auth/me')
    .then((r) => r.json())
    .then((moi) => {
      if (moi.nom) {
        nomAffiche = moi.nom
        dire.textContent = `Connecté comme ${moi.nom} (${email}) `
      }
    })
    .catch(() => {})
  nomLink.addEventListener('click', (e) => {
    e.preventDefault()
    ouvrirChangementDeNom({
      nomActuel: nomAffiche,
      surChangement: (nom) => {
        nomAffiche = nom
        dire.textContent = `Connecté comme ${nom} (${email}) `
      },
    })
  })
  authStatus.append(aideLink, nomLink)
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
  styleLink.href = '#/modeles'
  styleLink.className = 'style-admin-link'
  styleLink.textContent = 'Gérer mes modèles →'
  wrap.appendChild(styleLink)

  const form = document.createElement('form')
  form.className = 'new-doc-form'
  const input = document.createElement('input')
  input.placeholder = 'Titre du nouveau document'
  input.name = 'titre'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', 'Titre du nouveau document')
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

  // Créer depuis un téléphone (23/09/2026) : un bouton rond en bas à
  // droite, et le document s'ouvre tout de suite, sans titre. Saisir un
  // titre dans un champ avant même d'avoir écrit une ligne est une friction
  // d'ordinateur ; sur téléphone on ouvre, on écrit, et l'on nomme en
  // touchant le titre — c'est ce que fait l'éditeur depuis l'interface
  // iPhone. Le formulaire complet reste sur grand écran (masqué en CSS
  // ici), où il ne coûte rien.
  const creerFab = document.createElement('button')
  creerFab.type = 'button'
  creerFab.className = 'doc-fab'
  creerFab.textContent = '+'
  creerFab.setAttribute('aria-label', 'Nouveau document')
  creerFab.onclick = async () => {
    creerFab.disabled = true
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      })
      if (res.status === 401) {
        location.hash = '#/login'
        return
      }
      if (!res.ok) return
      const doc = await res.json()
      location.hash = `#/doc/${doc.id}`
    } finally {
      creerFab.disabled = false
    }
  }
  wrap.appendChild(creerFab)

  // Favoris, dossiers, recherche et corbeille : voir listeDocuments.js.
  const liste = document.createElement('div')
  liste.className = 'liste-documents'
  wrap.appendChild(liste)
  root.appendChild(wrap)
  monterListeDocuments(liste)
}

