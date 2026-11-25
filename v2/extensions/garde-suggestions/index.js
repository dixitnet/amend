// Extension de BlockNote (couche 3) : le garde-fou du mode Éditer, contournement
// temporaire de défauts de `@y/prosemirror` et de Yjs (y-prosemirror#245, veille ;
// Sylvain, 12/11/2026). En Éditer, les corrections sont affichées et la frappe
// va dans le texte. Depuis le 24/11/2026 (Sylvain : « le limiter drastiquement
// au seul évitement des bugs »), il ne refuse que les gestes mesurés comme
// destructeurs, garde-fou désactivé, dans la pile (essai du 24/11/2026,
// docs/v2-tests/essai-garde-fou-2026-11-24.md) :
//  1. effacer ou remplacer le contenu même d'une correction (elle disparaît
//     sans trace, ou celle d'un autre est rognée) ;
//  2. déplacer une correction : couper le paragraphe avant elle, fusionner son
//     paragraphe dans le précédent, changer le type de son bloc (titre, liste) :
//     le texte supprimé et le texte ajouté deviennent tous deux du texte
//     ordinaire (« était » → « étais » donnait « étaits ») ;
//  3. insérer autre chose que du texte, ou remplacer une sélection, exactement
//     au contact d'une correction (de son début au signe qui suit sa fin) :
//     l'ajout s'y mêle et part si on la refuse. La frappe simple passe : le
//     correctif `correctif-245.js` la replace dans le texte (`frappeReparee`).
// Libres, mesurés sans dommage : effacer le signe juste avant ou juste après,
// écrire et effacer dans les mots voisins, mettre en forme (même par-dessus),
// coller à côté, couper le paragraphe après la correction, y fusionner le
// suivant. Les « modifications de mise en forme » (`y-attributed-format`) ne
// sont pas protégées : aucune correction de mise en forme n'existe chez nous,
// seuls des artefacts d'affichage portent cette marque (un commentaire
// supprimé ou résolu bloquait ainsi les mots autour de lui).
// Elle laisse passer ce qui vient de la collaboration (autres personnes,
// acceptation et refus des corrections). Chaque refus appelle `refuser(code)`,
// au plus une fois par seconde, pour que l'application le dise.
// À retirer quand l'amont corrige ces défauts.
// Écrite comme si elle devait partir en amont : BlockNote et ProseMirror seulement.
import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'

const CODE = 'edition-contre-suggestion'

/** Les marques par lesquelles `@y/prosemirror` montre une correction à arbitrer. */
const MARQUES = new Set(['y-attributed-insert', 'y-attributed-delete'])

const correction = (noeud) => noeud.marks.some((m) => MARQUES.has(m.type.name))

/**
 * Les corrections d'un bloc de texte, en positions relatives au bloc (0 = début
 * de son contenu) : chaque suite de contenus marqués, sans marge.
 * @param {import('prosemirror-model').Node} bloc
 * @returns {Array<[number, number]>}
 */
export function zonesDuBloc(bloc) {
  const plages = []
  bloc.forEach((enfant, decalage) => {
    if (!correction(enfant)) return
    const fin = decalage + enfant.nodeSize
    const derniere = plages[plages.length - 1]
    if (derniere && derniere[1] === decalage) derniere[1] = fin
    else plages.push([decalage, fin])
  })
  return plages
}

/** Les corrections (positions du document) des blocs de texte que touche [de, a]. */
function corrections(doc, de, a) {
  const plages = []
  const debut = Math.max(0, Math.min(de, a))
  const fin = Math.min(doc.content.size, Math.max(de, a))
  doc.nodesBetween(debut, fin, (noeud, pos) => {
    if (!noeud.isTextblock) return true
    for (const [x, y] of zonesDuBloc(noeud)) plages.push([pos + 1 + x, pos + 1 + y])
    return false
  })
  return plages
}

/** La plage [de, a] recouvre-t-elle le contenu d'une correction (au moins un signe) ? */
export function recouvreUneCorrection(doc, de, a) {
  return de < a && corrections(doc, de, a).some(([x, y]) => x < a && y > de)
}

/** La position est-elle au contact d'une correction : de son début au signe qui suit sa fin ? */
export function auContactDUneCorrection(doc, pos) {
  return corrections(doc, pos, pos).some(([x, y]) => x <= pos && pos <= y + 1)
}

/** La fin du contenu du bloc de texte où tombe `pos` (ou `pos`, hors d'un bloc de texte). */
function finDuBloc(doc, pos) {
  const $pos = doc.resolve(pos)
  return $pos.parent.isTextblock ? $pos.end() : pos
}

/** Une transaction vient-elle de la collaboration plutôt que de la personne ?
 * (Conventions publiques de `@y/prosemirror` : `y-sync-transaction` est posé
 * sur tout ce que la liaison applique, la clé `y-sync$` sur ses commandes.) */
const collaboration = (tr) =>
  tr.getMeta('y-sync-transaction') != null || tr.getMeta('y-sync$') != null || tr.getMeta('y-sync-append') != null

