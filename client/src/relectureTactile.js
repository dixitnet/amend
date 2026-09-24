// Relire et commenter au doigt (20/09/2026, voir claude/conception-mobile.md).
//
// Deux renversements, repris de ce que font les traitements de texte
// mobiles et de ce que le petit écran impose :
//
//  - **La marge n'existe plus, le texte convoque la carte.** Sur grand
//    écran les cartes sont posées en permanence dans la marge et le texte y
//    renvoie ; ici le texte est permanent, et la carte est transitoire —
//    on touche un passage commenté, la feuille monte.
//  - **La relecture devient un parcours, pas une liste.** Une liste de
//    douze modifications n'a pas sa place sur 390 px : on avance de l'une à
//    l'autre, on accepte ou on rejette celle qu'on a sous les yeux, et la
//    suivante arrive. C'est exactement le geste installé côté bureau le
//    20/09 — valider fait descendre.
//
// Ce fichier ne réimplémente rien : les fils de commentaires
// (`reponsesDe`, `ajouterReponse`, `modifierTexte`, `supprimerFil`) et les
// modifications (`listChanges`, `acceptChange`, `rejectChange`) viennent du
// modèle déjà écrit. Seule l'enveloppe change.

import { defilerVers } from './defilement.js'
import { TextSelection } from 'prosemirror-state'
import { ouvrirFeuille, petitEcran } from './feuille.js'
import {
  ajouterReponse,
  modifierTexte,
  peutModifier,
  reponsesDe,
  resolveCommentRange,
  supprimerFil,
} from './comments.js'
import { listChanges, acceptChange, rejectChange } from './trackChanges.js'

