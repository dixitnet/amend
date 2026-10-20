// Suivi des modifications — les greffons et le dispatch : collage riche, saut de paragraphe en attente, effacement suivi, et `makeDispatchTransaction` qui y branche tout.
// (Découpé de l'ancien `trackChanges.js`, 1 630 lignes — audit du 10/10/2026, C11.
// `../trackChanges.js` réexporte tout : aucun import à changer.)

import { Plugin, TextSelection, NodeSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { typographier } from '../../../shared/typographie.js'
import { typographieKey } from '../typographie.js'
import { couleurSure } from '../../../shared/securite.js'
import { estNoeudSuivi, isRemoteOrigin, isTrackChangesEnabled, libelleDuNoeud, suiviDuNoeud } from './etat.js'
import { dansUnSeulBloc, markRangeForTrackedDeletion, rewriteForTracking } from './reecriture.js'

/**
 * Handles a multi-line paste (the "collage riche" case — content copied
 * from a web page, Word, etc.) as a tracked edit. ProseMirror's own paste
 * handling turns such content into a multi-node slice that
 * rewriteForTracking above deliberately leaves untracked (see its
 * scope note) — this plugin intercepts the paste itself instead, before
 * ProseMirror gets to it.
 *
 * Deliberate scope: only the pasted *text* is kept (via
 * `text/plain`) — any source formatting (bold, links, headings…) is
 * dropped, each line becomes its own tracked-insertion paragraph, and
 * paragraph breaks between lines are tracked exactly like a manual Enter
 * (see rewriteSplitForTracking). A one-line paste (no `\n`) is left to the
 * normal path above unchanged. Only engages when the selection sits
 * directly in one top-level paragraph/heading (not nested in a list item
 * or blockquote, and not spanning several blocks already) — anything else
 * falls back to ProseMirror's own (untracked) paste, same conservative
 * scope as the rest of this file.
 */
export function richPastePlugin(getUser) {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const { state } = view
        if (!isTrackChangesEnabled(state)) return false
        const insertionType = state.schema.marks.insertion
        const deletionType = state.schema.marks.deletion
        if (!insertionType || !deletionType) return false

        const brut = event.clipboardData && event.clipboardData.getData('text/plain')
        if (!brut) return false
        // Typographié comme tout collage (shared/typographie.js).
        const text = typographier(brut)
        const lines = text.split(/\r\n|\r|\n/)
        if (lines.length < 2) return false // collage simple : déjà pris en charge plus haut

        const { $from, $to, from, to } = state.selection
        if ($from.depth !== 1 || !$from.sameParent($to)) return false

        const user = getUser()
        const insMark = insertionType.create({ user: user.name, userColor: user.color, ts: Date.now() })
        const authorMark = state.schema.marks.authorColor?.create({ user: user.name, userColor: user.color })
        const tr = state.tr

        if (to > from) {
          const delMark = deletionType.create({ user: user.name, userColor: user.color, ts: Date.now() })
          markRangeForTrackedDeletion(state, tr, from, to, delMark)
        }

        let pos = tr.mapping.map(from)
        const insertLine = (line) => {
          if (!line) return
          tr.insert(pos, state.schema.text(line))
          tr.addMark(pos, pos + line.length, insMark)
          if (authorMark) tr.addMark(pos, pos + line.length, authorMark)
          pos += line.length
        }

        insertLine(lines[0])
        for (let i = 1; i < lines.length; i++) {
          // Same position arithmetic as rewriteSplitForTracking above: a
          // depth-1 split at `pos` puts the depth-0 boundary between the
          // two resulting blocks at `pos + 1`, and that new (second)
          // block's own content starts one further in, at `pos + 2`.
          const splitPos = pos
          tr.split(splitPos)
          const boundaryPos = splitPos + 1
          const after = tr.doc.resolve(boundaryPos).nodeAfter
          if (after) {
            tr.setNodeMarkup(boundaryPos, null, {
              ...after.attrs,
              trackedBreak: { user: user.name, userColor: user.color, ts: Date.now() },
            })
          }
          pos = boundaryPos + 1
          insertLine(lines[i])
        }

        // Même règle que pour la frappe : le curseur se pose après ce qui
        // vient d'être collé, pas sur le passage barré qu'il remplace.
        if (pos >= 0 && pos <= tr.doc.content.size) tr.setSelection(TextSelection.create(tr.doc, pos))
        tr.setMeta('trackChangesInternal', true)
        view.dispatch(tr)
        return true
      },
    },
  })
}

