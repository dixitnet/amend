import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import * as Y from 'yjs'
import {
  ySyncPluginKey,
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  setMeta,
} from 'y-prosemirror'

// Commentaires ancrés dans le texte (évolution 4.2.4, conception du
// 12/09/2026 dans README2.md) — un commentaire ne change rien au contenu du
// document : il vit dans son propre type Yjs (`ydoc.getMap('comments')`),
// pas dans le schéma ProseMirror. Conséquence directe : il est synchronisé
// et persisté par la même plomberie que le reste du document (aucun
// changement serveur), et il n'apparaît dans aucun export (.md/.pdf), ce qui
// est le comportement voulu — une remarque, pas une modification de texte.
//
// L'ancrage utilise les positions relatives de Yjs
// (absolutePositionToRelativePosition / relativePositionToAbsolutePosition,
// déjà utilisées en interne par y-prosemirror pour les curseurs distants —
// voir yCursorPlugin) plutôt que de simples entiers ProseMirror : elles
// restent valides même si quelqu'un modifie le texte avant le passage
// commenté entre-temps.
//
// Simplification demandée le 12/09/2026 : "résoudre" un commentaire le
// supprime purement et simplement (`commentsMap.delete`) plutôt que de le
// garder consultable — contrairement au suivi des modifications, un
// commentaire résolu ne laisse aucune trace.
//
// --- Les fils de discussion (20/09/2026) ---------------------------------
//
// Une réponse est une entrée de premier niveau de la même map, portant un
// champ `parent`. Ce n'est pas la forme la plus élégante — la map mélange
// deux natures d'entrées, et tout ce qui la parcourt doit le savoir — mais
// c'est la seule qui ne perde rien.
//
// Un commentaire est rangé **en bloc** : `commentsMap.set(id, {…})`
// synchronise la valeur entière, Yjs ne fusionne pas à l'intérieur. Si les
// réponses étaient un tableau dans cet objet, répondre s'écrirait
// `set(id, {...c, replies: [...c.replies, nouvelle]})` — et deux personnes
// répondant en même temps enverraient chacune sa version complète de
// l'objet : la dernière écraserait l'autre, et une réponse disparaîtrait
// sans que personne ne le sache. Avec une clé par réponse, deux réponses
// simultanées sont deux clés différentes, cas que Yjs gère nativement.
// C'est vérifié par un test qui fait converger deux documents.
//
// Un seul niveau : une réponse ne porte jamais de réponse (`ajouterReponse`
// refuse un parent qui est lui-même une réponse). C'est une demande, et
// c'est aussi ce qui garde une carte de marge lisible.
//
// Qui peut corriger quoi : une **convention d'interface**, pas une
// protection. Les commentaires vivent dans le document Yjs, où tout
// participant peut techniquement écrire — comme il peut déjà réécrire le
// texte. On compare les noms affichés faute de mieux : le client ne connaît
// pas sa propre adresse (le serveur ne lui envoie que `myName` et
// `myColor`).

export const commentsPluginKey = new PluginKey('comments')

function decodeAnchor(json) {
  return json ? Y.createRelativePositionFromJSON(json) : null
}

/** Résout la position actuelle (from/to) d'un commentaire, ou null si son
 * ancre ne pointe plus vers un endroit valable du document (ex. le type Yjs
 * auquel elle était relative a été détruit). Prend l'état ProseMirror
 * directement (pas la vue) : appelable aussi bien depuis le plugin de
 * décoration (qui ne reçoit qu'un state) que depuis le panneau (qui a la
 * vue sous la main). */
export function resolveCommentRange(state, ydoc, comment) {
  const ystate = ySyncPluginKey.getState(state)
  if (!ystate) return null
  const from = relativePositionToAbsolutePosition(
    ydoc,
    ystate.type,
    decodeAnchor(comment.anchorFrom),
    ystate.binding.mapping
  )
  const to = relativePositionToAbsolutePosition(
    ydoc,
    ystate.type,
    decodeAnchor(comment.anchorTo),
    ystate.binding.mapping
  )
  if (from == null || to == null) return null
  return { from: Math.min(from, to), to: Math.max(from, to) }
}

