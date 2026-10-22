// Suivi des modifications — la décision : accepter ou rejeter une modification, un lot, toutes, celles de l'agent.
// (Découpé de l'ancien `trackChanges.js`, 1 630 lignes — audit du 10/10/2026, C11.
// `../trackChanges.js` réexporte tout : aucun import à changer.)

import { canJoin } from 'prosemirror-transform'
import { listChanges, membresDuLot } from './inventaire.js'
import { COULEUR_IA, estCouleurIA } from '../../../shared/identite.js'

export function acceptChange(view, change) {
  if (change.type === 'lot') {
    // Membre après membre, en relisant le document à chaque fois : une
    // décision change les positions des suivantes.
    for (let m = membresDuLot(view.state.doc, change); m.length; m = membresDuLot(view.state.doc, change)) {
      acceptChange(view, m[0])
    }
    return
  }
  const tr = view.state.tr
  if (change.type === 'remplacement') {
    // Accepter le tout : la proposition entre dans le texte (on retire
    // seulement la marque d'insertion) et l'ancien texte barré s'efface
    // pour de bon. La marque retirée d'abord, quelle que soit l'action,
    // parce qu'elle ne change jamais la taille du document — la
    // suppression, elle, en change une, alors elle passe en dernier pour
    // ne jamais invalider les positions de l'autre moitié (voir
    // pairReplacements : l'insertion précède toujours la suppression dans
    // le document, donc l'ordre ici est sans risque dans les deux sens,
    // mais autant garder une seule règle facile à vérifier).
    tr.removeMark(change.insertion.from, change.insertion.to, view.state.schema.marks.insertion)
    retirerTexte(view.state, tr, change.deletion.from, change.deletion.to)
    tr.setMeta('trackChangesInternal', true)
    view.dispatch(tr)
    return
  }
  if (change.type === 'break') {
    // Accepter un saut de paragraphe en attente : juste effacer le
    // marqueur, la coupure elle-même reste (c'est déjà l'état réel du
    // document depuis la frappe/le collage — voir rewriteSplitForTracking).
    const node = view.state.doc.nodeAt(change.from)
    if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, trackedBreak: null })
  } else if (change.noeud) {
    // Une note : accepter son insertion, c'est lever l'attente ; accepter
    // sa suppression, c'est la retirer.
    const node = view.state.doc.nodeAt(change.from)
    if (node && change.type === 'deletion') tr.delete(change.from, change.to)
    else if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, suivi: null })
  } else {
    const markType = view.state.schema.marks[change.type]
    if (change.type === 'deletion') retirerTexte(view.state, tr, change.from, change.to)
    else tr.removeMark(change.from, change.to, markType)
  }
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

/** Retire [from, to) — et le **bloc entier** si ce passage en était tout le
 * contenu (17/09/2026).
 *
 * Sans ça, une réécriture de paragraphe par l'IA (voir BIG_REWRITE_RATIO :
 * l'ancien paragraphe barré, le nouveau ajouté en dessous) laissait à
 * l'acceptation un paragraphe vide à la place de l'ancien — un saut de
 * ligne en trop, à chaque paragraphe réécrit, que personne n'avait demandé.
 * Le rejet laissait symétriquement un paragraphe vide à la place du
 * nouveau.
 *
 * Un bloc vide volontairement laissé par quelqu'un n'est pas concerné : on
 * ne retire que le bloc dont on vient de vider le contenu. Et jamais le
 * dernier bloc du document, qui ne peut pas ne pas exister. */
function retirerTexte(state, tr, from, to) {
  const $from = state.doc.resolve(from)
  const profondeur = $from.depth
  if (profondeur > 0 && state.doc.childCount > 1) {
    const debutContenu = $from.start(profondeur)
    const finContenu = $from.end(profondeur)
    const memeBloc = to <= finContenu
    if (memeBloc && from === debutContenu && to === finContenu) {
      tr.delete($from.before(profondeur), $from.after(profondeur))
      return
    }
  }
  tr.delete(from, to)
}

