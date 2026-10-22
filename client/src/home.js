import { getSessionEmail, requestReconnectLink } from './auth.js'
import { logoAmend } from './logo.js'
import { lienAide } from './aide.js'
import { monterMenuCompte } from './compteMenu.js'
import { monterListeDocuments } from './listeDocuments.js'
import { icone } from './interface/icones.js'

export async function mountHome(root) {
  root.innerHTML = ''
  const email = await getSessionEmail()
  if (email) {
    mountAppHome(root)
  } else {
    mountPublicLanding(root)
  }
}

/** Visiteurs non connectés — la page d'accueil publique (17/09/2026, reprise
 * le 21/10/2026 dans le langage graphique de l'éditeur).
 *
 * Le visiteur se pose trois questions, dans cet ordre : *qu'est-ce que
 * c'est* (le titre, une phrase, un exemple de modification proposée),
 * *puis-je entrer* (la mention « sur invitation »), *comment* (deux cartes :
 * la liste d'attente pour qui n'a pas d'accès, la connexion pour qui en a un).
 *
 * Deux décisions qui tiennent la page :
 *
 * 1. **Dire franchement que l'accès est sur invitation.** Sans ça, le
 *    formulaire d'attente ressemble à un formulaire mort, et la personne
 *    qui essaie de se connecter sans accès ne comprend pas son échec.
 * 2. **La connexion est ici, pas ailleurs.** Deux publics, deux gestes,
 *    aucun des deux ne doit chercher le sien : le bouton du bandeau mène
 *    directement au champ de connexion.
 *
 * Le dessin est celui de l'éditeur : un bandeau de 56 px (le logo, l'aide),
 * Roboto, des boutons de 8 px de rayon, le vert pour l'action. Petit écran
 * d'abord : une colonne, la liste d'attente en premier (le visiteur sans
 * compte est le cas majoritaire) ; deux colonnes à partir de 760 px.
 */
function mountPublicLanding(root) {
  const wrap = document.createElement('div')
  wrap.className = 'accueil accueil-public'

  // --- Bandeau -------------------------------------------------------------
  const bandeau = document.createElement('header')
  bandeau.className = 'accueil-bandeau'
  const logoLien = document.createElement('a')
  logoLien.href = '#/'
  logoLien.className = 'accueil-logo'
  logoLien.appendChild(logoAmend({ taille: '26px' }))
  const droite = document.createElement('nav')
  droite.className = 'accueil-bandeau-droite'
  droite.setAttribute('aria-label', 'Accès rapide')
  // L'aide est lisible sans compte (10/10/2026) : c'est ici qu'un visiteur
  // se demande ce qu'est l'application.
  droite.appendChild(lienAide({ classe: 'accueil-lien', libelle: 'Aide' }))
  const entrer = document.createElement('button')
  entrer.type = 'button'
  entrer.className = 'btn-contour'
  entrer.textContent = 'Se connecter'
  droite.appendChild(entrer)
  bandeau.append(logoLien, droite)
  wrap.appendChild(bandeau)

  const main = document.createElement('main')
  main.className = 'accueil-contenu landing'

  // --- Présentation ----------------------------------------------------------
  const hero = document.createElement('section')
  hero.className = 'landing-entete'

  const avis = document.createElement('p')
  avis.className = 'landing-avis'
  avis.append(icone('etincelle', 16))
  avis.append(
    "L'application fonctionne, mais elle est en phase de lancement : " + "l'accès se fait uniquement sur invitation."
  )
  hero.appendChild(avis)

  const titre = document.createElement('h1')
  titre.className = 'landing-titre'
  titre.textContent = 'Écrire et relire à plusieurs, avec un vrai suivi des modifications.'
  hero.appendChild(titre)

  const pitch = document.createElement('p')
  pitch.className = 'landing-pitch'
  pitch.textContent =
    'amend.ink est un éditeur de texte collaboratif, léger et auto-hébergé. ' +
    'Chacun voit qui écrit quoi, propose ses corrections plutôt que de les ' +
    'imposer, et garde la main sur la mise en page et les exports.'
  hero.appendChild(pitch)
  hero.appendChild(exempleDeModification())
  main.appendChild(hero)

  // --- Deux cartes --------------------------------------------------------
  const colonnes = document.createElement('div')
  colonnes.className = 'landing-colonnes'
  const carteAttente = carteListeAttente()
  const carteAcces = carteConnexion()
  colonnes.append(carteAttente, carteAcces)
  main.appendChild(colonnes)
  entrer.addEventListener('click', () => {
    carteAcces.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const champ = carteAcces.querySelector('input')
    if (champ) champ.focus({ preventScroll: true })
  })
  wrap.appendChild(main)

  // Le pied de page porte les pages légales et le contact (03/10/2026) :
  // ce sont les liens qu'un filtre web cherche pour classer un site, et
  // ceux qu'un visiteur attend d'un service qui lui demande son adresse.
  const pied = document.createElement('footer')
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

/** Une modification proposée, dessinée comme dans l'éditeur : ce que fait
 * l'application, montré plutôt qu'expliqué. Purement décoratif (rien ne se
 * clique, rien n'est lu par un lecteur d'écran : le texte au-dessus dit déjà
 * tout). */
function exempleDeModification() {
  const fig = document.createElement('figure')
  fig.className = 'landing-exemple'
  fig.setAttribute('aria-hidden', 'true')
  const texte = document.createElement('p')
  texte.className = 'landing-exemple-texte'
  const ancien = document.createElement('del')
  ancien.textContent = 'bien souvent'
  const nouveau = document.createElement('ins')
  nouveau.textContent = 'le plus souvent'
  texte.append('Le quartier ', ancien, ' ', nouveau, ' transforme un travail de long terme sur les tissus existants.')
  const carte = document.createElement('div')
  carte.className = 'landing-exemple-carte'
  const pastille = document.createElement('span')
  pastille.className = 'landing-exemple-pastille'
  pastille.textContent = 'CL'
  const qui = document.createElement('span')
  qui.className = 'landing-exemple-qui'
  qui.innerHTML = '<b>Claire</b> propose · il y a 2 min'
  const accepter = document.createElement('span')
  accepter.className = 'landing-exemple-accepter'
  accepter.textContent = 'Accepter'
  const rejeter = document.createElement('span')
  rejeter.className = 'landing-exemple-rejeter'
  rejeter.textContent = 'Rejeter'
  carte.append(pastille, qui, accepter, rejeter)
  fig.append(texte, carte)
  return fig
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
    messageSucces: 'Si cette adresse est connue, un email vient de partir. Pensez aussi à vos indésirables.',
    onEnvoi: (email) => requestReconnectLink(email),
  })
  carte.append(form, message)

  return carte
}