/** Decorates every paragraph/heading carrying a pending `trackedBreak`
 * (schema.js) with a dashed top border in its author's color — the same
 * "pending, not yet reviewed" visual language as the tracked-insertion/
 * deletion marks and the horizontal_rule line (see style.css:
 * .pending-break). Purely a decoration: once trackedBreak is cleared
 * (acceptChange) or the two blocks are rejoined (rejectChange), the
 * paragraph/heading is completely ordinary again. */
export function pendingBreakPlugin() {
  return new Plugin({
    props: {
      decorations(state) {
        const decos = []
        state.doc.descendants((node, pos) => {
          if (node.isTextblock && node.attrs.trackedBreak) {
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'pending-break',
                style: `--user-color:${couleurSure(node.attrs.trackedBreak.userColor)}`,
                title: `Saut de paragraphe ajouté par ${node.attrs.trackedBreak.user}`,
              })
            )
          }
          // Un retour à la ligne suivi (Maj+Entrée) : un `br` ne peut rien
          // porter de visible, d'où un repère ↵ posé juste avant, à la couleur
          // de l'auteur (barré quand le saut est proposé à la suppression).
          if (node.type.name === 'hard_break' && suiviDuNoeud(node)) {
            const suivi = suiviDuNoeud(node)
            const supprime = suivi.type === 'deletion'
            decos.push(
              Decoration.widget(
                pos,
                () => {
                  const repere = document.createElement('span')
                  repere.className = `saut-ligne-suivi ${supprime ? 'saut-supprime' : 'saut-insere'}`
                  repere.style.setProperty('--user-color', couleurSure(suivi.userColor))
                  repere.contentEditable = 'false'
                  repere.textContent = '↵'
                  repere.title = `Saut de ligne ${supprime ? 'supprimé' : 'ajouté'} par ${suivi.user}`
                  return repere
                },
                { side: -1, key: `saut-${pos}-${suivi.type}-${suivi.ts}` }
              )
            )
          }
          // Un nœud de bloc suivi entier (une image) : même langage visuel.
          // La note, inline, se décore elle-même (footnotes.js).
          const suivi = node.isBlock ? suiviDuNoeud(node) : null
          if (suivi) {
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: suivi.type === 'insertion' ? 'noeud-insere' : 'noeud-supprime',
                style: `--user-color:${couleurSure(suivi.userColor)}`,
                title: `${libelleDuNoeud(node)} ${suivi.type === 'insertion' ? 'ajoutée' : 'supprimée'} par ${suivi.user}`,
              })
            )
          }
        })
        return DecorationSet.create(state.doc, decos)
      },
    },
  })
}

/**
 * Wraps an EditorView's transaction dispatch so that, while track changes
 * is on, local edits get rewritten by rewriteForTracking instead of applied
 * directly. `getUser` returns the current { name, color }.
 */
/**
 * Les touches d'effacement, prises en charge **avant le navigateur**
 * (17/09/2026).
 *
 * Jusqu'ici, Retour arrière et Suppr passaient par le comportement natif du
 * champ éditable, et l'on réécrivait après coup la transaction que
 * ProseMirror en déduisait. Ça marche tant que le document à l'écran est
 * celui que le navigateur croit éditer — or le suivi des modifications
 * garde à l'écran du texte que le navigateur considère comme effacé. Avec
 * la touche maintenue enfoncée, Chrome finissait par réparer ce qu'il
 * prenait pour une incohérence et **insérait une espace** avant le mot
 * qu'on était en train d'effacer (signalé par Sylvain le 17/09).
 *
 * On ne laisse donc plus le navigateur toucher au document : la touche est
 * interceptée, la transaction suivie construite directement, et rien n'est
 * déduit du DOM. `false` quand ce n'est pas notre affaire — hors suivi, en
 * début de bloc (c'est une fusion, pas un effacement), sur une sélection
 * qui traverse plusieurs blocs — et la commande suivante prend la main,
 * exactement comme avant.
 */
