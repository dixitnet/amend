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
    title.textContent = `Commentaires (${commentsMap.size})`
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

    if (commentsMap.size === 0) {
      const empty = document.createElement('p')
      empty.className = 'changes-empty'
      empty.textContent = 'Aucun commentaire pour le moment.'
      container.appendChild(empty)
      return
    }

    const entries = []
    commentsMap.forEach((c) => entries.push(c))
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
      meta.innerHTML = `<strong>${escapeHtml(c.author)}</strong> · ${relativeTime(c.createdAt)}`

      const text = document.createElement('div')
      text.className = 'change-text'
      text.textContent = c.text

      const actions = document.createElement('div')
      actions.className = 'change-actions'
      const resolveBtn = document.createElement('button')
      resolveBtn.type = 'button'
      resolveBtn.textContent = 'Résoudre'
      resolveBtn.className = 'btn-accept'
      resolveBtn.onclick = () => commentsMap.delete(c.id)
      actions.appendChild(resolveBtn)

      item.append(meta, text, actions)
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
