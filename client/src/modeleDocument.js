// La mise en page d'un document, dans le menu Exporter (01/10/2026) : un
// `select` des modèles, une ligne d'état, et deux liens discrets —
// « Personnaliser ce document… » et « Revenir au modèle ». Voir
// claude/etude-modeles-mise-en-page.md §0 pour les décisions.
//
// Le modèle est une **propriété du document** : le choisir ici l'enregistre
// pour tous ses collaborateurs. Changer de modèle abandonne les réglages
// propres du document (ils ont été faits pour l'ancien) ; s'il en a, la
// personne le lit et choisit — changer, garder ses réglages, ou renoncer.
//
// On ne modifie jamais un modèle d'ici : changer sans le voir tous les
// documents qui l'utilisent est le piège de Word. Les modèles se règlent
// dans « Gérer mes modèles ».
//
// Les dépendances se donnent à l'appel plutôt qu'elles ne s'importent
// (`ouvrirPersonnaliser`) : le panneau complet est lourd, et ce module se
// teste sans lui.

import { chargerModeles, choisirModele, loadDocStyle, resetDocStyle } from './styleConfig.js'
import { libelleFormat } from '../../shared/modeles.js'

const reglages = (n) => `${n} réglage${n > 1 ? 's' : ''} propre${n > 1 ? 's' : ''}`

function bouton(texte, classe = 'menu-lien') {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = classe
  b.textContent = texte
  return b
}

/**
 * @param {object} options
 * @param {string} options.docId
 * @param {(docId: string, opts: { onEnregistre: () => void }) => void} options.ouvrirPersonnaliser
 * @param {(style: object) => void} [options.surChangement]  appelé quand la mise en page effective change
 * @returns {{ el: HTMLElement, charger: () => Promise<void>, fermerLeMenu?: () => void }}
 */
export function monterModeleDocument({ docId, ouvrirPersonnaliser, surChangement }) {
  const el = document.createElement('div')
  el.className = 'modele-doc'

  const entete = document.createElement('span')
  entete.className = 'menu-flottant-entete'
  entete.textContent = 'Mise en page du document'

  const select = document.createElement('select')
  select.className = 'menu-flottant-choix'
  select.setAttribute('aria-label', 'Modèle de mise en page')
  // Comme le choix de variante, dans le même menu : un clic sur la liste ne
  // doit pas refermer le menu.
  select.onclick = (e) => e.stopPropagation()

  const etat = document.createElement('span')
  etat.className = 'menu-flottant-aide'
  etat.setAttribute('role', 'status')

  const confirmation = document.createElement('div')
  confirmation.className = 'modele-doc-confirmation'
  confirmation.hidden = true
  const texteConfirmation = document.createElement('span')
  texteConfirmation.className = 'menu-flottant-aide'
  const changer = bouton('Changer de modèle')
  const garder = bouton('Garder mes réglages')
  const annuler = bouton('Annuler')
  confirmation.append(texteConfirmation, changer, garder, annuler)

  const personnaliser = bouton('Personnaliser ce document…')
  const revenir = bouton('Revenir au modèle')
  revenir.hidden = true

  el.append(entete, select, etat, confirmation, personnaliser, revenir)

  /** Ce qu'on sait du document : le dernier état renvoyé par le serveur. */
  let courant = { modele: null, ecarts: 0, propre: false }
  let modeles = null // null : la liste n'a pas pu être lue
  let visé = null // le modèle demandé, en attente de confirmation

  function afficher() {
    select.innerHTML = ''
    const id = courant.modele ? courant.modele.id : ''
    const vus = new Set()
    for (const m of modeles || []) {
      const o = document.createElement('option')
      o.value = m.id
      o.textContent = `${m.nom} — ${libelleFormat(m.style && m.style.page)}`
      if (m.description) o.title = m.description
      select.appendChild(o)
      vus.add(m.id)
    }
    // Le modèle d'un collaborateur n'est pas dans ma liste, mais c'est celui
    // du document : il doit s'y lire, sinon le select afficherait un autre
    // modèle et un changement involontaire suivrait.
    if (courant.modele && !vus.has(id)) {
      const o = document.createElement('option')
      o.value = id
      o.textContent = `${courant.modele.nom} (modèle d'un collaborateur)`
      select.appendChild(o)
    }
    select.value = id
    select.disabled = modeles === null
    etat.textContent =
      modeles === null
        ? "La liste des modèles n'a pas pu être chargée."
        : courant.ecarts > 0
          ? `${reglages(courant.ecarts)} à ce document.`
          : 'Ce document suit son modèle.'
    revenir.hidden = !courant.propre
    confirmation.hidden = true
    visé = null
  }

  async function appliquer(modeleId, garderEcarts) {
    select.disabled = true
    try {
      const r = await choisirModele(docId, modeleId, { garderEcarts })
      courant = { modele: r.modele, ecarts: r.ecarts, propre: r.propre }
      afficher()
      if (surChangement) surChangement(r.style)
    } catch {
      afficher()
      etat.textContent = 'Échec du changement de modèle — réessayez.'
    }
  }

  select.onchange = () => {
    const id = select.value
    if (!courant.modele || id === courant.modele.id) return
    if (courant.ecarts > 0) {
      visé = id
      texteConfirmation.textContent = `${reglages(courant.ecarts)} à ce document : ils seront abandonnés.`
      confirmation.hidden = false
      return
    }
    appliquer(id, false)
  }
  changer.onclick = () => visé && appliquer(visé, false)
  garder.onclick = () => visé && appliquer(visé, true)
  annuler.onclick = () => afficher()

  personnaliser.onclick = () => ouvrirPersonnaliser(docId, { onEnregistre: () => charger() })

  revenir.onclick = async () => {
    revenir.disabled = true
    try {
      const r = await resetDocStyle(docId)
      courant = { modele: r.modele, ecarts: r.ecarts, propre: r.propre }
      afficher()
      if (surChangement) surChangement(r.style)
    } catch {
      etat.textContent = 'Échec — réessayez.'
    } finally {
      revenir.disabled = false
    }
  }

  /** À rappeler à chaque ouverture du menu : un collaborateur a pu changer
   * le modèle depuis, et c'est ce qui est enregistré maintenant que
   * l'export doit refléter. */
  async function charger() {
    const [liste, doc] = await Promise.all([chargerModeles().catch(() => null), loadDocStyle(docId)])
    modeles = liste ? liste.modeles : null
    courant = { modele: doc.modele || null, ecarts: doc.ecarts || 0, propre: !!doc.propre }
    afficher()
  }

  return { el, charger }
}
