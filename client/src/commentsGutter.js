// Commentaires ancrés dans une gouttière, à droite de la colonne de texte
// (15/09/2026 — voir claude/conception-marge-annotations.md). Chaque
// commentaire est une carte posée à la hauteur de son passage, sur le fond
// de l'éditeur : une annotation, pas une colonne séparée.
//
// Deux choses structurent ce fichier :
//
//  - La gouttière vit **dans le conteneur qui défile**, et les cartes y sont
//    en position absolue. Conséquence : le défilement ne change rien à leur
//    position relative, donc on ne recalcule jamais rien au défilement. Ce
//    projet s'est déjà fait avoir deux fois par des greffons qui
//    recalculaient tout à chaque frappe (rapports de charge n°1 et n°2) ;
//    ici le recalcul n'a lieu qu'au changement de document, de sélection,
//    de liste de commentaires ou de taille de fenêtre.
//  - On **lit toutes les positions, puis on écrit tous les styles**, jamais
//    en alternance : sans ça le navigateur recalcule sa mise en page à
//    chaque carte.
//
// Sous 1100 px de large la gouttière disparaît (style.css) et les
// commentaires retournent dans le panneau latéral, qui reste monté.

import { Plugin } from 'prosemirror-state'
import {
  resolveCommentRange,
  addComment,
  commentsPluginKey,
  ajouterReponse,
  estUneReponse,
  modifierTexte,
  peutModifier,
  reponsesDe,
  supprimerFil,
} from './comments.js'

const ECART_MINIMAL = 8 // px entre deux cartes empilées
const DELAI_RECALCUL_MS = 100


