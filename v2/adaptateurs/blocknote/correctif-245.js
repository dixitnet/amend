// CORRECTIF TEMPORAIRE (veille : y-prosemirror#245, « la frappe au contact
// d'une suggestion la prolonge »). À débrancher quand l'amont l'aura corrigé :
// retirer l'appel de `brancherCorrectif245` dans `suggestions.js`, ce fichier
// et son test (`tests/unitaires/correctif-245.test.js`). Rien d'autre n'en
// dépend. Réexamen : à chaque montée de `@y/y` ou de `@y/prosemirror`, et au
// plus tard le 13/12/2026 (veille, docs/v2-veille.md).
//
// La cause (Yjs 14, `DiffRenderer`) : quand on écrit directement en voyant les
// suggestions, la frappe va dans le document des suggestions, puis l'afficheur
// la recopie dans le texte. Mais un caractère tapé contre un ajout suggéré
// s'accroche à cet ajout (son voisin de gauche ou de droite), qui n'existe pas
// dans le texte : la recopie reste en attente, et la frappe demeure une
// suggestion, collée à celle du correcteur.
//
// Le correctif : avant la recopie, repérer une frappe qui s'accroche à une
// suggestion ; retenir la recopie de l'afficheur pour cette transaction ; puis
//  - si ce n'est que du texte tapé : l'écrire directement dans le texte, à la
//    place équivalente, et retirer la frappe du document des suggestions ;
//  - sinon (coupure de paragraphe, collage riche…) : ne rien recopier ; le
//    changement reste une suggestion de la personne, sans rien en attente.
// Seule la surface publique de Yjs est utilisée : ses exports
// (`iterateStructsByIdSet`, positions relatives, `IdSet`) et le réglage
// documenté `suggestionOrigins` de l'afficheur.
import * as Y from '@y/y'

/** L'origine de nos propres transactions (réparation, nettoyage). */
const ORIGINE = { correctif: 245 }

/** Un identifiant existe-t-il déjà dans ce document ? */
const connu = (etats, id) => id == null || (etats.get(id.client) ?? 0) > id.clock

/** La position, dans un type du document `doc`, d'un élément connu par son identifiant. */
const positionDe = (id, doc) =>
  Y.createAbsolutePositionFromRelativePosition(
    Y.createRelativePositionFromJSON({ item: { client: id.client, clock: id.clock }, assoc: 0 }),
    doc,
  )

/** Le même type, dans l'autre document (`null` s'il n'y existe pas). */
function memeType(type, autre) {
  const repere = Y.createRelativePositionFromTypeIndex(type, 0, -1)
  // Un type vide ou pris par son début est désigné par lui-même (son nom à la
  // racine, sinon son identifiant) ; s'il a un contenu, par son parent : on
  // lit alors le parent du premier élément.
  const ici = Y.createAbsolutePositionFromRelativePosition(repere, autre)
  return ici?.type ?? null
}

/** L'indice, dans le texte, d'un indice du document des suggestions : les
 * ajouts suggérés n'y comptent pas, les suppressions suggérées y comptent. */
function indiceDansLeTexte(type, afficheur, indice) {
  let cote = 0
  let texte = 0
  for (const op of type.toDelta({ renderer: afficheur }).toJSON().children ?? []) {
    if (op.type !== 'insert') continue
    // Une chaîne, ou une liste d'éléments en ligne (un appel de note) : sa longueur.
    const longueur = op.insert.length
    const ajoute = Boolean(op.attribution?.insert)
    const supprime = Boolean(op.attribution?.delete)
    // Longueur dans le document des suggestions : tout sauf le supprimé.
    const ici = supprime && !ajoute ? 0 : longueur
    if (cote + ici > indice) return texte + (ajoute ? 0 : indice - cote)
    cote += ici
    if (!ajoute) texte += longueur
  }
  return texte
}

/**
 * Branche le correctif sur un afficheur des suggestions.
 * @param {any} afficheur  le `DiffRenderer` de Yjs
 * @param {any} texte      le document du texte
 * @param {any} cote       le document des suggestions
 * @param {(apres: any) => void} [surReplace]  la frappe a été replacée dans
 *   le texte : la position (relative, de Yjs) juste après elle, pour y
 *   remettre le curseur
 * @returns {() => void}   pour débrancher
 */
