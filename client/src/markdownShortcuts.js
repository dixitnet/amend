// Raccourcis Markdown à la saisie (15/09/2026) : taper « ## », « - »,
// « 1. », « [] » ou « > » en début de ligne transforme le bloc directement,
// comme le fait n'importe quel éditeur moderne.
//
// Écrit à la main plutôt qu'avec prosemirror-inputrules, pour une raison
// précise : ces transformations doivent contourner le suivi des
// modifications. Elles suppriment les caractères qu'on vient de taper, et
// sous suivi actif cette suppression deviendrait une suppression *marquée*
// — on verrait « ## » barré devant son propre titre. Elles passent donc par
// le même échappement que les autres changements de structure, le méta
// `trackChangesInternal` (voir trackChanges.js), cohérent avec le choix déjà
// fait pour les niveaux de titre et les listes.
//
// Délibérément absent : « --- ». Dans ce schéma la ligne horizontale est un
// saut de page à l'export PDF (voir schema.js), pas une séparation
// visuelle : en faire un raccourci de frappe piégerait tout le monde.

import { Plugin } from 'prosemirror-state'
import { setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'

/** Exécute une commande en marquant sa transaction comme interne au suivi
 * des modifications. */
function appliquer(view, commande) {
  return commande(view.state, (tr) => view.dispatch(tr.setMeta('trackChangesInternal', true)))
}

export function markdownShortcutsPlugin(schema) {
  const regles = [
    {
      // Trois niveaux depuis le 18/09/2026 : « #### » n'est plus un titre.
      motif: /^(#{1,3})\s$/,
      appliquer: (view, m) =>
        appliquer(view, setBlockType(schema.nodes.heading, { level: m[1].length })),
    },
    {
      motif: /^\[([ xX]?)\]\s$/,
      liste: true,
      appliquer: (view, m) => {
        if (!appliquer(view, wrapInList(schema.nodes.task_list))) return false
        if (m[1].toLowerCase() !== 'x') return true
        // « [x] » : la case naît cochée.
        const { $from } = view.state.selection
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type === schema.nodes.task_item) {
            const pos = $from.before(d)
            view.dispatch(
              view.state.tr
                .setNodeMarkup(pos, undefined, { checked: true })
                .setMeta('trackChangesInternal', true)
            )
            break
          }
        }
        return true
      },
    },
    {
      motif: /^[-*+]\s$/,
      liste: true,
      appliquer: (view) => appliquer(view, wrapInList(schema.nodes.bullet_list)),
    },
    {
      motif: /^(\d+)[.)]\s$/,
      liste: true,
      appliquer: (view, m) =>
        appliquer(view, wrapInList(schema.nodes.ordered_list, { order: Number(m[1]) || 1 })),
    },
    {
      motif: /^>\s$/,
      liste: true,
      appliquer: (view) => appliquer(view, wrapIn(schema.nodes.blockquote)),
    },
  ]

  return new Plugin({
    props: {
      handleTextInput(view, from, to, texte) {
        const { $from, empty } = view.state.selection
        if (!empty) return false
        if ($from.parent.type !== schema.nodes.paragraph) return false

        const debutBloc = $from.start()
        const avant = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼') + texte
        for (const regle of regles) {
          const m = regle.motif.exec(avant)
          if (!m) continue
          // Les raccourcis de liste et de citation ne s'appliquent pas à
          // l'intérieur d'une liste : quelqu'un qui tape « - » dans un
          // élément de liste veut un tiret, pas une liste imbriquée.
          if (regle.liste && estDansUneListe($from, schema)) continue

          // Le préfixe tapé disparaît avant la transformation ; `to` inclut
          // la position du caractère en cours de saisie, qui n'est pas
          // encore inséré — d'où la suppression jusqu'à `to` seulement.
          view.dispatch(view.state.tr.delete(debutBloc, to).setMeta('trackChangesInternal', true))
          if (regle.appliquer(view, m) === false) return true
          return true
        }
        return false
      },
    },
  })
}

function estDansUneListe($pos, schema) {
  for (let d = $pos.depth; d > 0; d--) {
    const type = $pos.node(d).type
    if (type === schema.nodes.list_item || type === schema.nodes.task_item) return true
  }
  return false
}
