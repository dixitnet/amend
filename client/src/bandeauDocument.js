// Les pièces du bandeau d'un document (point 23 de la feuille de route,
// 13/10/2026 : sorties de `mountEditor`). Le bandeau est découpé en trois
// zones — gauche (où je suis), centre (qui est là), droite (ce que je fais
// au document) — dont `editor.js` garde l'assemblage ; chaque pièce ici est
// construite à part et ne connaît de l'éditeur que ce qu'on lui passe.
//
// Rien de ce qui est construit ici n'a besoin de la vue ProseMirror ni du
// fournisseur Yjs au moment de sa construction : ce qui en dépend arrive par
// une fonction (`envoyerTitre`, `cibleDuPlan`) ou par `lier(...)`, appelée
// quand ils existent.

import { messageFugace } from './images.js'
import { ouvrirPlan } from './planFeuille.js'
import { svgIcone } from './interface/icones.js'

/**
 * La zone gauche : retour, plan, titre (esthétique de la vue V1, 21/10/2026 :
 * « Nouveau document » passe dans le menu ⋯ du bandeau — il est construit ici
 * et rendu à l'appelant, qui l'y range ; l'étoile des favoris reste devant le
 * titre).
 *
 * @param {HTMLElement} zoneGauche
 * @param {object} options
 * @param {string} options.docId
 * @param {object} options.docMeta                    titre et favori de départ
 * @param {(titre: string) => void} options.envoyerTitre   relais du titre aux autres onglets
 * @param {() => HTMLElement} options.cibleDuPlan     la colonne du plan, ouverte par le bouton Plan
 * @returns {{ titleInput: HTMLInputElement, nouveauBtn: HTMLButtonElement, starBtn: HTMLButtonElement }}
 */