function tempsRelatif(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

export function mountCommentsGutter(gutter, ydoc, commentsMap, user) {
  let view = null
  let actif = null // id du commentaire déployé
  let timer = null
  const cartes = new Map() // id -> élément
  // Le point où l'on a cliqué dans le texte, et la carte que ça a activée :
  // sert à poser cette carte en face du curseur plutôt qu'en face du début
  // de son passage. Voir activerDepuisLeTexte.
  let ancrage = null

  function planifier() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      rendre()
    }, DELAI_RECALCUL_MS)
  }

  /** Commentaire contenant le curseur, s'il y en a un — c'est lui qui se
   * déploie tout seul, sans qu'on ait à cliquer. */
  function commentaireSousLeCurseur() {
    if (!view) return null
    const pos = view.state.selection.head
    let trouve = null
    commentsMap.forEach((c, id) => {
      if (estUneReponse(c)) return
      const range = resolveCommentRange(view.state, ydoc, c)
      if (range && pos >= range.from && pos <= range.to) trouve = id
    })
    return trouve
  }

  /** Une ligne de métadonnées : qui, quand, et si le texte a été repris.
   * « modifié » compte : un texte qui change sous les yeux des autres sans
   * rien dire est plus troublant qu'utile. */
  function meta(commentaire) {
    const el = document.createElement('div')
    el.className = 'carte-meta'
    const nom = document.createElement('strong')
    nom.textContent = commentaire.author
    el.append(nom, document.createTextNode(` · ${tempsRelatif(commentaire.createdAt)}`))
    if (commentaire.editedAt) {
      const repris = document.createElement('span')
      repris.className = 'carte-modifie'
      repris.textContent = ' · modifié'
      repris.title = `Repris ${tempsRelatif(commentaire.editedAt)}`
      el.appendChild(repris)
    }
    return el
  }

  /** Passe un bloc de texte en correction : une zone de saisie, Enregistrer
   * et Annuler. Échap annule aussi — on n'oblige personne à viser un bouton
   * dans une marge de 260 px. */
  function editer(bloc, commentaire, id, apres) {
    const zone = document.createElement('textarea')
    zone.className = 'carte-edition'
    zone.value = commentaire.text
    zone.rows = Math.min(8, Math.max(2, Math.ceil(commentaire.text.length / 34)))
    const actions = document.createElement('div')
    actions.className = 'carte-actions'
    const valider = document.createElement('button')
    valider.type = 'button'
    valider.className = 'btn-accept'
    valider.textContent = 'Enregistrer'
    const annuler = document.createElement('button')
    annuler.type = 'button'
    annuler.textContent = 'Annuler'
    actions.append(valider, annuler)

    const terminer = () => {
      bloc.dataset.edition = ''
      delete bloc.dataset.edition
      apres()
    }
    valider.onclick = (e) => {
      e.stopPropagation()
      modifierTexte(commentsMap, id, zone.value)
      terminer()
    }
    annuler.onclick = (e) => {
      e.stopPropagation()
      terminer()
    }
    zone.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        terminer()
      }
      // Ctrl/⌘+Entrée enregistre : le raccourci qu'on essaie d'instinct.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        modifierTexte(commentsMap, id, zone.value)
        terminer()
      }
    }
    bloc.textContent = ''
    bloc.append(zone, actions)
    bloc.dataset.edition = 'oui'
    zone.focus()
    zone.setSelectionRange(zone.value.length, zone.value.length)
  }

  /** Un message du fil — le commentaire lui-même, ou une réponse. Les deux
   * se corrigent de la même façon, d'où une seule fonction. */
  function messageDOM(commentaire, id, { racine }) {
    const bloc = document.createElement('div')
    bloc.className = racine ? 'carte-message' : 'carte-message carte-reponse'
    if (!racine) bloc.style.setProperty('--user-color', commentaire.color)

    const redessiner = () => {
      bloc.textContent = ''
      bloc.appendChild(meta(commentaire))
      const texte = document.createElement('div')
      texte.className = 'carte-texte'
      texte.textContent = commentaire.text
      bloc.appendChild(texte)

      const actions = document.createElement('div')
      actions.className = 'carte-actions'
      // Corriger n'est proposé qu'à l'auteur — convention d'interface, pas
      // serrure (voir la note en tête de comments.js).
      if (peutModifier(commentaire, user)) {
        const modifier = document.createElement('button')
        modifier.type = 'button'
        modifier.textContent = 'Modifier'
        modifier.onclick = (e) => {
          e.stopPropagation()
          editer(bloc, commentaire, id, redessiner)
        }
        actions.appendChild(modifier)
      }
      if (racine) {
        const resoudre = document.createElement('button')
        resoudre.type = 'button'
        resoudre.className = 'btn-accept'
        resoudre.textContent = 'Résoudre'
        resoudre.onclick = (e) => {
          e.stopPropagation()
          // Le fil entier, réponses comprises.
          supprimerFil(ydoc, commentsMap, id)
        }
        actions.appendChild(resoudre)
      } else if (peutModifier(commentaire, user)) {
        const supprimer = document.createElement('button')
        supprimer.type = 'button'
        supprimer.textContent = 'Supprimer'
        supprimer.onclick = (e) => {
          e.stopPropagation()
          supprimerFil(ydoc, commentsMap, id)
        }
        actions.appendChild(supprimer)
      }
      if (actions.childElementCount) bloc.appendChild(actions)
    }
    redessiner()
    return bloc
  }

  /** Le champ de réponse — sur la carte active seulement. Six zones de
   * saisie empilées dans la marge seraient illisibles, et personne ne
   * répond à un commentaire qu'il n'est pas en train de lire. */
  function champReponse(id) {
    const forme = document.createElement('form')
    forme.className = 'carte-repondre'
    const zone = document.createElement('textarea')
    zone.rows = 1
    zone.placeholder = 'Répondre…'
    const envoyer = document.createElement('button')
    envoyer.type = 'submit'
    envoyer.textContent = 'Répondre'
    forme.append(zone, envoyer)
    forme.onsubmit = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!ajouterReponse(commentsMap, user, id, zone.value)) return
      zone.value = ''
      zone.rows = 1
    }
    zone.onkeydown = (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        forme.requestSubmit()
      }
    }
    // La zone grandit avec le texte : une réponse de trois lignes ne se
    // tape pas dans une fente d'une ligne.
    zone.oninput = () => {
      zone.rows = Math.min(6, Math.max(1, zone.value.split('\n').length))
    }
    forme.onclick = (e) => e.stopPropagation()
    return forme
  }

  function construireCarte(commentaire, id) {
    const carte = document.createElement('div')
    carte.className = 'carte-commentaire'
    carte.style.setProperty('--user-color', commentaire.color)
    carte.addEventListener('click', () => {
      actif = id
      // Venir de la carte, c'est demander à voir le passage : on reprend
      // l'ancrage par défaut, au début de celui-ci.
      ancrage = null
      const courant = commentsMap.get(id)
      const range = view && courant && resolveCommentRange(view.state, ydoc, courant)
      if (range) centrer(range.from)
      rendre()
    })
    remplirCarte(carte, commentaire, id)
    return carte
  }

  /** Redessine le contenu d'une carte : le message, ses réponses, et le
   * champ de réponse si elle est active.
   *
   * Deux précautions, sans lesquelles la carte se dérobe sous les doigts :
   * on ne redessine pas une carte dont un bloc est en cours de correction,
   * ni une carte dont la réponse est commencée — le rendu est déclenché à
   * chaque frappe dans le document, y compris par les autres participants. */
  function remplirCarte(carte, commentaire, id) {
    if (carte.querySelector('[data-edition]')) return
    const brouillon = carte.querySelector('.carte-repondre textarea')
    const enCours = brouillon && brouillon.value.trim() !== ''
    const reponses = reponsesDe(commentsMap, id)
    const signature = [
      commentaire.text,
      commentaire.editedAt || 0,
      carte.classList.contains('active'),
      reponses.map((r) => `${r.id}:${r.text}:${r.editedAt || 0}`).join('|'),
    ].join('~')
    if (carte.dataset.signature === signature) return
    if (enCours && carte.dataset.signature !== undefined) {
      // Une réponse est en train d'être écrite : on garde la carte telle
      // quelle plutôt que de faire disparaître ce qui est tapé. Elle se
      // remettra à jour dès que le champ sera vide.
      return
    }
    carte.dataset.signature = signature
    carte.textContent = ''
    carte.appendChild(messageDOM(commentaire, id, { racine: true }))
    if (reponses.length) {
      const fil = document.createElement('div')
      fil.className = 'carte-fil'
      for (const r of reponses) fil.appendChild(messageDOM(r, r.id, { racine: false }))
      carte.appendChild(fil)
    }
    if (carte.classList.contains('active')) carte.appendChild(champReponse(id))
  }

  /** Amène `pos` au milieu de la zone d'édition — la carte, ancrée à la
   * même hauteur, se retrouve en face. C'est le « met l'élément en face »
   * demandé, et il devient trivial une fois les cartes ancrées. */
  function centrer(pos) {
    if (!view) return
    const conteneur = view.dom.closest('.editor-container')
    if (!conteneur) return
    try {
      const coords = view.coordsAtPos(Math.min(pos, view.state.doc.content.size))
      const rect = conteneur.getBoundingClientRect()
      conteneur.scrollTop += coords.top - (rect.top + conteneur.clientHeight / 2)
    } catch {
      /* position momentanément hors rendu */
    }
  }

  function rendre() {
    if (!view || !gutter) return
    const sousCurseur = commentaireSousLeCurseur()
    if (sousCurseur) actif = sousCurseur
    // L'ancrage ne vaut que pour la carte qu'un clic a rendue active : dès
    // qu'une autre prend sa place, il tombe.
    if (ancrage && ancrage.id !== actif) ancrage = null

    // --- 1. Construire/rafraîchir les cartes, et calculer leur hauteur
    // naturelle. Phase de LECTURE : aucune écriture de style ici.
    const rectGouttiere = gutter.getBoundingClientRect()
    const items = []
    const vivants = new Set()
    commentsMap.forEach((commentaire, id) => {
      // Une réponse n'a pas de carte à elle : elle vit dans celle de son
      // parent.
      if (estUneReponse(commentaire)) return
      const range = resolveCommentRange(view.state, ydoc, commentaire)
      // Ancre non résoluble (document pas encore lié) ou passage vide : on
      // ne dessine pas — et surtout on ne supprime pas, c'est le rôle de
      // purgeOrphanComments, avec ses précautions.
      if (!range || range.to <= range.from) return
      vivants.add(id)
      let carte = cartes.get(id)
      if (!carte) {
        carte = construireCarte(commentaire, id)
        cartes.set(id, carte)
        gutter.appendChild(carte)
      }
      // L'état actif d'abord : le champ de réponse n'existe que sur la
      // carte active, donc remplirCarte doit le connaître avant de
      // redessiner.
      carte.classList.toggle('active', id === actif)
      remplirCarte(carte, commentaire, id)
      let y = 0
      try {
        const depuis = ancrage && ancrage.id === id && ancrage.pos >= range.from && ancrage.pos <= range.to
          ? ancrage.pos
          : range.from
        y = view.coordsAtPos(depuis).top - rectGouttiere.top
      } catch {
        return
      }
      items.push({ id, carte, naturel: y, hauteur: carte.offsetHeight })
    })

    for (const [id, carte] of cartes) {
      if (vivants.has(id)) continue
      carte.remove()
      cartes.delete(id)
      if (actif === id) actif = null
    }

    // --- 2. Empilement. La carte active garde sa hauteur exacte et pousse
    // les autres (comme Google Docs) ; sans carte active, simple cascade
    // vers le bas.
    items.sort((a, b) => a.naturel - b.naturel)
    const indexActif = items.findIndex((i) => i.id === actif)
    const positions = items.map((i) => i.naturel)
    if (indexActif > -1) {
      for (let i = indexActif - 1; i >= 0; i--) {
        positions[i] = Math.min(positions[i], positions[i + 1] - items[i].hauteur - ECART_MINIMAL)
      }
    }
    for (let i = Math.max(indexActif, 0) + 1; i < items.length; i++) {
      positions[i] = Math.max(positions[i], positions[i - 1] + items[i - 1].hauteur + ECART_MINIMAL)
    }

    // --- 3. Phase d'ÉCRITURE, en une fois.
    items.forEach((item, i) => {
      item.carte.style.top = `${Math.max(0, Math.round(positions[i]))}px`
    })
    // Repliée quand elle n'a rien à montrer : c'est ce qui garde la colonne
    // de texte centrée sur un document sans commentaire.
    gutter.classList.toggle('peuplee', items.length > 0 || !!gutter.querySelector('.composeur:not([hidden])'))
  }

  /** Clic dans le texte sur un passage commenté : la carte correspondante
   * devient active, **et vient se poser à la hauteur de l'endroit cliqué**
   * (17/09/2026).
   *
   * Une carte est normalement ancrée au **début** de son passage. Sur un
   * commentaire qui court sur dix lignes, cliquer à la fin du passage
   * laissait donc sa carte loin au-dessus, parfois hors de l'écran : on
   * activait quelque chose qu'on ne voyait pas. On retient donc le point
   * cliqué et on y ancre la carte tant qu'elle reste active — c'est en
   * face du curseur qu'on la cherche des yeux, pas en face du début d'un
   * passage qu'on a peut-être oublié.
   *
   * L'ancrage tombe dès qu'une autre carte devient active, ou dès qu'on
   * clique ailleurs dans le texte : il ne survit pas à ce qui l'a créé. */
  function activerDepuisLeTexte(pos) {
    let trouve = null
    commentsMap.forEach((c, id) => {
      const range = view && resolveCommentRange(view.state, ydoc, c)
      if (range && pos >= range.from && pos <= range.to) trouve = id
    })
    ancrage = trouve ? { id: trouve, pos } : null
    if (!trouve) return false
    actif = trouve
    rendre()
    return false // on ne bloque jamais le placement du curseur
  }

  return new Plugin({
    props: {
      handleClick(_view, pos) {
        return activerDepuisLeTexte(pos)
      },
    },
    view(editorView) {
      view = editorView
      const rafraichir = () => planifier()
      commentsMap.observe(rafraichir)
      window.addEventListener('resize', rafraichir)
      // Premier rendu après la mise en page initiale : coordsAtPos n'a de
      // sens qu'une fois le document dessiné.
      setTimeout(rendre, 0)
      return {
        update: (v, ancien) => {
          if (v.state.doc !== ancien.doc || !v.state.selection.eq(ancien.selection)) planifier()
        },
        destroy: () => {
          commentsMap.unobserve(rafraichir)
          window.removeEventListener('resize', rafraichir)
          clearTimeout(timer)
          view = null
        },
      }
    },
  })
}

