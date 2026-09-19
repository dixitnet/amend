// Banc d'essai de l'éditeur, sans navigateur.
//
// ProseMirror sépare proprement le modèle (état, transactions) du rendu :
// tout ce que fait Amend au moment d'une frappe — réécrire une transaction
// en suivi de modifications, appliquer une suggestion de l'IA — se passe
// dans cette couche-là, qui n'a besoin d'aucun DOM. On peut donc la jouer
// dans Node et vérifier le **résultat exact** plutôt que de cliquer dans
// un navigateur et de regarder si ça a l'air normal.
//
// Ce que ce banc ne couvre pas, et qu'il faut garder en tête : le rendu et
// la position du curseur à l'écran, la composition (IME, dictée), le
// collage réel (qui passe par un évènement du navigateur), et la
// synchronisation Yjs entre deux clients.

import { EditorState, TextSelection } from 'prosemirror-state'
import { baseKeymap } from 'prosemirror-commands'
import { schema } from '../src/schema.js'
import {
  trackChangesPlugin,
  makeDispatchTransaction,
  setTrackChangesEnabled,
  effacementSuivi,
} from '../src/trackChanges.js'

export const UTILISATEUR = { name: 'Alice', color: '#3d5a80' }
export const IA = { name: 'IA', color: '#5f7a4a' }

/** Un document à partir d'une liste de paragraphes (ou de `{h: n, texte}`
 * pour un titre, `{citation: 'texte'}` pour une citation). */
export function doc(...blocs) {
  return schema.node(
    'doc',
    null,
    blocs.map((b) => {
      if (typeof b === 'string') return schema.node('paragraph', null, b ? [schema.text(b)] : [])
      if (b.citation !== undefined) {
        return schema.node('blockquote', null, [
          schema.node('paragraph', null, [schema.text(b.citation)]),
        ])
      }
      return schema.node('heading', { level: b.h }, [schema.text(b.texte)])
    })
  )
}

/**
 * Une fausse vue : juste ce dont le code a besoin (`state`, `dispatch`,
 * `updateState`). C'est suffisant parce que rien de ce qu'on teste ici ne
 * touche au DOM — et c'est justement ce qui rend ces tests possibles.
 */
export function editeur(document, { suivi = true, user = UTILISATEUR } = {}) {
  let state = EditorState.create({
    doc: document,
    plugins: [trackChangesPlugin({ enabled: suivi })],
  })

  const view = {
    get state() {
      return state
    },
    updateState(s) {
      state = s
    },
    dispatch(tr) {
      dispatcher(tr)
    },
  }
  const dispatcher = makeDispatchTransaction(view, () => user)

  return {
    view,
    get state() {
      return state
    },
    get doc() {
      return state.doc
    },
    /** Le texte du document, un bloc par ligne. */
    texte() {
      const lignes = []
      state.doc.forEach((n) => lignes.push(n.textContent))
      return lignes.join('\n')
    },
    /** Le texte tel qu'il se lit une fois les propositions acceptées :
     * sans les passages barrés. C'est ce que verra le lecteur final. */
    texteAccepte() {
      const lignes = []
      state.doc.forEach((n) => {
        let s = ''
        // `descendants`, et non `forEach` : le texte d'une citation est
        // dans le paragraphe qu'elle contient, d'un niveau plus bas.
        n.descendants((enfant) => {
          if (!enfant.isText) return
          if (enfant.marks.some((m) => m.type.name === 'deletion')) return
          s += enfant.text
        })
        lignes.push(s)
      })
      return lignes.join('\n')
    },
    /** Le nombre de blocs (paragraphes + titres) de premier niveau. */
    nbBlocs() {
      return state.doc.childCount
    },
    /** Les segments marqués, dans l'ordre : `['+texte', '-texte']`. */
    marques() {
      const out = []
      state.doc.descendants((node) => {
        if (!node.isText) return
        const ins = node.marks.some((m) => m.type.name === 'insertion')
        const del = node.marks.some((m) => m.type.name === 'deletion')
        if (ins) out.push('+' + node.text)
        else if (del) out.push('-' + node.text)
      })
      return out
    },
    /** Les sauts de paragraphe encore en attente. */
    sautsEnAttente() {
      let n = 0
      state.doc.forEach((node) => {
        if (node.attrs.trackedBreak) n++
      })
      return n
    },
    selection(from, to = from) {
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
      return this
    },
    /** Frappe au clavier : une transaction par caractère, comme le fait
     * réellement le navigateur — c'est la seule façon de reproduire ce que
     * vit l'utilisateur quand il tape par-dessus une sélection. */
    taper(texte) {
      for (const c of texte) {
        const { from, to } = state.selection
        dispatcher(state.tr.insertText(c, from, to))
      }
      return this
    },
    /** Remplace la sélection en une seule transaction (collage simple,
     * autocomplétion). */
    remplacer(texte) {
      const { from, to } = state.selection
      dispatcher(state.tr.insertText(texte, from, to))
      return this
    },
    /** Retour arrière — par la **même porte que le clavier** (la commande
     * liée à la touche), et non par une transaction fabriquée à la main :
     * c'est le chemin réel, et c'est celui où les défauts se logent. Si la
     * commande passe la main (fusion de blocs, suivi désactivé), on
     * applique la suppression ordinaire, comme le ferait baseKeymap. */
    effacerAvant() {
      // La vraie chaîne de l'éditeur, dans l'ordre : notre commande, puis
      // baseKeymap (qui ne traite que les cas structurels — fusion de
      // blocs, nœud entier), puis **le navigateur**, qui est ce qui efface
      // réellement un caractère au milieu d'un texte. C'est ce dernier
      // maillon qu'on imite ici par une suppression ordinaire, et c'est
      // précisément celui qui posait problème avant l'interception.
      if (!effacementSuivi(() => user, true)(state, dispatcher) && !baseKeymap.Backspace(state, dispatcher)) {
        const { from, to, empty } = state.selection
        if (empty) dispatcher(state.tr.delete(Math.max(0, from - 1), from))
        else dispatcher(state.tr.delete(from, to))
      }
      return this
    },
    /** Suppression avant (touche Suppr / fn+Retour sur un Mac). */
    effacerApres() {
      if (!effacementSuivi(() => user, false)(state, dispatcher) && !baseKeymap.Delete(state, dispatcher)) {
        const { from, to, empty } = state.selection
        if (empty) dispatcher(state.tr.delete(from, Math.min(state.doc.content.size, from + 1)))
        else dispatcher(state.tr.delete(from, to))
      }
      return this
    },
    suivi(actif) {
      setTrackChangesEnabled(view, actif)
      return this
    },
  }
}

export { schema }