export function monterZoneGauche(zoneGauche, { docId, docMeta, envoyerTitre, cibleDuPlan }) {
  const backLink = document.createElement('a')
  backLink.href = '#/'
  backLink.className = 'back-link'
  // Un chevron, comme dans la vue V1 ; le nom reste pour les lecteurs d'écran.
  backLink.innerHTML = svgIcone('gauche', 20)
  backLink.title = 'Mes documents'
  backLink.setAttribute('aria-label', 'Mes documents')
  zoneGauche.appendChild(backLink)

  // Le plan n'a plus de colonne sous 1100 px (20/09/2026) : ce bouton est
  // la seule porte vers lui sur tablette et téléphone, et c'est l'exigence
  // la plus explicite du chantier — naviguer simplement dans un document
  // long. Caché au-dessus de ce seuil, où la colonne est là.
  const planBtn = document.createElement('button')
  planBtn.type = 'button'
  planBtn.className = 'btn-preset btn-plan'
  planBtn.textContent = 'Plan'
  planBtn.title = 'Naviguer dans le document par ses titres'
  planBtn.onclick = () => ouvrirPlan(cibleDuPlan())
  zoneGauche.appendChild(planBtn)

  // « + Nouveau » partout, y compris dans un document qu'on ne fait que
  // relire : créer un document ne demande qu'une session, jamais un rôle sur
  // celui qu'on a sous les yeux. Sans ce bouton, quelqu'un arrivé par une
  // invitation devait repasser par la liste pour commencer quelque chose —
  // et un correcteur pouvait croire qu'il n'en avait pas le droit.
  const nouveauBtn = document.createElement('button')
  nouveauBtn.type = 'button'
  nouveauBtn.className = 'btn-nouveau menu-item'
  nouveauBtn.textContent = 'Nouveau document'
  nouveauBtn.title = 'Créer un document'
  nouveauBtn.onclick = async () => {
    nouveauBtn.disabled = true
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
      if (!res.ok) throw new Error('création refusée')
      const doc = await res.json()
      location.hash = `#/doc/${doc.id}`
    } catch (err) {
      messageFugace("Le document n'a pas pu être créé.", { erreur: true })
    } finally {
      nouveauBtn.disabled = false
    }
  }

  // L'étoile précède le titre (18/09) : elle qualifie le document, elle
  // n'agit pas dessus — sa place est du côté du nom, pas du côté des
  // outils.
  const starBtn = document.createElement('button')
  starBtn.type = 'button'
  starBtn.className = 'etoile-doc'
  let starred = !!docMeta.starred
  function renderStar() {
    starBtn.textContent = starred ? '★' : '☆'
    starBtn.classList.toggle('starred', starred)
    starBtn.title = starred ? 'Retirer des favoris' : 'Mettre en favori'
    starBtn.setAttribute('aria-label', starBtn.title)
    starBtn.setAttribute('aria-pressed', String(starred))
  }
  renderStar()
  starBtn.onclick = async () => {
    const next = !starred
    starBtn.disabled = true
    try {
      const res = await fetch(`/api/docs/${docId}/star`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ starred: next }),
      })
      if (res.ok) {
        starred = next
        renderStar()
      }
    } finally {
      starBtn.disabled = false
    }
  }

  // Le titre reste éditable en place (confirmé le 17/09) : c'est le nom du
  // lieu où l'on est, pas une fonction — d'où sa place dans la zone de
  // navigation, et non parmi les outils.
  const titleInput = document.createElement('input')
  titleInput.className = 'doc-title'
  titleInput.value = docMeta.title
  titleInput.title = 'Titre du document — modifiable directement'
  titleInput.setAttribute('aria-label', 'Titre du document')
  titleInput.name = 'titre'
  titleInput.autocomplete = 'off'
  // Le titre prend la largeur de son texte (vue V1, 21/10/2026) : l'état de
  // l'enregistrement le suit juste après. `field-sizing` là où il existe
  // (style.css), `size` partout ailleurs.
  const ajusterLargeurTitre = () => {
    titleInput.size = Math.max(8, Math.min(60, titleInput.value.length + 1))
  }
  ajusterLargeurTitre()
  titleInput.addEventListener('input', ajusterLargeurTitre)
  titleInput.addEventListener('change', ajusterLargeurTitre)
  let titleSaveTimer = null
  titleInput.addEventListener('input', () => {
    // Broadcast on every keystroke (cheap — just a relay, see provider.js)
    // so other open tabs update live, same spirit as the document body;
    // the actual persistence below stays debounced.
    envoyerTitre(titleInput.value)
    clearTimeout(titleSaveTimer)
    titleSaveTimer = setTimeout(() => {
      fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: titleInput.value }),
      }).catch(() => {})
    }, 500)
  })
  // L'étoile est devant le titre, pas dans un menu (consigne du 21/10/2026).
  zoneGauche.append(starBtn, titleInput)

  return { titleInput, nouveauBtn, starBtn }
}

/**
 * L'interrupteur du suivi ne vit plus dans le bandeau (19/09) : il prend la
 * tête de la colonne de droite, en position fixe, aligné sur la barre de mise
 * en forme du texte. Il y gagne la place d'être **vu** — c'est l'état le plus
 * important de l'éditeur, celui qui décide si ce qu'on tape sera une
 * proposition ou une modification directe, et une case à cocher perdue entre
 * deux compteurs ne le disait pas. Construit ici, posé dans la colonne par
 * l'appelant.
 */
export function creerInterrupteurSuivi() {
  const trackToggleLabel = document.createElement('label')
  trackToggleLabel.className = 'track-toggle'
  const trackToggle = document.createElement('input')
  trackToggle.type = 'checkbox'
  trackToggle.checked = true
  // « Suivi » reste, « des modifications » s'efface quand la barre manque de
  // place (style.css, requête de conteneur) : la pastille ne doit pas faire
  // passer le reste de la barre à la ligne quand des changements apparaissent.
  const reste = document.createElement('span')
  reste.className = 'suivi-reste'
  reste.textContent = ' des modifications'
  // Un seul bloc de texte : l'étiquette est une boîte flex dont l'espace
  // (`gap`) ne doit tomber qu'entre la case et ses mots.
  const mots = document.createElement('span')
  mots.append(document.createTextNode('Suivi'), reste)
  trackToggleLabel.append(trackToggle, mots)
  return { trackToggleLabel, trackToggle }
}

