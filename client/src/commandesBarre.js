// Les gestes de la barre de mise en forme, sans interface (point 23 de la
// feuille de route, 13/10/2026 : sortis de `mountEditor`).
//
// Chaque fonction prend la vue (ou son état) et fait **un** geste : basculer
// une marque, une liste, une citation, poser un tableau ou une ligne, changer
// le style du bloc. Les boutons de `editor.js` ne font plus que les appeler
// puis rendre le focus au texte ; c'est ce qui permet de les tester sans
// monter tout l'éditeur.

import { TextSelection } from 'prosemirror-state'
import { toggleMark, setBlockType, wrapIn, lift, chainCommands } from 'prosemirror-commands'
import { wrapInList, liftListItem, sinkListItem } from 'prosemirror-schema-list'
import { schema } from './schema.js'
import { selectionContientUneNote } from './footnotes.js'
import { styleParagrapheValide } from '../../shared/style.js'

/** Vrai si un ancêtre du début de la sélection (ou le nœud où elle se trouve)
 * est du type donné — c'est ce qui fait des boutons de liste et de citation
 * des interrupteurs (envelopper / sortir) plutôt que des actions à sens
 * unique. */
export function hasAncestorOfType(state, type) {
  const { $from } = state.selection
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type === type) return true
  }
  return false
}

export function toggleWrap(type) {
  return (state, dispatch) => {
    if (hasAncestorOfType(state, type)) return lift(state, dispatch)
    return wrapIn(type)(state, dispatch)
  }
}

/** Le bouton d'une liste, **dans** une liste de ce type : on descend d'un
 * niveau (13/10/2026 : « si on remet une liste dans une liste, on descend d'un
 * niveau »). S'il n'y a nulle part où descendre (premier élément, plafond de
 * six niveaux), on fait comme avant et on sort de la liste : c'est le seul
 * geste de souris pour la quitter. Hors liste, le bouton en crée une. */
export function toggleList(listType, itemType) {
  return (state, dispatch) => {
    if (hasAncestorOfType(state, listType)) {
      if (peutAugmenterRetrait(state)) return imbriquer()(state, dispatch)
      return liftListItem(itemType)(state, dispatch)
    }
    return wrapInList(listType)(state, dispatch)
  }
}

// --- Listes à plusieurs niveaux (13/10/2026) ---------------------------------
// Le schéma autorisait déjà d'imbriquer (un élément de liste contient des
// blocs, dont une autre liste) ; il manquait les gestes : Tab / Maj+Tab au
// clavier, et deux boutons pour le doigt et la souris. Six niveaux, pas plus :
// au-delà, le texte n'a plus de place sur une page ni sur un téléphone, et
// Word (neuf niveaux) comme Typst s'en sortiraient, mais pas le lecteur.

/** Nombre maximal de niveaux de liste emboîtés. */
export const NIVEAUX_DE_LISTE_MAX = 6

const ELEMENTS_DE_LISTE = () => [schema.nodes.list_item, schema.nodes.task_item]

/** Combien d'éléments de liste enveloppent le début de la sélection :
 * 0 hors liste, 1 au premier niveau, 2 dans une sous-liste… */
export function niveauDeListe(state) {
  const { $from } = state.selection
  const types = ELEMENTS_DE_LISTE()
  let n = 0
  for (let d = $from.depth; d > 0; d--) if (types.includes($from.node(d).type)) n++
  return n
}

const imbriquer = () => chainCommands(...ELEMENTS_DE_LISTE().map((t) => sinkListItem(t)))
const remonter = () => chainCommands(...ELEMENTS_DE_LISTE().map((t) => liftListItem(t)))

/** Peut-on descendre d'un niveau ? Il faut un élément **avant** celui-ci (on
 * s'y range), et ne pas avoir atteint le plafond. */
export function peutAugmenterRetrait(state) {
  return niveauDeListe(state) > 0 && niveauDeListe(state) < NIVEAUX_DE_LISTE_MAX && imbriquer()(state)
}

/** Tab dans une liste. Dans une liste, la commande **prend toujours la
 * main** (retour vrai), même quand elle ne peut rien faire (premier élément,
 * plafond) : sinon la touche faisait sauter le focus hors du texte. Hors
 * liste, elle passe la main. */
export const augmenterRetrait = (state, dispatch) => {
  if (!niveauDeListe(state)) return false
  if (peutAugmenterRetrait(state)) imbriquer()(state, dispatch)
  return true
}

/** Maj+Tab dans une liste, même principe. */
export const reduireRetrait = (state, dispatch) => {
  if (!niveauDeListe(state)) return false
  remonter()(state, dispatch)
  return true
}

/** Gras, italique, souligné ou barré, selon le nom de la marque du schéma. */
export function basculerMarque(view, nomMarque) {
  toggleMark(schema.marks[nomMarque])(view.state, view.dispatch)
  view.focus()
}

export function basculerListeAPuces(view) {
  toggleList(schema.nodes.bullet_list, schema.nodes.list_item)(view.state, view.dispatch)
  view.focus()
}

export function basculerListeNumerotee(view) {
  toggleList(schema.nodes.ordered_list, schema.nodes.list_item)(view.state, view.dispatch)
  view.focus()
}