/** Supprime les commentaires dont le passage commenté n'existe plus
 * (demande du 15/09/2026 : « le commentaire d'un texte supprimé doit
 * disparaître »). Un commentaire est considéré orphelin quand ses deux
 * ancres se résolvent encore mais délimitent un intervalle vide — c'est
 * exactement ce que devient une ancre Yjs dont le texte a été retiré.
 *
 * Deux précautions qui comptent :
 *  - une ancre *non résoluble* (resolveCommentRange renvoie null) n'est PAS
 *    un orphelin : c'est le cas au chargement, avant que la liaison Yjs ne
 *    soit prête, et supprimer là effacerait tous les commentaires du
 *    document ;
 *  - sous suivi des modifications, un texte « supprimé » reste présent,
 *    marqué — le commentaire survit donc jusqu'à l'acceptation de la
 *    suppression, ce qui est le comportement attendu.
 *
 * La suppression est faite par tous les clients connectés en même temps ;
 * c'est sans conséquence, Yjs déduplique une suppression concurrente. */
/** Les entrées à supprimer, d'après une fonction qui sait résoudre une
 * ancre. Séparé de `purgeOrphanComments` pour être éprouvable sans monter
 * une liaison Yjs/ProseMirror complète — c'est ici que se logent les deux
 * règles qui comptent, et elles méritaient des tests à elles. */
export function orphelins(commentsMap, resoudre) {
  const aSupprimer = []
  commentsMap.forEach((comment, id) => {
    // Une réponse n'a pas d'ancre : elle serait vue comme orpheline dès le
    // premier passage. Son sort suit celui de son parent, juste en dessous.
    if (estUneReponse(comment)) return
    const range = resoudre(comment)
    if (range && range.to <= range.from) aSupprimer.push(id)
  })
  // Le passage commenté a disparu : le fil entier s'en va avec lui.
  for (const parentId of [...aSupprimer]) {
    for (const reponse of reponsesDe(commentsMap, parentId)) aSupprimer.push(reponse.id)
  }
  return aSupprimer
}

export function purgeOrphanComments(state, ydoc, commentsMap) {
  const aSupprimer = orphelins(commentsMap, (comment) =>
    resolveCommentRange(state, ydoc, comment)
  )
  if (!aSupprimer.length) return 0
  ydoc.transact(() => {
    for (const id of aSupprimer) commentsMap.delete(id)
  })
  return aSupprimer.length
}

/** Plugin ProseMirror : surligne (en décoration, rien de stocké dans le
 * document) le passage de chaque commentaire encore résoluble. Les
 * commentaires vivent dans `commentsMap`, un type Yjs indépendant de
 * ySyncPlugin — ses changements ne passent donc pas par une transaction
 * ProseMirror, d'où l'observer ci-dessous qui force un rafraîchissement via
 * `setMeta` (le même utilitaire que yCursorPlugin) à chaque modification. */
export function commentsPlugin(ydoc, commentsMap) {
  function buildDecorations(state) {
    const decos = []
    const docSize = state.doc.content.size
    commentsMap.forEach((comment, id) => {
      if (estUneReponse(comment)) return
      const range = resolveCommentRange(state, ydoc, comment)
      if (!range) return
      const from = Math.max(0, Math.min(range.from, docSize))
      const to = Math.max(0, Math.min(range.to, docSize))
      if (from >= to) return
      decos.push(
        Decoration.inline(from, to, {
          class: 'comment-highlight',
          style: `--comment-color:${comment.color}`,
        })
      )
    })
    return DecorationSet.create(state.doc, decos)
  }

  return new Plugin({
    key: commentsPluginKey,
    state: {
      init(_config, state) {
        return buildDecorations(state)
      },
      apply(tr, old, _oldState, newState) {
        if (!tr.docChanged && !tr.getMeta(commentsPluginKey)) return old
        return buildDecorations(newState)
      },
    },
    props: {
      decorations(state) {
        return commentsPluginKey.getState(state)
      },
    },
    view(view) {
      const refresh = () => setMeta(view, commentsPluginKey, true)
      commentsMap.observe(refresh)
      return {
        // Après chaque changement du document, on efface les commentaires
        // devenus orphelins (voir purgeOrphanComments). Fait ici plutôt que
        // dans `apply` : c'est une écriture dans Yjs, elle n'a rien à faire
        // dans le calcul d'un état ProseMirror, qui doit rester pur.
        update(v, prevState) {
          if (v.state.doc !== prevState.doc) purgeOrphanComments(v.state, ydoc, commentsMap)
        },
        destroy() {
          commentsMap.unobserve(refresh)
        },
      }
    },
  })
}

/** Crée un commentaire ancré sur la sélection actuelle. Retourne false (sans
 * rien créer) si la sélection est vide. */
