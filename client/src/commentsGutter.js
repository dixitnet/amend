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
import { resolveCommentRange, addComment, commentsPluginKey } from './comments.js'

const ECART_MINIMAL = 8 // px entre deux cartes empilées
const DELAI_RECALCUL_MS = 100

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function tempsRelatif(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

export function mountCommentsGutter(gutter, ydoc, commentsMap) {
  let view = null
  let actif = null // id du commentaire déployé
  let timer = null
  const cartes = new Map() // id -> élément

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
      const range = resolveCommentRange(view.state, ydoc, c)
      if (range && pos >= range.from && pos <= range.to) trouve = id
    })
    return trouve
  }

  function construireCarte(commentaire, id) {
    const carte = document.createElement('div')
    carte.className = 'carte-commentaire'
    carte.style.setProperty('--user-color', commentaire.color)
    carte.innerHTML = `
      <div class="carte-meta"><strong>${escapeHtml(commentaire.author)}</strong> · ${tempsRelatif(commentaire.createdAt)}</div>
      <div class="carte-texte"></div>
      <div class="carte-actions"><button type="button" class="btn-accept">Résoudre</button></div>
    `
    carte.querySelector('.carte-texte').textContent = commentaire.text
    carte.querySelector('button').onclick = (e) => {
      e.stopPropagation()
      commentsMap.delete(id)
    }
    carte.addEventListener('click', () => {
      actif = id
      const range = view && resolveCommentRange(view.state, ydoc, commentaire)
      if (range) centrer(range.from)
      rendre()
    })
    return carte
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

    // --- 1. Construire/rafraîchir les cartes, et calculer leur hauteur
    // naturelle. Phase de LECTURE : aucune écriture de style ici.
    const rectGouttiere = gutter.getBoundingClientRect()
    const items = []
    const vivants = new Set()
    commentsMap.forEach((commentaire, id) => {
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
      } else {
        carte.querySelector('.carte-texte').textContent = commentaire.text
      }
      carte.classList.toggle('active', id === actif)
      let y = 0
      try {
        y = view.coordsAtPos(range.from).top - rectGouttiere.top
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
   * devient active. C'est l'autre sens de la mise en évidence réciproque. */
  function activerDepuisLeTexte(pos) {
    let trouve = null
    commentsMap.forEach((c, id) => {
      const range = view && resolveCommentRange(view.state, ydoc, c)
      if (range && pos >= range.from && pos <= range.to) trouve = id
    })
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
