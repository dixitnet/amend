// Extension de BlockNote (couche 3) : le garde-fou du mode Éditer, contournement
// temporaire d'un défaut de `@y/prosemirror` (y-prosemirror#245, veille ;
// Sylvain, 12/11/2026). En Éditer, les suggestions sont affichées et la frappe
// va dans le texte ; mais un changement au contact d'une suggestion s'y
// mêle : le texte de l'éditeur devient une suggestion, parfois au nom d'un
// autre, et part si on la refuse ; un remplacement qui la chevauche l'efface.
// L'essai du 12/11/2026 (docs/v2-tests/essai-editer-2026-11-12.md) montre que
// l'absorption va de la suggestion jusqu'au signe qui la suit. Par prudence,
// la zone protégée s'étend aux mots qui touchent la suggestion, de part et
// d'autre, espace compris.
// Tant qu'elle est active (`actif()`), elle refuse tout changement du texte,
// par la personne elle-même, qui touche une zone protégée : frappe (refusée
// avant d'atteindre la page), Entrée, Retour arrière, Suppr, collage, dépôt,
// coupe, mise en forme, menu « / », et l'annulation (Ctrl+Z : celle de
// ProseMirror, un changement direct comme un autre). Elle laisse passer ce qui
// vient de la collaboration (autres personnes, acceptation et refus des
// suggestions) et les marques de commentaire. Chaque refus appelle
// `refuser(code)`, au plus une fois par seconde, pour que l'application le dise.
// À retirer quand l'amont corrige y-prosemirror#245.
// Écrite comme si elle devait partir en amont : BlockNote et ProseMirror seulement.
import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'

export const CODE = 'edition-contre-suggestion'

/** Les marques par lesquelles `@y/prosemirror` montre une suggestion. */
const MARQUES = new Set(['y-attributed-insert', 'y-attributed-delete', 'y-attributed-format'])
/** Les marques qu'on peut poser ou retirer près d'une suggestion. */
const MARQUES_LIBRES = new Set(['comment'])
const ESPACE = /\s/

const suggestion = (noeud) => noeud.marks.some((m) => MARQUES.has(m.type.name))

/**
 * Les zones protégées d'un bloc de texte, en positions relatives au bloc
 * (0 = début de son contenu) : chaque suite de contenus marqués comme
 * suggestion, étendue des deux côtés d'au plus une espace puis du mot voisin.
 * @param {import('prosemirror-model').Node} bloc
 * @returns {Array<[number, number]>}
 */
export function zonesDuBloc(bloc) {
  const plages = []
  bloc.forEach((enfant, decalage) => {
    if (!suggestion(enfant)) return
    const fin = decalage + enfant.nodeSize
    const derniere = plages[plages.length - 1]
    if (derniere && derniere[1] === decalage) derniere[1] = fin
    else plages.push([decalage, fin])
  })
  if (!plages.length) return plages
  // Un signe par position (un contenu non textuel compte pour un signe, sans espace).
  const texte = bloc.textBetween(0, bloc.content.size, undefined, '\uFFFC')
  return plages.map(([debut, fin]) => {
    let a = debut
    if (a > 0 && ESPACE.test(texte[a - 1])) a--
    while (a > 0 && !ESPACE.test(texte[a - 1])) a--
    let b = fin
    if (b < texte.length && ESPACE.test(texte[b])) b++
    while (b < texte.length && !ESPACE.test(texte[b])) b++
    return [a, b]
  })
}

/**
 * La plage [de, a] (positions du document, bornes comprises) touche-t-elle une
 * zone protégée ?
 * @param {import('prosemirror-model').Node} doc
 */
export function toucheUneSuggestion(doc, de, a = de) {
  const debut = Math.max(0, Math.min(de, a) - 1)
  const fin = Math.min(doc.content.size, Math.max(de, a) + 1)
  let touche = false
  doc.nodesBetween(debut, fin, (noeud, pos) => {
    if (touche) return false
    if (!noeud.isTextblock) return true
    const base = pos + 1
    touche = zonesDuBloc(noeud).some(([x, y]) => Math.min(de, a) <= base + y && Math.max(de, a) >= base + x)
    return false
  })
  return touche
}

/** Une transaction vient-elle de la collaboration plutôt que de la personne ?
 * (Conventions publiques de `@y/prosemirror` : `y-sync-transaction` est posé
 * sur tout ce que la liaison applique, la clé `y-sync$` sur ses commandes.) */
const collaboration = (tr) =>
  tr.getMeta('y-sync-transaction') != null || tr.getMeta('y-sync$') != null || tr.getMeta('y-sync-append') != null

/** Les plages du document d'avant que touche une étape (bornes comprises). */
function plagesDe(etape) {
  const plages = []
  if (etape.mark && MARQUES_LIBRES.has(etape.mark.type.name)) return plages
  if (typeof etape.from === 'number' && typeof etape.to === 'number' && etape.getMap().ranges.length === 0)
    plages.push([etape.from, etape.to]) // marque ajoutée ou retirée
  else if (typeof etape.pos === 'number') plages.push([etape.pos, etape.pos]) // attribut d'un nœud
  etape.getMap().forEach((a, b) => plages.push([a, b]))
  return plages
}

/** La transaction locale `tr` change-t-elle le texte au contact d'une suggestion ? */
export function changeUneSuggestion(tr) {
  if (!tr.docChanged || collaboration(tr) || tr.getMeta('appendedTransaction')) return false
  return tr.steps.some((etape, i) => {
    const doc = tr.docs[i]
    return plagesDe(etape).some(([de, a]) => toucheUneSuggestion(doc, de, a))
  })
}

/** La transaction n'ajoute-t-elle que du texte, sans rien remplacer ? (La
 * frappe simple, ou le collage d'un texte brut dans une ligne.) */
export function ajouteSeulementDuTexte(tr) {
  return (
    tr.steps.length > 0 &&
    tr.steps.every((etape) => {
      if (typeof etape.from !== 'number' || etape.from !== etape.to || !etape.slice) return false
      const { content, openStart, openEnd } = etape.slice
      let texte = content.childCount > 0
      content.forEach((n) => {
        if (!n.isText) texte = false
      })
      return texte && openStart === 0 && openEnd === 0
    })
  )
}

export const extensionGardeSuggestions = createExtension(({ options }) => {
  const actif = options.actif ?? (() => false)
  // `frappeReparee` : un correctif, ailleurs, répare la frappe simple au
  // contact d'une suggestion ; le garde-fou la laisse alors passer.
  const frappeReparee = options.frappeReparee === true
  const refuser = options.refuser ?? (() => {})
  let dernier = 0
  const non = () => {
    const maintenant = Date.now()
    if (maintenant - dernier > 1000) refuser(CODE)
    dernier = maintenant
    return true
  }
  return {
    key: 'gardeSuggestions',
    prosemirrorPlugins: [
      new Plugin({
        props: {
          // La frappe : refusée avant d'atteindre la page.
          handleTextInput: (vue, de, a) =>
            actif() && !(frappeReparee && de === a) && toucheUneSuggestion(vue.state.doc, de, a) ? non() : false,
        },
        // Tout le reste (commandes, collage, dépôt, coupe, mise en forme).
        filterTransaction: (tr) =>
          !(actif() && changeUneSuggestion(tr) && !(frappeReparee && ajouteSeulementDuTexte(tr)) && non()),
      }),
    ],
  }
})