/**
 * Le premier groupe de la zone droite — travailler le texte : les compteurs
 * de relecture (03/10/2026 ; icônes crayon et bulle depuis le 21/10/2026 ;
 * un clic mène au suivant) et le compteur de mots. Le marqueur « !! » et son compteur ont été
 * retirés le 21/10/2026. Pas de compteur
 * de modifications pour qui ne peut ni les relire ni en proposer.
 *
 * @param {object} options
 * @param {boolean} options.avecModifications  la personne propose ou relit des modifications
 */
export function monterCompteursBandeau({ avecModifications }) {
  const groupeTexte = document.createElement('div')
  groupeTexte.className = 'banniere-groupe'

  const modifsCount = document.createElement('span')
  modifsCount.className = 'compteur-relecture compteur-modifs'
  if (avecModifications) groupeTexte.appendChild(modifsCount)

  const commentsCount = document.createElement('span')
  commentsCount.className = 'compteur-relecture compteur-commentaires'
  groupeTexte.appendChild(commentsCount)

  const wordCount = document.createElement('span')
  wordCount.className = 'word-count'
  groupeTexte.appendChild(wordCount)

  return { groupeTexte, modifsCount, commentsCount, wordCount }
}

/** L'historique ferme la rangée, seul dans son groupe (19/09/2026) : il ne
 * touche pas au document, il le regarde — c'est le seul geste de la zone
 * droite qui ne change rien. L'aide n'est plus dans le bandeau (10/10/2026) :
 * elle est en tête du bouton flottant « Aide / avis » (contact.js), et dans le
 * menu ⋯ sur téléphone (iphone.js). */
export function monterGroupeHistorique(docId) {
  const groupeHistorique = document.createElement('div')
  groupeHistorique.className = 'banniere-groupe'
  const historyLink = document.createElement('a')
  historyLink.href = `#/doc/${docId}/versions`
  historyLink.className = 'btn-preset history-link'
  historyLink.textContent = 'Versions'
  groupeHistorique.append(historyLink)
  return groupeHistorique
}

/**
 * L'état de l'enregistrement (17/09/2026 ; un mot à côté du titre depuis le
 * 21/10/2026, comme dans la vue V1 : « Enregistré », « Enregistrement… »).
 * Le voyant d'état de la connexion (17/09/2026) : un voyant, plus une phrase.
 * Le texte complet occupait 290 px fixes dans le bandeau — la largeur du plus
 * long des messages, réservée en permanence pour un état qui est « à jour »
 * 99 % du temps. Le détail passe en infobulle : il reste disponible quand on
 * en a besoin, c'est-à-dire quand le voyant n'est pas vert.
 *
 * Créé tout de suite (il tient sa place dans le bandeau) ; `lier(provider)`
 * le branche une fois le fournisseur construit.
 */
export function creerVoyantConnexion() {
  const status = document.createElement('span')
  status.className = 'connection-status'
  status.setAttribute('role', 'status')

  // "à jour" / "enregistrement…" / "modifications non envoyées" rather than
  // just connecté/reconnexion — see provider.js's saving/hasPendingLocalChanges
  // bookkeeping (correctif 4.2.3, rapport de fiabilité du 12/09/2026).
  function lier(provider) {
    function renderConnectionStatus() {
      let etat = 'ok'
      let texte = 'À jour'
      let court = 'Enregistré'
      if (!provider.connected) {
        if (provider.hasPendingLocalChanges) {
          etat = 'alerte'
          texte = 'Hors connexion — modifications non envoyées'
          court = 'Non enregistré'
        } else if (provider.likelyRejected) {
          etat = 'alerte'
          texte = 'Connexion refusée (accès retiré ?)'
          court = 'Connexion refusée'
        } else {
          etat = 'attente'
          texte = 'Reconnexion…'
          court = 'Reconnexion…'
        }
      } else if (provider.saving) {
        etat = 'attente'
        texte = 'Enregistrement…'
        court = 'Enregistrement…'
      }
      status.textContent = court
      status.classList.toggle('etat-ok', etat === 'ok')
      status.classList.toggle('etat-attente', etat === 'attente')
      status.classList.toggle('etat-alerte', etat === 'alerte')
      status.title = texte
      // Le voyant seul ne dirait rien à un lecteur d'écran.
      status.setAttribute('aria-label', texte)
    }
    provider.addEventListener('status', renderConnectionStatus)
    renderConnectionStatus()
  }

  return { el: status, lier }
}