export function rejectChange(view, change) {
  if (change.type === 'lot') {
    for (let m = membresDuLot(view.state.doc, change); m.length; m = membresDuLot(view.state.doc, change)) {
      rejectChange(view, m[0])
    }
    return
  }
  const tr = view.state.tr
  if (change.type === 'remplacement') {
    // Rejeter le tout : la proposition disparaît (l'insertion est
    // vraiment retirée) et l'ancien texte est restauré (on retire
    // seulement sa marque de suppression). Même règle d'ordre que dans
    // acceptChange ci-dessus.
    tr.removeMark(change.deletion.from, change.deletion.to, view.state.schema.marks.deletion)
    retirerTexte(view.state, tr, change.insertion.from, change.insertion.to)
    tr.setMeta('trackChangesInternal', true)
    view.dispatch(tr)
    return
  }
  if (change.type === 'break') {
    // Rejeter un saut de paragraphe : le seul moyen de vraiment l'annuler
    // est de refusionner les deux blocs qu'il a créés — l'exact inverse
    // structurel du split d'origine. canJoin est vrai dans le cas courant
    // (les deux blocs viennent du même nœud d'origine, donc du même type)
    // mais plus forcément si l'un des deux a changé de type entre-temps
    // (ex. transformé en titre) — dans ce cas plus rare, on se contente
    // d'effacer le marqueur : le saut reste, mais cesse d'être "en
    // attente" plutôt que de planter sur un join impossible.
    if (canJoin(view.state.doc, change.from)) {
      tr.join(change.from)
    } else {
      const node = view.state.doc.nodeAt(change.from)
      if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, trackedBreak: null })
    }
  } else if (change.noeud) {
    // Rejeter l'insertion d'une note, c'est la retirer ; rejeter sa
    // suppression, c'est lever l'attente.
    const node = view.state.doc.nodeAt(change.from)
    if (node && change.type === 'insertion') tr.delete(change.from, change.to)
    else if (node) tr.setNodeMarkup(change.from, null, { ...node.attrs, suivi: null })
  } else {
    const markType = view.state.schema.marks[change.type]
    if (change.type === 'insertion') retirerTexte(view.state, tr, change.from, change.to)
    else tr.removeMark(change.from, change.to, markType)
  }
  tr.setMeta('trackChangesInternal', true)
  view.dispatch(tr)
}

export function acceptAllChanges(view) {
  for (let changes = listChanges(view.state.doc); changes.length; changes = listChanges(view.state.doc)) {
    acceptChange(view, changes[0])
  }
}

/** Le vert de l'IA, que le serveur donne aux agents invités (Claude) et
 * que les couleurs de participants n'utilisent jamais (server/users.js). */
export const COULEUR_AGENT = COULEUR_IA

/**
 * Cette modification est-elle celle d'une IA (Margo, ou Claude invité) ? Le
 * vert réservé et un nom qui commence par « Margo » (« Margo (IA) », l'IA du
 * panneau et du dialogue) ou « Claude » (« Claude (pour Sylvain) », le
 * connecteur). Les deux à la fois : une personne qui s'appelle Margo ou
 * Claude n'a pas ce vert. Les anciennes modifications de l'IA, signées
 * « IA », n'en font pas partie.
 */
export function estModificationDAgent(change) {
  return estCouleurIA(change.userColor) && /^(Claude|Margo)(\s|$)/.test(change.user || '')
}

/** Rejette d'un coup toutes les modifications d'un agent invité, sans
 * toucher à celles des personnes. Renvoie combien d'entrées ont été
 * rejetées. */
export function rejectAgentChanges(view) {
  const deClaude = () => listChanges(view.state.doc).filter(estModificationDAgent)
  let rejetees = 0
  // Le plafond n'est là que pour qu'un rejet qui ne retire rien ne boucle pas.
  for (let a = deClaude(); a.length && rejetees < 100_000; a = deClaude()) {
    rejectChange(view, a[0])
    rejetees++
  }
  return rejetees
}

export function rejectAllChanges(view) {
  for (let changes = listChanges(view.state.doc); changes.length; changes = listChanges(view.state.doc)) {
    rejectChange(view, changes[0])
  }
}
