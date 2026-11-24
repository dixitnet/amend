// CORRECTIF TEMPORAIRE (veille : Yjs 14, `DiffRenderer`, constaté en rc.29 et
// rc.30 le 24/11/2026). À débrancher quand l'amont l'aura corrigé : retirer
// l'appel de `brancherCorrectifForme` dans `suggestions.js`, ce fichier et son
// test (`tests/unitaires/correctif-forme.test.js`). Rien d'autre n'en dépend.
// Réexamen : à chaque montée de `@y/y`, et au plus tard le 13/12/2026 (veille,
// docs/v2-veille.md). Ticket amont : à ouvrir (texte prêt dans la veille).
//
// Le défaut : quand on retire une mise en forme (gras, italique, lien…) en
// voyant les suggestions, des marqueurs de mise en forme sont supprimés dans
// le texte. L'afficheur annonce alors leurs identifiants (`'change'`), et Yjs
// les redessine comme un caractère supprimé chacun : à l'écran, une lettre
// disparaît à chaque bord du passage, qui reste marqué « modification de mise
// en forme » ; le document, lui, est juste (tout revient au rechargement).
//
// Le correctif : dans l'annonce de l'afficheur, remplacer les identifiants des
// marqueurs supprimés par ceux du texte de leur paragraphe, que Yjs redessine
// alors correctement. Seule la surface publique de Yjs est utilisée
// (`iterateStructsByIdSet`, `IdSet`, les champs `left`, `right`, `parent`,
// `content` d'un élément, les événements `beforeObserverCalls` du document et
// `'change'` de l'afficheur) ; écart assumé, noté dans la veille : ces champs ne
// sont pas documentés comme stables, et `emit` et `destroy` de l'afficheur sont
// enveloppés. À vérifier à chaque montée.
//
// Limite connue : une correction en attente (ajout ou suppression suggérés)
// prise dans le passage garde, jusqu'au rechargement, la marque de mise en
// forme en plus de la sienne.
import * as Y from '@y/y'

const estMarqueur = (element) => element instanceof Y.Item && element.content instanceof Y.ContentFormat

/** Les identifiants du contenu (hors marqueurs) du paragraphe d'un élément. */
function contenuDuParagraphe(element, dans) {
  let debut = element
  while (debut.left) debut = debut.left
  for (let e = debut; e; e = e.right) {
    if (!e.deleted && !estMarqueur(e)) dans.add(e.id.client, e.id.clock, e.length)
  }
}

/**
 * Prépare le correctif sur le document du texte. À appeler AVANT de créer
 * l'afficheur : l'écoute doit passer avant la sienne.
 * @param {any} texte  le document du texte
 * @returns {(afficheur: any) => void}  à appeler avec l'afficheur créé
 */
export function preparerCorrectifForme(texte) {
  /** Les marqueurs supprimés par la transaction en cours, et le texte à redessiner. */
  let marqueurs = null
  let aRedessiner = null
  const avant = (tr) => {
    marqueurs = null
    aRedessiner = null
    if (tr.deleteSet.isEmpty()) return
    const vus = new Set()
    Y.iterateStructsByIdSet(tr, tr.deleteSet, (element) => {
      if (!estMarqueur(element)) return
      marqueurs ??= Y.createIdSet()
      aRedessiner ??= Y.createIdSet()
      marqueurs.add(element.id.client, element.id.clock, element.length)
      if (vus.has(element.parent)) return
      vus.add(element.parent)
      contenuDuParagraphe(element, aRedessiner)
    })
  }
  texte.on('beforeObserverCalls', avant)
  return (afficheur) => {
    const emettre = afficheur.emit
    afficheur.emit = function (nom, args) {
      if (nom !== 'change' || !marqueurs) return emettre.call(this, nom, args)
      const [changes, ...reste] = args
      const corriges = Y.mergeIdSets([Y.diffIdSet(changes, marqueurs), aRedessiner])
      marqueurs = null
      aRedessiner = null
      return emettre.call(this, nom, [corriges, ...reste])
    }
    // L'écoute part avec l'afficheur.
    const detruire = afficheur.destroy
    afficheur.destroy = function () {
      texte.off('beforeObserverCalls', avant)
      return detruire.call(this)
    }
  }
}
