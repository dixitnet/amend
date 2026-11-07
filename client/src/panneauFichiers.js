// Le volet « Fichiers » de l'éditeur (07/11/2026, docs/journal-decisions.md
// § 27) : passer d'un document à l'autre sans revenir à « Mes documents ».
//
// Il montre le rangement de la personne tel que l'accueil le tient (mêmes
// routes, mêmes calculs — rangementDocs.js) : un filtre, les favoris, puis
// l'arbre des dossiers. Il ne gère rien : renommer, déplacer, corbeille et
// « Quitter » restent sur l'accueil. Seul geste ajouté : créer un document
// directement dans un dossier.
//
// Chaque document est un vrai lien (`#/doc/<id>`) : un clic ouvre le document
// dans l'onglet, Cmd/Ctrl-clic ou le clic du milieu dans un nouvel onglet du
// navigateur, sans code pour cela. Un clic simple laisse un mot dans le
// stockage de session pour que le document suivant rouvre ce volet sur
// « Fichiers » (sinon c'est le plan), voir `suiteFichiers`.
//
// Rien n'est chargé tant que l'onglet n'est pas montré : l'ouverture d'un
// document n'attend pas la liste. Elle est rechargée à chaque retour sur
// l'onglet. Les dossiers dépliés sont retenus par appareil.

import { icone } from './interface/icones.js'
import { arbreFichiers, construireVue, dossiersVers } from './rangementDocs.js'

const CLE_DEPLIES = 'amend.fichiers.deplies'
const CLE_SUITE = 'amend.volet.gauche.suite'
const CLE_TITRE = 'amend.titre.a.saisir'

function stockage(type) {
  try {
    return globalThis[type] || null
  } catch {
    return null
  }
}
function lire(type, cle) {
  try {
    const s = stockage(type)
    return s ? s.getItem(cle) : null
  } catch {
    return null
  }
}
function ecrire(type, cle, valeur) {
  try {
    const s = stockage(type)
    if (!s) return
    if (valeur === null) s.removeItem(cle)
    else s.setItem(cle, valeur)
  } catch {
    /* stockage indisponible : on perd seulement le confort */
  }
}

/** Lu une fois, au montage de l'éditeur : le document qu'on ouvre a-t-il été
 * choisi dans le volet « Fichiers » ? Le mot est effacé aussitôt — il ne vaut
 * que pour ce changement de document. */
export function suiteFichiers() {
  const oui = lire('sessionStorage', CLE_SUITE) === 'fichiers'
  ecrire('sessionStorage', CLE_SUITE, null)
  return oui
}

/** Lu une fois, au montage de l'éditeur : ce document vient-il d'être créé
 * depuis le volet (le curseur va alors dans le titre) ? */
export function titreASaisir(docId) {
  const oui = lire('sessionStorage', CLE_TITRE) === docId
  if (oui) ecrire('sessionStorage', CLE_TITRE, null)
  return oui
}

function el(nom, classe, texte) {
  const e = document.createElement(nom)
  if (classe) e.className = classe
  if (texte !== undefined) e.textContent = texte
  return e
}

async function appeler(chemin, methode = 'GET', corps) {
  const options = { method: methode }
  if (corps !== undefined) {
    options.headers = { 'content-type': 'application/json' }
    options.body = JSON.stringify(corps)
  }
  try {
    const res = await fetch(chemin, options)
    let json = null
    try {
      json = await res.json()
    } catch {
      /* pas de corps */
    }
    return { ok: !!res.ok, status: res.status, json: json || {} }
  } catch {
    return { ok: false, status: 0, json: { error: 'le serveur ne répond pas' } }
  }
}

/**
 * @param {HTMLElement} panneau   le panneau du volet (vidé et rempli ici)
 * @param {object} o
 * @param {string} o.docId        le document ouvert
 * @param {() => boolean} [o.peutQuitter]  faux : on reste (modifications non envoyées)
 * @returns {{ afficher: () => Promise<void>, majTitre: (titre: string) => void }}
 */