export function brancherCorrectif245(afficheur, texte, cote, surReplace) {
  /** Les frappes à réparer, une fois les transactions finies. */
  let aReparer = []
  /** La recopie de l'afficheur est retenue : ses origines d'avant. */
  let retenue = null
  const retenir = () => {
    if (retenue) return
    retenue = { origines: afficheur.suggestionOrigins }
    afficheur.suggestionOrigins = []
  }
  const relacher = () => {
    if (!retenue) return
    afficheur.suggestionOrigins = retenue.origines
    retenue = null
  }

  const avant = (tr) => {
    // Chaque transaction est jugée pour elle-même.
    relacher()
    if (!tr.local || afficheur.suggestionMode) return
    // Nos propres transactions de nettoyage ne sont jamais recopiées.
    if (tr.origin === ORIGINE) return retenir()
    const etats = Y.decodeStateVector(Y.encodeStateVector(texte))
    const nouveaux = []
    let accroche = false
    Y.iterateStructsByIdSet(tr, tr.insertSet, (element) => {
      if (!(element instanceof Y.Item)) return
      nouveaux.push(element)
      // S'accrocher à un élément créé dans la même transaction ne compte pas.
      const dehors = (id) => id != null && !tr.insertSet.hasId(id) && !connu(etats, id)
      if (dehors(element.origin) || dehors(element.rightOrigin)) accroche = true
    })
    if (!accroche) return
    retenir()
    // Réparable : seulement du texte tapé, sans rien de supprimé.
    const simple = nouveaux.every((e) => typeof e.content?.str === 'string') && tr.deleteSet.isEmpty()
    if (simple) aReparer.push(...nouveaux.map((e) => ({ id: e.id, texte: e.content.str })))
  }

  const apres = () => {
    relacher()
    // La réparation attend la fin de la frappe en cours dans l'éditeur (sa
    // liaison avec Yjs n'a pas fini de l'écrire) : juste après, avant toute
    // autre touche.
    if (aReparer.length) queueMicrotask(reparer)
  }

  const reparer = () => {
    const frappes = aReparer
    aReparer = []
    for (const frappe of frappes) {
      const ou = positionDe(frappe.id, cote)
      const cible = ou && memeType(ou.type, texte)
      // Le paragraphe lui-même n'est qu'une suggestion : la frappe le reste aussi.
      if (!cible) continue
      const indice = indiceDansLeTexte(ou.type, afficheur, ou.index)
      // Dans le texte, directement : l'afficheur le reporte dans les suggestions.
      texte.transact(() => cible.insert(indice, frappe.texte), ORIGINE)
      // Puis la frappe d'origine quitte le document des suggestions.
      const maintenant = positionDe(frappe.id, cote)
      if (maintenant) cote.transact(() => maintenant.type.delete(maintenant.index, frappe.texte.length), ORIGINE)
      // La frappe a pu passer de l'autre côté de la correction : le curseur la suit.
      surReplace?.(Y.createRelativePositionFromTypeIndex(cible, indice + frappe.texte.length, -1))
    }
    relacher()
  }

  cote.on('beforeObserverCalls', avant)
  cote.on('afterAllTransactions', apres)
  return () => {
    cote.off('beforeObserverCalls', avant)
    cote.off('afterAllTransactions', apres)
    relacher()
  }
}

/**
 * Reste-t-il des corrections à arbitrer ? L'afficheur compte aussi ce qui a été
 * ajouté puis supprimé du seul côté des suggestions (une frappe que le
 * correctif a replacée, ou une correction que son auteur a effacée) : il n'y a
 * là plus rien à accepter ni à refuser.
 * @param {any} afficheur  le `DiffRenderer` de Yjs
 * @param {any} cote       le document des suggestions
 */
export function resteDesCorrections(afficheur, cote) {
  if (afficheur.attributed.isEmpty()) return false
  // Un ajout suggéré déjà supprimé du côté des suggestions : une trace morte.
  // (Une suppression suggérée d'un passage du texte, elle, n'est pas un ajout :
  // elle reste à arbitrer.)
  const supprimes = Y.createDeleteSetFromStructStore(cote.store)
  const mortes = Y.intersectSets(Y.createIdSetFromIdMap(afficheur.inserts), supprimes)
  return !Y.diffIdSet(afficheur.attributed, mortes).isEmpty()
}
