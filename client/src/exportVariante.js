// Ce que l'export met dans le fichier — et la question qu'on ne se posait
// pas (19/09/2026).
//
// Jusqu'ici les trois exports prenaient « l'état présent » du document au
// pied de la lettre : les marques du suivi étaient ignorées, et le texte
// qu'elles portent sortait en texte ordinaire **dans les deux sens**. Une
// insertion proposée sortait comme du texte acquis, et un passage barré —
// que personne n'avait accepté de supprimer — sortait comme s'il était
// toujours là. Remplacer « doit » par « peut » donnait un fichier où les
// deux mots se suivaient. Ce n'est pas une version sale, c'est une version
// fausse, et un correcteur, dont les modifications sont toujours en suivi,
// ne pouvait produire aucun fichier utilisable.
//
// Deux sorties, donc, et le choix se fait au moment d'exporter :
//
//   FINAL     — toutes les propositions acceptées. Les insertions
//               deviennent du texte, les passages barrés disparaissent,
//               les marqueurs « !! » aussi : c'est un document à envoyer,
//               il ne doit rien porter qui s'adresse à son auteur.
//   EN_COURS  — le travail en cours, visible : les insertions soulignées,
//               les suppressions barrées, les marqueurs conservés.
//
// Le parti pris qui garde ce fichier petit : on ne touche pas aux
// sérialiseurs. On leur donne un **autre document**, où les marques du
// suivi ont déjà été résolues — en texte pour l'un, en gras/barré ordinaire
// pour l'autre. PDF, Word et Markdown savent déjà rendre `underline` et
// `strike` ; ils n'ont rien à apprendre.
//
// Ce qui se perd volontairement en « version en cours » : la couleur de
// chaque auteur. Un document exporté n'est pas une séance de travail à
// plusieurs, et un PDF où trois relecteurs ont chacun leur teinte se lit
// moins bien qu'un PDF où l'on voit ce qui est proposé.

import { TK_MARKER } from './tkMarker.js'

export const FINAL = 'final'
export const EN_COURS = 'encours'

export const VARIANTES = [
  { id: FINAL, label: 'Document final', aide: 'Toutes les modifications proposées sont acceptées.' },
  { id: EN_COURS, label: 'Version en cours', aide: 'Les modifications proposées restent visibles : ajouts soulignés, suppressions barrées.' },
]

function aLaMarque(node, nom) {
  return node.marks.some((m) => m.type.name === nom)
}

/** Les marques d'un texte, une fois le suivi résolu. */
function marquesResolues(schema, node, mode) {
  // Les marques propres au suivi ne survivent jamais telles quelles : ce
  // sont des marques de travail, pas de mise en forme.
  const gardees = node.marks.filter(
    (m) => !['insertion', 'deletion', 'authorColor'].includes(m.type.name)
  )
  if (mode === FINAL) return gardees
  const ajouts = []
  if (aLaMarque(node, 'insertion') && schema.marks.underline) ajouts.push(schema.marks.underline.create())
  if (aLaMarque(node, 'deletion') && schema.marks.strike) ajouts.push(schema.marks.strike.create())
  return gardees.concat(ajouts)
}

/** Le contenu « inline » d'un bloc, résolu. Renvoie la liste des nœuds. */
function inlineResolu(schema, node, mode) {
  const out = []
  node.forEach((child) => {
    if (!child.isText) {
      // Une image insérée puis proposée à la suppression : même règle que
      // pour le texte.
      if (mode === FINAL && aLaMarque(child, 'deletion')) return
      out.push(child.mark(marquesResolues(schema, child, mode)))
      return
    }
    if (mode === FINAL && aLaMarque(child, 'deletion')) return
    let texte = child.text
    // Les marqueurs « !! » sont des notes à soi-même : ils n'ont rien à
    // faire dans un document qu'on envoie.
    if (mode === FINAL) texte = texte.split(TK_MARKER).join('')
    if (texte === '') return
    out.push(schema.text(texte, marquesResolues(schema, child, mode)))
  })
  return out
}

/** Un bloc, résolu — ou `null` s'il ne doit pas survivre. */
function blocResolu(schema, node, mode) {
  if (node.isTextblock) {
    const contenu = inlineResolu(schema, node, mode)
    // Un bloc vidé par les suppressions disparaît ; un bloc qui était
    // **déjà** vide reste, c'est un blanc voulu par son auteur.
    if (mode === FINAL && contenu.length === 0 && node.content.size > 0) return null
    const attrs =
      mode === FINAL && node.attrs.trackedBreak !== undefined
        ? { ...node.attrs, trackedBreak: null }
        : node.attrs
    return node.type.create(attrs, contenu, node.marks)
  }
  const enfants = []
  node.forEach((child) => {
    const resolu = blocResolu(schema, child, mode)
    if (resolu) enfants.push(resolu)
  })
  // Un conteneur (citation, liste, cellule) dont tout le contenu a été
  // supprimé s'en va avec lui.
  if (mode === FINAL && enfants.length === 0 && node.childCount > 0) return null
  return node.type.create(node.attrs, enfants, node.marks)
}

/**
 * Le document tel qu'il doit être exporté. `doc` n'est jamais modifié :
 * on en construit un autre, que les sérialiseurs reçoivent à sa place.
 */
export function documentPourExport(doc, mode = FINAL) {
  const schema = doc.type.schema
  const blocs = []
  doc.forEach((node) => {
    const resolu = blocResolu(schema, node, mode)
    if (resolu) blocs.push(resolu)
  })
  // Un document entièrement supprimé reste un document : un paragraphe
  // vide plutôt qu'un fichier que Word refuse d'ouvrir.
  if (blocs.length === 0) blocs.push(schema.nodes.paragraph.create())
  return schema.nodes.doc.create(doc.attrs, blocs)
}