/** Visiteurs connectés : le bandeau (logo, aide, modèles, compte), le titre
 * avec la création d'un document, puis la liste (listeDocuments.js) —
 * favoris, dossiers, recherche, corbeille. Même dessin que l'éditeur
 * (reprise du 21/10/2026) : le nom, le changement de nom, la déconnexion et le
 * back-office sont dans le menu de la pastille du compte, comme dans un
 * document. */
function mountAppHome(root) {
  const wrap = document.createElement('div')
  wrap.className = 'accueil accueil-docs'

  // --- Bandeau -------------------------------------------------------------
  const bandeau = document.createElement('header')
  bandeau.className = 'accueil-bandeau'
  const logoLien = document.createElement('a')
  logoLien.href = '#/'
  logoLien.className = 'accueil-logo'
  // Le même logo que sur la page publique, en petit : une seule signature
  // pour toute l'application (asset partagé, voir logo.js).
  logoLien.appendChild(logoAmend({ taille: '26px', curseur: false }))
  const droite = document.createElement('nav')
  droite.className = 'accueil-bandeau-droite'
  droite.setAttribute('aria-label', 'Outils')
  const modeles = document.createElement('a')
  modeles.href = '#/modeles'
  modeles.className = 'accueil-lien'
  modeles.append(icone('modeles', 16), 'Modèles')
  modeles.title = 'Gérer mes modèles de mise en page'
  droite.append(modeles, lienAide({ classe: 'accueil-lien', libelle: 'Aide' }))
  const compte = document.createElement('span')
  compte.className = 'accueil-compte'
  droite.appendChild(compte)
  bandeau.append(logoLien, droite)
  wrap.appendChild(bandeau)
  monterMenuCompte(compte)

  const main = document.createElement('main')
  main.className = 'accueil-contenu'

  // --- Titre et création -----------------------------------------------------
  const tete = document.createElement('div')
  tete.className = 'accueil-tete'
  const h1 = document.createElement('h1')
  h1.textContent = 'Mes documents'
  const creer = document.createElement('div')
  creer.className = 'accueil-creer'
  tete.append(h1, creer)
  main.appendChild(tete)

  // Créer un document (22/10/2026) : un geste, le document s'ouvre tout de
  // suite, sans titre. Saisir un titre dans un champ avant même d'avoir écrit
  // une ligne est une friction ; on ouvre, on écrit, et l'on nomme en touchant
  // le titre — c'est ce que faisait déjà le bouton rond du téléphone (23/09),
  // et ce que fait l'éditeur. Un seul chemin pour le bouton du bandeau et
  // pour le bouton rond.
  const nouveau = document.createElement('button')
  nouveau.type = 'button'
  nouveau.className = 'btn-principal'
  nouveau.append(icone('ajouter', 16), 'Nouveau document')

  const creerFab = document.createElement('button')
  creerFab.type = 'button'
  creerFab.className = 'doc-fab'
  creerFab.textContent = '+'
  creerFab.setAttribute('aria-label', 'Nouveau document')

  const creerDocument = async () => {
    nouveau.disabled = true
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
      nouveau.disabled = false
      creerFab.disabled = false
    }
  }
  nouveau.addEventListener('click', creerDocument)
  creerFab.addEventListener('click', creerDocument)
  creer.appendChild(nouveau)
  wrap.appendChild(creerFab)

  // Favoris, dossiers, recherche et corbeille : voir listeDocuments.js.
  const liste = document.createElement('div')
  liste.className = 'liste-documents'
  main.appendChild(liste)
  wrap.appendChild(main)
  root.appendChild(wrap)
  monterListeDocuments(liste)
}
