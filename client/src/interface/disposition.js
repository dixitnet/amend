// La disposition des volets (lot L1, revu au lot L4 le 21/10/2026 ; première
// pièce de la couche « coquille » de claude/architecture-interface-trois-
// plateformes.md).
//
// La règle de Sylvain : la barre d'édition est fixe et alignée sur le bord
// gauche du texte ; ouvrir ou fermer un volet ne la bouge pas. Le texte ne
// doit donc pas bouger non plus — ou du strict nécessaire.
//
// Un volet ouvert se pose toujours **par-dessus le fond**, dans la marge à
// côté du texte. Trois cas, du plus doux au plus rude :
//   1. la marge naturelle suffit (elle peut même faire rétrécir le volet
//      jusqu'à son minimum) : le texte ne bouge pas ;
//   2. elle ne suffit pas : le texte glisse **de ce qu'il faut**, pas plus ;
//   3. même ainsi il n'y a pas la place : la colonne de texte se rétrécit
//      entre les volets ; et si elle descendrait sous sa largeur minimale,
//      la gouttière des commentaires se replie (ils passent dans le volet
//      Modifications), pour rendre sa largeur au texte.
// Un texte caché est pire qu'un texte déplacé ; un texte déplacé est pire
// qu'un texte qui ne bouge pas.
//
// Une fonction pure, testée sans navigateur : les largeurs entrent, les
// mesures sortent.

export const SUPERPOSE = 'superpose'
export const FERME = 'ferme'

/** Marge que le texte garde, au minimum, contre un bord ou un volet. */
export const MARGE_MINIMALE = 40

function placer({ largeur, groupe, gauche, droite, marge }) {
  const naturelle = Math.max(0, (largeur - groupe) / 2)
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x))
  // Un volet ouvert prend la marge qu'on lui laisse, entre son minimum et sa
  // largeur pleine.
  const wG = gauche.ouvert ? clamp(naturelle, gauche.minimum ?? gauche.largeur, gauche.largeur) : 0
  const wD = droite.ouvert ? clamp(naturelle, droite.minimum ?? droite.largeur, droite.largeur) : 0
  const bas = Math.max(wG, marge)
  const haut = largeur - Math.max(wD, marge)
  let decalage = 0 // > 0 : le texte glisse vers la droite
  let padG
  let padD
  let utile // largeur dont dispose le groupe
  if (groupe <= haut - bas) {
    const x = clamp(naturelle, bas, haut - groupe)
    decalage = x - naturelle
    padG = decalage > 0 ? Math.round(2 * decalage) : 0
    padD = decalage < 0 ? Math.round(-2 * decalage) : 0
    utile = groupe
  } else {
    // Plus la place : le groupe se rétrécit entre les deux volets.
    padG = Math.round(bas)
    padD = Math.round(largeur - haut)
    utile = haut - bas
  }
  return { wG, wD, padG, padD, decalage, utile }
}

/**
 * @param {object} o
 * @param {number} o.largeur   largeur de la zone sous la rangée (sans barre de défilement)
 * @param {number} o.texte     largeur de la colonne de texte à sa mesure naturelle (marges intérieures comprises)
 * @param {number} o.gouttiere largeur actuelle de la gouttière des commentaires, marge comprise
 * @param {number} o.gouttiereMax largeur qu'elle prend quand elle est peuplée (0 : elle n'existe pas ici)
 * @param {number} [o.texteMinimal] largeur au-dessous de laquelle la colonne ne doit pas descendre
 * @param {{ouvert:boolean, largeur:number, minimum?:number}} o.gauche
 * @param {{ouvert:boolean, largeur:number, minimum?:number}} o.droite
 * @param {boolean} [o.tiroirs]   format M : volets par-dessus le texte, qui ne bouge pas
 * @returns {{gauche:string, droite:string, largeurGauche:number, largeurDroite:number,
 *            margeGauche:number, margeDroite:number, gouttiere:boolean}}
 */
export function calculerDisposition({
  largeur,
  texte,
  gouttiere = 0,
  gouttiereMax = gouttiere,
  texteMinimal = 560,
  gauche,
  droite,
  marge = MARGE_MINIMALE,
  tiroirs = false,
}) {
  // Format M, sous 1 100 px (lot M2) : les volets sont des **tiroirs**. Ils se
  // posent par-dessus le texte, à leur largeur pleine, sans jamais le
  // déplacer ni le rétrécir ; la gouttière n'existe pas à cette largeur. Le
  // texte reste éditable à côté (un tiroir n'est pas modal) ; une seule
  // chose ne change pas : un tiroir ne couvre jamais plus de 80 % de l'écran.
  if (tiroirs) {
    const plafond = Math.floor(largeur * 0.8)
    return {
      gauche: gauche.ouvert ? SUPERPOSE : FERME,
      droite: droite.ouvert ? SUPERPOSE : FERME,
      largeurGauche: gauche.ouvert ? Math.min(gauche.largeur, plafond) : 0,
      largeurDroite: droite.ouvert ? Math.min(droite.largeur, plafond) : 0,
      margeGauche: 0,
      margeDroite: 0,
      gouttiere: false,
    }
  }
  // La gouttière ne se replie pas parce qu'elle est peuplée un instant : on
  // juge au pire (peuplée), pour que l'écran ne saute pas à chaque commentaire.
  let avec = gouttiereMax > 0
  if (avec) {
    const pire = placer({ largeur, groupe: texte + gouttiereMax, gauche, droite, marge })
    if (pire.utile - gouttiereMax < texteMinimal) avec = false
  }
  const p = placer({ largeur, groupe: texte + (avec ? gouttiere : 0), gauche, droite, marge })
  return {
    gauche: gauche.ouvert ? SUPERPOSE : FERME,
    droite: droite.ouvert ? SUPERPOSE : FERME,
    largeurGauche: Math.floor(p.wG),
    largeurDroite: Math.floor(p.wD),
    margeGauche: p.padG,
    margeDroite: p.padD,
    gouttiere: avec,
  }
}

/** Le décalage à donner à la barre d'édition pour que ses outils commencent
 * au bord gauche du texte (jamais moins que `minimum`). */
export function decalageBarre({ gaucheBarre, bordTexte, minimum = 8 }) {
  return Math.max(minimum, Math.round(bordTexte - gaucheBarre))
}