export function effacementSuivi(getUser, versLArriere) {
  return (state, dispatch) => {
    if (!isTrackChangesEnabled(state)) return false
    const sel = state.selection
    // Un nœud de bloc sélectionné entier (une image) : suivi par son
    // attribut, sans passer par la réécriture, qui ne connaît que le
    // texte dans un bloc.
    if (sel instanceof NodeSelection && estNoeudSuivi(sel.node)) {
      const user = getUser()
      const ts = Date.now()
      const tr = state.tr
      const suivi = suiviDuNoeud(sel.node)
      if (suivi && suivi.type === 'deletion') return true
      if (suivi && suivi.type === 'insertion' && suivi.user === user.name) tr.delete(sel.from, sel.to)
      else
        tr.setNodeMarkup(sel.from, null, {
          ...sel.node.attrs,
          suivi: { type: 'deletion', user: user.name, userColor: user.color, ts },
        })
      tr.setMeta('trackChangesInternal', true)
      if (dispatch) dispatch(tr)
      return true
    }
    let debut
    let fin
    if (!sel.empty) {
      debut = sel.from
      fin = sel.to
    } else if (versLArriere) {
      // Un nœud entier avant le curseur (une note) : c'est lui qu'on
      // efface, pas « un caractère » qui tomberait au milieu de son texte.
      const avant = sel.$from.nodeBefore
      debut = sel.from - (avant && !avant.isText ? avant.nodeSize : 1)
      fin = sel.from
    } else {
      const apres = sel.$from.nodeAfter
      debut = sel.from
      fin = sel.from + (apres && !apres.isText ? apres.nodeSize : 1)
    }
    if (debut < 0 || fin > state.doc.content.size || debut >= fin) return false
    if (!dansUnSeulBloc(state, debut, fin)) return false

    const suivie = rewriteForTracking(state, state.tr.delete(debut, fin), getUser())
    if (!suivie) return false
    if (dispatch) dispatch(suivie)
    return true
  }
}

/**
 * `peutModifierLibrement` : vrai pour qui a le droit d'écrire hors suivi
 * (un éditeur). Pour les autres — un correcteur —, **ce que le suivi ne
 * sait pas suivre est refusé** (S1 du rapport du 28/09/2026) : fusionner ou
 * scinder des blocs hors premier niveau, changer un paragraphe en titre,
 * mettre en forme, cocher une tâche… Avant, ces gestes passaient hors
 * suivi, sans un mot : autant de portes de sortie du suivi pour quelqu'un
 * dont le rôle est de proposer. Une règle, écrite ici une fois, qui
 * remplace les cas particuliers (boutons cachés, gardes par greffon) et
 * couvre ceux qu'on n'a pas listés. `surRefus` prévient la personne.
 */
export function makeDispatchTransaction(
  view,
  getUser,
  { peutModifierLibrement = () => true, surRefus = () => {} } = {}
) {
  return function dispatchTransaction(tr) {
    let finalTr = tr
    if (
      tr.docChanged &&
      isTrackChangesEnabled(view.state) &&
      !tr.getMeta('trackChangesInternal') &&
      !isRemoteOrigin(tr)
    ) {
      const rewritten = rewriteForTracking(view.state, tr, getUser())
      if (!rewritten && !peutModifierLibrement()) {
        surRefus(tr)
        return
      }
      if (rewritten) {
        finalTr = rewritten
        // La transaction d'origine portait la consigne « ramène le curseur
        // dans le champ de vision » — c'est ProseMirror qui la pose sur
        // toute saisie. La réécrite, construite de zéro, ne la porte pas :
        // on écrivait donc sous la barre d'outils, ou sous le clavier, sans
        // que rien ne défile (banc iPhone, 23/09/2026). Défaut présent en
        // suivi de modifications seulement, sur tous les écrans.
        if (tr.scrolledIntoView) finalTr = finalTr.scrollIntoView()
        // La correction typographique à défaire d'un Retour arrière (typographie.js).
        const typo = tr.getMeta(typographieKey)
        if (typo) finalTr.setMeta(typographieKey, typo)
      }
    }
    const newState = view.state.apply(finalTr)
    view.updateState(newState)
  }
}