/** Bouton « Commenter » de la gouttière : apparaît en face de la sélection
 * quand il y en a une. Sans lui, la gouttière remplacerait le panneau
 * latéral sans en reprendre la seule action qui compte. */
export function mountGutterComposer(gutter, ydoc, commentsMap, user) {
  let view = null
  let timer = null
  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.className = 'gouttiere-commenter'
  bouton.textContent = '＋'
  bouton.title = 'Commenter le passage sélectionné'
  bouton.hidden = true
  gutter.appendChild(bouton)

  const composeur = document.createElement('div')
  composeur.className = 'carte-commentaire composeur'
  composeur.hidden = true
  composeur.innerHTML = `
    <textarea rows="3" placeholder="Votre commentaire…"></textarea>
    <div class="carte-actions">
      <button type="button" class="btn-accept envoyer">Commenter</button>
      <button type="button" class="annuler">Annuler</button>
    </div>
  `
  gutter.appendChild(composeur)
  const zone = composeur.querySelector('textarea')

  function fermer() {
    composeur.hidden = true
    zone.value = ''
    // Si la gouttière était ouverte pour le seul composeur, elle se replie.
    if (!gutter.querySelector('.carte-commentaire:not(.composeur)')) gutter.classList.remove('peuplee')
    if (view) view.focus()
  }

  composeur.querySelector('.annuler').onclick = fermer
  composeur.querySelector('.envoyer').onclick = () => {
    const texte = zone.value.trim()
    if (!texte || !view) return
    if (addComment(view, ydoc, commentsMap, user, texte)) fermer()
  }
  // Entrée envoie, Maj+Entrée garde le retour à la ligne — même convention
  // que le panneau latéral.
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      composeur.querySelector('.envoyer').click()
    }
    if (e.key === 'Escape') fermer()
  })

  bouton.onclick = () => {
    if (!view) return
    const y = positionDeLaSelection()
    if (y === null) return
    composeur.style.top = `${y}px`
    composeur.hidden = false
    bouton.hidden = true
    gutter.classList.add('peuplee')
    zone.focus()
  }

  function positionDeLaSelection() {
    if (!view) return null
    const { from, empty } = view.state.selection
    if (empty) return null
    try {
      const rect = gutter.getBoundingClientRect()
      return Math.max(0, Math.round(view.coordsAtPos(from).top - rect.top))
    } catch {
      return null
    }
  }

  function majBouton() {
    const y = positionDeLaSelection()
    if (y === null || !composeur.hidden) {
      bouton.hidden = true
      return
    }
    bouton.style.top = `${y}px`
    bouton.hidden = false
  }

  return new Plugin({
    view(editorView) {
      view = editorView
      return {
        update: () => {
          clearTimeout(timer)
          timer = setTimeout(majBouton, DELAI_RECALCUL_MS)
        },
        destroy: () => {
          clearTimeout(timer)
          view = null
        },
      }
    },
  })
}