/** Un morceau de document n'est-il fait que de texte, refermé ? */
function texteSeul(tranche) {
  if (!tranche || tranche.openStart !== 0 || tranche.openEnd !== 0 || tranche.content.childCount === 0) return false
  let texte = true
  tranche.content.forEach((n) => {
    if (!n.isText) texte = false
  })
  return texte
}

/** Le texte ajouté a-t-il la mise en forme du point d'insertion ? (La frappe, ou un texte brut collé :
 * le correctif ne replace que cela ; un texte collé avec sa propre mise en forme resterait pris dans
 * la correction.) */
function memeForme(tranche, $pos) {
  const propres = (marques) => marques.filter((m) => !m.type.name.startsWith('y-attributed-'))
  const ici = propres($pos.marks())
  let meme = true
  tranche.content.forEach((n) => {
    const siennes = propres(n.marks)
    // Mêmes marques, attributs compris (un lien ou un commentaire d'ailleurs n'est pas « la même forme »).
    if (siennes.length !== ici.length || !siennes.every((m) => ici.some((autre) => autre.eq(m)))) meme = false
  })
  return meme
}

/**
 * Une étape, appliquée au document `doc`, abîmerait-elle une correction ?
 * @param {any} etape  une étape de ProseMirror
 * @param {import('prosemirror-model').Node} doc  le document d'avant l'étape
 * @param {boolean} frappeReparee  la frappe simple au contact est réparée ailleurs
 */
export function abimeUneCorrection(etape, doc, frappeReparee = false) {
  // Mise en forme, commentaire, attribut d'un bloc : sans dommage.
  if (etape.mark || typeof etape.from !== 'number' || typeof etape.to !== 'number') return false
  const { from: de, to: a, slice: tranche } = etape
  // Un bloc enveloppé, sorti ou changé de type autour de son contenu : le contenu est déplacé.
  if (typeof etape.gapFrom === 'number') return recouvreUneCorrection(doc, de, a)
  if (!tranche) return false
  // 1. Le contenu d'une correction effacé ou remplacé.
  if (recouvreUneCorrection(doc, de, a)) return true
  // 2. Une coupure ou une fusion : tout ce qui suit, jusqu'à la fin du bloc d'arrivée, est déplacé.
  const $de = doc.resolve(de)
  const structure = tranche.openStart > 0 || tranche.openEnd > 0 || !$de.sameParent(doc.resolve(a))
  if (structure) {
    // Un bloc vide qu'on retire devant une correction ne la déplace pas (mesuré : c'est lui qui part).
    if (tranche.content.size === 0 && $de.parent.isTextblock && $de.parent.content.size === 0) return false
    return recouvreUneCorrection(doc, de, finDuBloc(doc, a))
  }
  // 3. Un ajout au contact d'une correction.
  if (tranche.content.size === 0) return false
  const contact = auContactDUneCorrection(doc, de) || auContactDUneCorrection(doc, a)
  if (!contact) return false
  return !(frappeReparee && de === a && texteSeul(tranche) && memeForme(tranche, $de))
}

/** La transaction locale `tr` abîmerait-elle une correction ? */
export function changeUneSuggestion(tr, frappeReparee = false) {
  if (!tr.docChanged || collaboration(tr) || tr.getMeta('appendedTransaction')) return false
  if (!tr.steps.some((etape, i) => abimeUneCorrection(etape, tr.docs[i], frappeReparee))) return false
  return !retireSeulementUnBlocVide(tr)
}

/** Les blocs de texte d'un document, dans l'ordre. */
function blocsDeTexte(doc) {
  const blocs = []
  doc.descendants((noeud) => {
    if (!noeud.isTextblock) return true
    blocs.push(noeud)
    return false
  })
  return blocs
}

/**
 * La transaction ne fait-elle, au bout du compte, que retirer un bloc de texte vide ? BlockNote retire
 * un paragraphe vide placé devant un autre en supprimant celui-ci et en le recopiant à la place du
 * vide : étape par étape, la correction semble déplacée ; au bout du compte rien n'a bougé, et la
 * liaison avec Yjs ne retire que le bloc vide (mesuré le 24/11/2026).
 */
export function retireSeulementUnBlocVide(tr) {
  const avant = blocsDeTexte(tr.before)
  const apres = blocsDeTexte(tr.doc)
  if (apres.length !== avant.length - 1) return false
  let retire = false
  for (let i = 0, j = 0; i < avant.length; i++) {
    if (j < apres.length && avant[i].eq(apres[j])) j++
    else if (!retire && avant[i].content.size === 0) retire = true
    else return false
  }
  return retire
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
          // Même jugement que pour toute transaction, sur la frappe qu'elle ferait.
          handleTextInput: (vue, de, a, texte) =>
            actif() && changeUneSuggestion(vue.state.tr.insertText(texte, de, a), frappeReparee) ? non() : false,
        },
        // Tout le reste (commandes, collage, dépôt, coupe, annulation).
        filterTransaction: (tr) => !(actif() && changeUneSuggestion(tr, frappeReparee) && non()),
      }),
    ],
  }
})