export function addComment(view, ydoc, commentsMap, user, text) {
  const { from, to } = view.state.selection
  if (from === to) return false
  const ystate = ySyncPluginKey.getState(view.state)
  if (!ystate) return false
  const anchorFrom = Y.relativePositionToJSON(
    absolutePositionToRelativePosition(from, ystate.type, ystate.binding.mapping)
  )
  const anchorTo = Y.relativePositionToJSON(
    absolutePositionToRelativePosition(to, ystate.type, ystate.binding.mapping)
  )
  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  commentsMap.set(id, {
    id,
    author: user.name,
    color: user.color,
    anchorFrom,
    anchorTo,
    text,
    createdAt: Date.now(),
  })
  return true
}

/** Vrai pour une réponse, faux pour un commentaire ancré dans le texte. */
export function estUneReponse(commentaire) {
  return !!(commentaire && commentaire.parent)
}

/** Les commentaires ancrés, réponses exclues — ce que la marge dessine. */
export function commentairesAncres(commentsMap) {
  const out = []
  commentsMap.forEach((commentaire, id) => {
    if (!estUneReponse(commentaire)) out.push([id, commentaire])
  })
  return out
}

/** Les réponses d'un commentaire, dans l'ordre où elles ont été écrites.
 * `createdAt` peut être identique pour deux réponses écrites à la même
 * milliseconde sur deux machines : on départage par l'identifiant, pour que
 * tout le monde voie le **même** ordre. */
export function reponsesDe(commentsMap, parentId) {
  const out = []
  commentsMap.forEach((commentaire, id) => {
    if (commentaire && commentaire.parent === parentId) out.push({ ...commentaire, id })
  })
  out.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out
}