function tempsRelatif(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

/** Amène une position au milieu de la zone d'édition — au-dessus de la
 * feuille, donc : on doit voir le passage dont on parle. */
function centrer(view, pos, fraction = 0.3) {
  defilerVers(view, pos, { fraction })
}

// --------------------------------------------------- les commentaires

/** Un message du fil, avec sa correction — même convention que dans la
 * marge : seul l'auteur se voit proposer « Modifier ». */
function messageDOM(commentsMap, ydoc, user, commentaire, id, racine, rafraichir) {
  const bloc = document.createElement('div')
  bloc.className = racine ? 'feuille-message' : 'feuille-message feuille-reponse'
  bloc.style.setProperty('--user-color', commentaire.color)

  const meta = document.createElement('div')
  meta.className = 'feuille-meta'
  const qui = document.createElement('strong')
  qui.textContent = commentaire.author
  meta.append(qui, document.createTextNode(` · ${tempsRelatif(commentaire.createdAt)}`))
  if (commentaire.editedAt) meta.append(document.createTextNode(' · modifié'))

  const texte = document.createElement('div')
  texte.className = 'feuille-texte'
  texte.textContent = commentaire.text

  const actions = document.createElement('div')
  actions.className = 'feuille-actions'
  if (peutModifier(commentaire, user)) {
    const modifier = document.createElement('button')
    modifier.type = 'button'
    modifier.textContent = 'Modifier'
    modifier.onclick = () => {
      const zone = document.createElement('textarea')
      zone.className = 'feuille-edition'
      zone.value = commentaire.text
      zone.rows = 3
      const valider = document.createElement('button')
      valider.type = 'button'
      valider.className = 'btn-accept'
      valider.textContent = 'Enregistrer'
      valider.onclick = () => {
        modifierTexte(commentsMap, id, zone.value)
        rafraichir()
      }
      const annuler = document.createElement('button')
      annuler.type = 'button'
      annuler.textContent = 'Annuler'
      annuler.onclick = rafraichir
      bloc.textContent = ''
      const barre = document.createElement('div')
      barre.className = 'feuille-actions'
      barre.append(valider, annuler)
      bloc.append(zone, barre)
      zone.focus()
    }
    actions.appendChild(modifier)
  }
  if (racine) {
    const resoudre = document.createElement('button')
    resoudre.type = 'button'
    resoudre.className = 'btn-accept'
    resoudre.textContent = 'Résoudre'
    resoudre.onclick = () => supprimerFil(ydoc, commentsMap, id)
    actions.appendChild(resoudre)
  } else if (peutModifier(commentaire, user)) {
    const supprimer = document.createElement('button')
    supprimer.type = 'button'
    supprimer.textContent = 'Supprimer'
    supprimer.onclick = () => supprimerFil(ydoc, commentsMap, id)
    actions.appendChild(supprimer)
  }

  bloc.append(meta, texte)
  if (actions.childElementCount) bloc.appendChild(actions)
  return bloc
}

/** Ouvre le fil d'un commentaire dans une feuille. Non modale : on doit
 * continuer de voir le passage commenté au-dessus. */
export function ouvrirFilCommentaire(view, ydoc, commentsMap, user, id) {
  const commentaire = commentsMap.get(id)
  if (!commentaire) return null

  const range = resolveCommentRange(view.state, ydoc, commentaire)
  if (range) centrer(view, range.from, 0.25)

  const feuille = ouvrirFeuille('Commentaire', {
    hauteur: 0.45,
    surFermeture() {
      commentsMap.unobserve(surChangement)
    },
  })

  function remplir() {
    const courant = commentsMap.get(id)
    feuille.corps.textContent = ''
    if (!courant) {
      // Le fil a été résolu, ici ou ailleurs : la feuille n'a plus d'objet.
      feuille.fermer()
      return
    }
    feuille.corps.appendChild(
      messageDOM(commentsMap, ydoc, user, courant, id, true, remplir)
    )
    for (const r of reponsesDe(commentsMap, id)) {
      feuille.corps.appendChild(messageDOM(commentsMap, ydoc, user, r, r.id, false, remplir))
    }

    const forme = document.createElement('form')
    forme.className = 'feuille-repondre'
    const zone = document.createElement('textarea')
    zone.rows = 2
    zone.placeholder = 'Répondre…'
    const envoyer = document.createElement('button')
    envoyer.type = 'submit'
    envoyer.className = 'btn-accept'
    envoyer.textContent = 'Répondre'
    forme.append(zone, envoyer)
    forme.onsubmit = (e) => {
      e.preventDefault()
      if (!ajouterReponse(commentsMap, user, id, zone.value)) return
      zone.value = ''
    }
    feuille.corps.appendChild(forme)
  }

  // Redessiner à chaque changement du fil, mais **pas** pendant qu'on écrit
  // une réponse : le rendu effacerait ce qui est tapé (même garde que dans
  // la marge, où le défaut a été trouvé en le provoquant).
  const surChangement = () => {
    const brouillon = feuille.corps.querySelector('.feuille-repondre textarea')
    if (brouillon && brouillon.value.trim() !== '') return
    if (feuille.corps.querySelector('.feuille-edition')) return
    remplir()
  }
  commentsMap.observe(surChangement)
  remplir()
  return feuille
}

// --------------------------------------------------- la relecture

/**
 * La barre de relecture : « ‹ 3 / 12 › » plus Accepter et Rejeter. Elle
 * remplace la liste des modifications, qui n'a pas sa place sur un écran de
 * poche. Renvoie `{ el, detruire }`.
 */
export function monterBarreRelecture(getView, { canReview = true } = {}) {
  const el = document.createElement('div')
  el.className = 'barre-relecture'
  el.hidden = true

  const precedent = document.createElement('button')
  precedent.type = 'button'
  precedent.className = 'btn-tool'
  precedent.textContent = '‹'
  precedent.title = 'Modification précédente'
  const position = document.createElement('span')
  position.className = 'barre-relecture-position'
  const suivant = document.createElement('button')
  suivant.type = 'button'
  suivant.className = 'btn-tool'
  suivant.textContent = '›'
  suivant.title = 'Modification suivante'
  const accepter = document.createElement('button')
  accepter.type = 'button'
  accepter.className = 'btn-accept'
  accepter.textContent = 'Accepter'
  const rejeter = document.createElement('button')
  rejeter.type = 'button'
  rejeter.className = 'btn-reject'
  rejeter.textContent = 'Rejeter'

  el.append(precedent, position, suivant)
  if (canReview) el.append(accepter, rejeter)

  /** L'indice de la modification courante : celle qui contient le curseur,
   * ou la première qui le suit. Jamais un indice mémorisé — le document
   * bouge sous nos pieds, y compris par la main de quelqu'un d'autre. */
  function etat() {
    const view = getView()
    if (!view) return { liste: [], index: -1 }
    const liste = listChanges(view.state.doc)
    const pos = view.state.selection.from
    let index = liste.findIndex((c) => c.from <= pos && pos <= c.to)
    if (index === -1) index = liste.findIndex((c) => c.from >= pos)
    if (index === -1 && liste.length) index = liste.length - 1
    return { liste, index }
  }

  function allerA(index, liste) {
    const view = getView()
    if (!view || !liste.length) return
    const cible = liste[Math.max(0, Math.min(index, liste.length - 1))]
    const to = Math.min(cible.to, view.state.doc.content.size)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cible.from, to)))
    centrer(view, cible.from, 0.35)
    rendre()
  }

  precedent.onclick = () => {
    const { liste, index } = etat()
    allerA(index <= 0 ? liste.length - 1 : index - 1, liste)
  }
  suivant.onclick = () => {
    const { liste, index } = etat()
    allerA(index >= liste.length - 1 ? 0 : index + 1, liste)
  }
  accepter.onclick = () => traiter(acceptChange)
  rejeter.onclick = () => traiter(rejectChange)

  /** Valider **fait descendre** : c'est le geste de la relecture, et c'est
   * la même règle que dans le panneau du bureau. Arrivé au bout, on ne
   * remonte pas au début : ce serait une surprise, pas un service. */
  function traiter(action) {
    const view = getView()
    const { liste, index } = etat()
    if (!view || index < 0 || !liste[index]) return
    const depart = liste[index].from
    action(view, liste[index])
    const apres = listChanges(view.state.doc)
    const suivante = apres.find((c) => c.from >= depart)
    if (suivante) {
      const to = Math.min(suivante.to, view.state.doc.content.size)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, suivante.from, to)))
      centrer(view, suivante.from, 0.35)
    }
    rendre()
  }

  function rendre() {
    const { liste, index } = etat()
    el.hidden = liste.length === 0
    position.textContent = liste.length ? `${index + 1} / ${liste.length}` : '0'
    accepter.disabled = rejeter.disabled = index < 0
  }

  return { el, rendre, detruire() { el.remove() } }
}