export function basculerListeACocher(view) {
  toggleList(schema.nodes.task_list, schema.nodes.task_item)(view.state, view.dispatch)
  view.focus()
}

export function basculerCitation(view) {
  toggleWrap(schema.nodes.blockquote)(view.state, view.dispatch)
  view.focus()
}

/** Style de bloc commun à toute la sélection : '' pour un paragraphe, le
 * niveau pour un titre, 'titre' ou 'sous-titre' pour ces deux styles de
 * paragraphe (14/10/2026), `null` si la sélection en mélange plusieurs (on
 * n'affiche alors aucune option plutôt que d'en désigner une à tort). Les
 * paragraphes d'une liste ou d'une citation comptent comme « Normal » :
 * c'est bien ce que le menu changerait s'il était utilisé. */
export function styleDeBlocCommun(state) {
  let commun
  const { from, to } = state.selection
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isTextblock) return true
    const valeur =
      node.type === schema.nodes.heading
        ? String(node.attrs.level)
        : node.type === schema.nodes.paragraph
          ? styleParagrapheValide(node.attrs.style) || ''
          : null
    if (commun === undefined) commun = valeur
    else if (commun !== valeur) commun = null
    return false
  })
  return commun === undefined ? '' : commun
}

/** Applique le style choisi dans le menu : '' = paragraphe, '1' à '3' = titre
 * de section, 'titre' ou 'sous-titre' = paragraphe de ce style (ils portent
 * une note sans difficulté : ce ne sont pas des titres de section). Rend
 * `'note'` — sans rien changer — si la sélection contient une note : un
 * titre de section n'en porte pas (schema.js), et l'appelant le dit plutôt
 * que de laisser ProseMirror refuser en silence. Rend `true` sinon. */
export function appliquerStyleDeBloc(view, valeur) {
  if (valeur === '') {
    setBlockType(schema.nodes.paragraph)(view.state, view.dispatch)
  } else if (styleParagrapheValide(valeur)) {
    setBlockType(schema.nodes.paragraph, { style: valeur })(view.state, view.dispatch)
  } else if (selectionContientUneNote(view.state)) {
    return 'note'
  } else {
    setBlockType(schema.nodes.heading, { level: Number(valeur) })(view.state, view.dispatch)
  }
  return true
}

/** Pose un tableau de trois lignes sur trois colonnes à la sélection. Hors
 * suivi des modifications : une structure de nœuds, que le suivi ne sait pas
 * marquer (et la barre n'est ouverte qu'aux éditeurs). */
export function insererTableau(view) {
  // `table_cell`, pas `cell` : ce sont les noms que produit tableNodes()
  // (table, table_row, table_cell, table_header). La première version
  // visait `cell`, donc `undefined`, et le clic ne faisait rien du tout.
  const { table_cell, table_row, table } = schema.nodes
  const cellule = () => table_cell.createAndFill()
  const ligne = () => table_row.create({}, [cellule(), cellule(), cellule()])
  view.dispatch(
    view.state.tr
      .replaceSelectionWith(table.create({}, [ligne(), ligne(), ligne()]))
      .setMeta('trackChangesInternal', true)
      .scrollIntoView()
  )
  view.focus()
}

/** Les opérations de structure d'un tableau ne passent pas par le suivi des
 * modifications : comme les changements de niveau de titre ou de liste, ce
 * sont des changements de nœuds, que l'architecture actuelle ne sait pas
 * marquer. D'où le méta d'échappement — et la réservation aux éditeurs,
 * décidée dans l'étude (claude/etude-tableaux-images.md). */
export function commandeTableau(getView, commande) {
  return () => {
    const view = getView()
    commande(view.state, (tr) => view.dispatch(tr.setMeta('trackChangesInternal', true)))
    view.focus()
  }
}

/** Pose un saut de page (le nœud `horizontal_rule` : voir schema.js). */
export function insererSautDePage(view) {
  insererBlocAtomique(view, 'horizontal_rule')
}

/** Pose une ligne de séparation (un simple trait, jamais un saut de page). */
export function insererLigne(view) {
  insererBlocAtomique(view, 'ligne_separation')
}

function insererBlocAtomique(view, nom) {
  // replaceSelectionWith se charge de trouver un point d'insertion valide
  // (ex. couper le paragraphe en deux si le curseur est au milieu d'un
  // texte) — même mécanisme que le menu "Horizontal rule" standard de
  // prosemirror-example-setup.
  const tr = view.state.tr.replaceSelectionWith(schema.nodes[nom].create())
  const after = tr.selection.to
  if (!tr.doc.resolve(after).nodeAfter) {
    // Le bloc se retrouve en toute fin de document : sans paragraphe
    // après elle, la prochaine frappe devrait d'abord créer ce
    // paragraphe elle-même — une édition structurelle, donc non suivie
    // par trackChanges.js (voir la note dans schema.js), ce qui ferait
    // perdre le suivi du tout premier texte tapé après la ligne. On crée
    // ce paragraphe vide tout de suite à la place, pour que la frappe
    // suivante soit une simple insertion de texte, suivie normalement.
    tr.insert(after, schema.nodes.paragraph.create())
    tr.setSelection(TextSelection.create(tr.doc, after + 1))
  }
  view.dispatch(tr)
  view.focus()
}