function nouvelIdentifiant(prefixe) {
  return `${prefixe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Ajoute une réponse à un commentaire. Refuse de répondre à une réponse :
 * un seul niveau. Renvoie l'identifiant créé, ou null. */
export function ajouterReponse(commentsMap, user, parentId, text) {
  const texte = String(text || '').trim()
  if (!texte) return null
  const parent = commentsMap.get(parentId)
  if (!parent || estUneReponse(parent)) return null
  const id = nouvelIdentifiant('r')
  commentsMap.set(id, {
    id,
    parent: parentId,
    author: user.name,
    color: user.color,
    text: texte,
    createdAt: Date.now(),
  })
  return id
}

/** Vrai si cette personne peut corriger ce commentaire. Convention, pas
 * protection — voir la note en tête de fichier. */
export function peutModifier(commentaire, user) {
  return !!commentaire && !!user && commentaire.author === user.name
}

/** Corrige le texte d'un commentaire ou d'une réponse. `editedAt` est posé
 * pour que les autres sachent qu'un texte a changé sous leurs yeux : un
 * commentaire qui se réécrit sans le dire est plus troublant qu'utile. */
export function modifierTexte(commentsMap, id, texte) {
  const courant = commentsMap.get(id)
  if (!courant) return false
  const propre = String(texte || '').trim()
  if (!propre || propre === courant.text) return false
  commentsMap.set(id, { ...courant, text: propre, editedAt: Date.now() })
  return true
}

/** Résout un commentaire : il s'en va, **et ses réponses avec lui**. Sans
 * ça, elles resteraient dans le fichier, invisibles et éternelles. En une
 * seule transaction, pour que les autres participants ne voient jamais un
 * fil à moitié effacé. */
export function supprimerFil(ydoc, commentsMap, id) {
  const commentaire = commentsMap.get(id)
  if (!commentaire) return 0
  const aSupprimer = estUneReponse(commentaire)
    ? [id]
    : [id, ...reponsesDe(commentsMap, id).map((r) => r.id)]
  ydoc.transact(() => {
    for (const cle of aSupprimer) commentsMap.delete(cle)
  })
  return aSupprimer.length
}

function relativeTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 10) return "à l'instant"
  if (s < 60) return `il y a ${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** Panneau latéral "Commentaires" : composer un commentaire sur la
 * sélection actuelle, lister les commentaires existants, "Résoudre" (qui
 * les supprime — voir la note en tête de fichier), et cliquer un
 * commentaire fait défiler le document jusqu'à son passage. */
export function mountCommentsPanel(container, ydoc, commentsMap, getView, user) {
  function render() {
    const view = getView()
    container.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'changes-header'
    const title = document.createElement('h3')
    // Le compte est celui des commentaires, pas des messages : une
    // conversation de six réponses reste un commentaire.
    title.textContent = `Commentaires (${commentairesAncres(commentsMap).length})`
    header.appendChild(title)
    container.appendChild(header)

    const hint = document.createElement('p')
    hint.className = 'ai-hint'
    hint.textContent = 'Sélectionne un passage dans le texte, puis ajoute un commentaire.'
    container.appendChild(hint)

    const textarea = document.createElement('textarea')
    textarea.rows = 2
    textarea.placeholder = 'Ton commentaire...'
    container.appendChild(textarea)

    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'btn-primary'
    addBtn.textContent = 'Ajouter un commentaire'
    container.appendChild(addBtn)

    const status = document.createElement('p')
    status.className = 'ai-status'
    container.appendChild(status)

    // Entrée envoie, Maj+Entrée garde le retour à la ligne — même
    // convention que le champ d'instruction du panneau IA (aiPanel.js).
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    })
    addBtn.onclick = submit

    function submit() {
      if (!view) return
      const text = textarea.value.trim()
      if (!text) {
        status.textContent = "Écris d'abord un commentaire."
        return
      }
      const ok = addComment(view, ydoc, commentsMap, user, text)
      if (!ok) {
        status.textContent = "Sélectionne d'abord un passage dans le texte."
        return
      }
      view.focus()
      // La map Yjs déclenche déjà un ré-rendu via l'observer plus bas.
    }

    if (commentairesAncres(commentsMap).length === 0) {
      const empty = document.createElement('p')
      empty.className = 'changes-empty'
      empty.textContent = 'Aucun commentaire pour le moment.'
      container.appendChild(empty)
      return
    }

    const entries = commentairesAncres(commentsMap).map(([, c]) => c)
    // Ordre du document plutôt que d'ajout, quand la position est encore
    // résoluble — plus utile pour s'y retrouver dans un document long.
    entries.sort((a, b) => {
      const ra = view ? resolveCommentRange(view.state, ydoc, a) : null
      const rb = view ? resolveCommentRange(view.state, ydoc, b) : null
      if (ra && rb) return ra.from - rb.from
      if (ra) return -1
      if (rb) return 1
      return a.createdAt - b.createdAt
    })

    const list = document.createElement('ul')
    list.className = 'changes-list comments-list'
    for (const c of entries) {
      const item = document.createElement('li')
      item.className = 'change-item comment-item'
      item.style.setProperty('--user-color', c.color)

      const meta = document.createElement('div')
      meta.className = 'change-meta'
      meta.innerHTML = `<strong>${escapeHtml(c.author)}</strong> · ${relativeTime(c.createdAt)}${
        c.editedAt ? ' · modifié' : ''
      }`

      const text = document.createElement('div')
      text.className = 'change-text'
      text.textContent = c.text

      const actions = document.createElement('div')
      actions.className = 'change-actions'
      const resolveBtn = document.createElement('button')
      resolveBtn.type = 'button'
      resolveBtn.textContent = 'Résoudre'
      resolveBtn.className = 'btn-accept'
      resolveBtn.onclick = () => supprimerFil(ydoc, commentsMap, c.id)
      actions.appendChild(resolveBtn)

      item.append(meta, text)
      // Le panneau latéral **montre** les fils, il ne les tient pas : on y
      // lit les réponses, on répond et l'on corrige dans la marge, où la
      // conversation a lieu. En dessous de 1100 px de large la marge
      // disparaît (style.css) et ce panneau reprend la main : il doit donc
      // au moins dire qu'une discussion existe, plutôt que de faire croire
      // à un commentaire resté sans réponse.
      const fil = reponsesDe(commentsMap, c.id)
      if (fil.length) {
        const liste = document.createElement('div')
        liste.className = 'comment-replies'
        for (const r of fil) {
          const ligne = document.createElement('div')
          ligne.className = 'comment-reply'
          ligne.style.setProperty('--user-color', r.color)
          const qui = document.createElement('strong')
          qui.textContent = r.author
          const quoi = document.createElement('span')
          quoi.textContent = ` ${r.text}`
          ligne.append(qui, quoi)
          liste.appendChild(ligne)
        }
        item.appendChild(liste)
      }
      item.appendChild(actions)
      item.addEventListener('click', (e) => {
        if (e.target.closest('.change-actions')) return
        scrollToComment(c)
      })
      list.appendChild(item)
    }
    container.appendChild(list)
  }

  /** Même principe que changesPanel.js's scrollChangeToMiddle : centre le
   * passage commenté dans `.editor-container`, plutôt que de simplement le
   * rendre visible. */
  function scrollToComment(comment) {
    const view = getView()
    if (!view) return
    const range = resolveCommentRange(view.state, ydoc, comment)
    if (!range) return
    const container = view.dom.closest('.editor-container')
    if (!container) return
    const coords = view.coordsAtPos(range.from)
    const containerRect = container.getBoundingClientRect()
    const middle = containerRect.top + container.clientHeight / 2
    container.scrollTop += coords.top - middle
  }

  render()
  commentsMap.observe(render)

  return {
    destroy() {
      commentsMap.unobserve(render)
    },
  }
}