/**
 * Le bouton « Commenter » qui suit la sélection. Sur téléphone, sélectionner
 * du texte fait apparaître les poignées natives : le bouton se pose
 * **au-dessus** de la sélection, jamais en dessous, où il tomberait sous le
 * pouce et sous la barre de suggestions du clavier.
 */
export function monterBoutonCommenter(conteneur, getView, surClic) {
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.className = 'bouton-commenter'
  bouton.textContent = 'Commenter'
  bouton.hidden = true
  bouton.onclick = (e) => {
    e.preventDefault()
    surClic()
  }
  conteneur.appendChild(bouton)

  function placer() {
    const view = getView()
    if (!view || !petitEcran()) {
      bouton.hidden = true
      return
    }
    const { from, to, empty } = view.state.selection
    if (empty || to <= from) {
      bouton.hidden = true
      return
    }
    // Visible dès qu'il y a une sélection ; le placement, lui, est au mieux.
    // Séparer les deux compte : une position introuvable — le passage vient
    // d'être redessiné, ou l'on est dans un environnement sans mise en page
    // — ne doit pas retirer à quelqu'un le moyen de commenter ce qu'il vient
    // de sélectionner.
    bouton.hidden = false
    try {
      const debut = view.coordsAtPos(from)
      const rect = conteneur.getBoundingClientRect()
      bouton.style.top = `${debut.top - rect.top - 46}px`
      bouton.style.left = `${Math.max(8, debut.left - rect.left)}px`
    } catch {
      /* on garde la dernière position connue plutôt que de disparaître */
    }
  }

  return { bouton, placer }
}