export function monterPanneauFichiers(panneau, { docId, peutQuitter = () => true }) {
  panneau.classList.add('panneau-fichiers')
  // `titre` : celui que le bandeau montre, s'il a changé depuis le montage ;
  // il l'emporte sur la liste du serveur, qui peut arriver après la frappe.
  const etat = { docs: [], dossiers: [], charge: false, filtre: '', titre: null }
  let deplies = new Set()
  try {
    const lu = JSON.parse(lire('localStorage', CLE_DEPLIES) || '[]')
    if (Array.isArray(lu)) deplies = new Set(lu.filter((x) => typeof x === 'string'))
  } catch {
    /* valeur abîmée : tout replié */
  }
  const retenirDeplies = () => ecrire('localStorage', CLE_DEPLIES, JSON.stringify([...deplies]))

  // La tête reste en place d'un affichage à l'autre (le champ garde le focus).
  const tete = el('div', 'fichiers-tete')
  const champ = el('label', 'fichiers-filtre-champ')
  const filtre = el('input', 'fichiers-filtre')
  filtre.type = 'search'
  filtre.placeholder = 'Filtrer'
  filtre.autocomplete = 'off'
  filtre.name = 'filtre-fichiers'
  filtre.setAttribute('aria-label', 'Filtrer mes documents par leur titre')
  champ.append(icone('recherche', 14), filtre)
  const nouveauRacine = boutonNouveau(null, 'Nouveau document (hors dossier)')
  tete.append(champ, nouveauRacine)
  const message = el('p', 'fichiers-message')
  message.setAttribute('role', 'status')
  message.hidden = true
  const zone = el('div', 'fichiers-zone')
  panneau.replaceChildren(tete, message, zone)

  function dire(texte) {
    message.textContent = texte || ''
    message.hidden = !texte
  }

  filtre.addEventListener('input', () => {
    etat.filtre = filtre.value
    dessiner()
  })
  filtre.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const premier = zone.querySelector('a.fichiers-doc')
      if (premier) premier.click()
    } else if (e.key === 'Escape' && filtre.value) {
      // Vider le champ, sans fermer le tiroir (format M) du même coup.
      e.preventDefault()
      e.stopPropagation()
      filtre.value = ''
      etat.filtre = ''
      dessiner()
    }
  })

  // Un clic simple sur un document : le suivant rouvrira « Fichiers ». Pas
  // pour un clic qui ouvre un autre onglet, ni pour un clic annulé (le
  // garde-fou des modifications non envoyées, posé par l'éditeur).
  zone.addEventListener('click', (e) => {
    const lien = e.target instanceof Element ? e.target.closest('a.fichiers-doc') : null
    if (!lien || e.defaultPrevented) return
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    ecrire('sessionStorage', CLE_SUITE, 'fichiers')
  })

  function boutonNouveau(dossier, titre) {
    const b = el('button', 'fichiers-nouveau')
    b.type = 'button'
    b.title = titre
    b.setAttribute('aria-label', titre)
    b.append(icone('ajouter', 14))
    b.addEventListener('click', async () => {
      if (!peutQuitter()) return
      b.disabled = true
      const res = await appeler('/api/docs', 'POST', dossier ? { title: '', dossier } : { title: '' })
      b.disabled = false
      if (!res.ok || !res.json.id) {
        // Dossier supprimé ailleurs entre-temps : on recharge, puis on le dit.
        if (res.status === 404) await afficher()
        dire(res.json.error || 'Le document n’a pas pu être créé.')
        return
      }
      ecrire('sessionStorage', CLE_SUITE, 'fichiers')
      ecrire('sessionStorage', CLE_TITRE, res.json.id)
      location.hash = `#/doc/${res.json.id}`
    })
    return b
  }

  function ligneDocument(doc, emplacement) {
    const li = el('li', 'fichiers-ligne')
    const titre = doc.title || 'Sans titre'
    let lien
    if (doc.id === docId) {
      lien = el('span', 'fichiers-doc courant', titre)
      lien.setAttribute('aria-current', 'page')
    } else {
      lien = el('a', 'fichiers-doc', titre)
      lien.href = `#/doc/${doc.id}`
    }
    lien.title = emplacement ? `${titre} — ${emplacement}` : titre
    li.appendChild(lien)
    if (emplacement) li.appendChild(el('span', 'fichiers-emplacement', emplacement))
    return li
  }

  function liste(docs) {
    const ul = el('ul', 'fichiers-liste')
    for (const d of docs) ul.appendChild(ligneDocument(d))
    return ul
  }

  function ligneDossier(noeud) {
    const { dossier } = noeud
    const li = el('li', 'fichiers-noeud')
    const ouvert = deplies.has(dossier.id)
    const rang = el('div', 'fichiers-ligne fichiers-ligne-dossier')
    const bascule = el('button', 'fichiers-dossier')
    bascule.type = 'button'
    bascule.setAttribute('aria-expanded', String(ouvert))
    bascule.title = dossier.nom
    bascule.append(
      icone(ouvert ? 'descendre' : 'droite', 14),
      icone('dossier', 15),
      el('span', 'fichiers-dossier-nom', dossier.nom)
    )
    bascule.addEventListener('click', () => {
      if (deplies.has(dossier.id)) deplies.delete(dossier.id)
      else deplies.add(dossier.id)
      retenirDeplies()
      dessiner()
    })
    rang.append(bascule, boutonNouveau(dossier.id, `Nouveau document dans « ${dossier.nom} »`))
    li.appendChild(rang)
    if (ouvert) {
      const ul = el('ul', 'fichiers-liste fichiers-sous-liste')
      for (const n of noeud.dossiers) ul.appendChild(ligneDossier(n))
      for (const d of noeud.documents) ul.appendChild(ligneDocument(d))
      if (!noeud.dossiers.length && !noeud.documents.length) ul.appendChild(el('li', 'fichiers-vide', 'Vide'))
      li.appendChild(ul)
    }
    return li
  }

  function dessiner() {
    zone.replaceChildren()
    if (!etat.charge) {
      zone.appendChild(el('p', 'fichiers-vide', 'Chargement…'))
      return
    }
    if (etat.filtre.trim()) {
      const { documents } = construireVue({
        docs: etat.docs,
        dossiers: etat.dossiers,
        recherche: etat.filtre,
        tri: 'titre',
      })
      if (!documents.length) {
        zone.appendChild(el('p', 'fichiers-vide', 'Aucun document ne correspond.'))
        return
      }
      const ul = el('ul', 'fichiers-liste fichiers-resultats')
      for (const { doc, emplacement } of documents) ul.appendChild(ligneDocument(doc, emplacement))
      zone.appendChild(ul)
      return
    }
    const arbre = arbreFichiers({ docs: etat.docs, dossiers: etat.dossiers })
    if (arbre.favoris.length) {
      const section = el('section', 'fichiers-favoris')
      const titre = el('h4', 'fichiers-section')
      titre.append(icone('etoile', 13), 'Favoris')
      section.append(titre, liste(arbre.favoris))
      zone.appendChild(section)
    }
    const ul = el('ul', 'fichiers-liste fichiers-arbre')
    ul.setAttribute('aria-label', 'Mes documents')
    for (const n of arbre.dossiers) ul.appendChild(ligneDossier(n))
    for (const d of arbre.documents) ul.appendChild(ligneDocument(d))
    if (!arbre.dossiers.length && !arbre.documents.length) zone.appendChild(el('p', 'fichiers-vide', 'Aucun document.'))
    else zone.appendChild(ul)
  }

  /** Charge (ou recharge) la liste, déplie le chemin du document ouvert et
   * l'amène dans la vue. Appelé chaque fois que l'onglet est montré. */
  async function afficher() {
    dessiner()
    const [docs, rangement] = await Promise.all([appeler('/api/docs'), appeler('/api/rangement')])
    if (!docs.ok) {
      dire(docs.json.error || 'La liste des documents n’a pas pu être chargée.')
      return
    }
    dire('')
    etat.docs = Array.isArray(docs.json.docs) ? docs.json.docs : []
    etat.dossiers = rangement.ok && Array.isArray(rangement.json.dossiers) ? rangement.json.dossiers : []
    etat.charge = true
    if (etat.titre !== null) {
      const ouvert = etat.docs.find((d) => d.id === docId)
      if (ouvert) ouvert.title = etat.titre
    }
    const avant = deplies.size
    for (const id of dossiersVers(etat.docs, etat.dossiers, docId)) deplies.add(id)
    if (deplies.size !== avant) retenirDeplies()
    dessiner()
    const courant = zone.querySelector('.fichiers-doc.courant')
    if (courant && typeof courant.scrollIntoView === 'function') courant.scrollIntoView({ block: 'nearest' })
  }

  /** Le titre du document ouvert, suivi en direct (il est saisi dans le bandeau). */
  function majTitre(titre) {
    etat.titre = titre
    const doc = etat.docs.find((d) => d.id === docId)
    if (doc) doc.title = titre
    for (const span of zone.querySelectorAll('.fichiers-doc.courant')) {
      span.textContent = titre || 'Sans titre'
      span.title = titre || 'Sans titre'
    }
  }

  return { afficher, majTitre }
}
