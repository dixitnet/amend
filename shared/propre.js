// La propreté des textes qui sortent d'amend.ink (24/10/2026).
//
// Objectif général : des documents les plus propres possible à l'export, pour
// l'édition. Un accent doit être **un seul caractère** (« é », forme NFC),
// pas une lettre suivie d'un accent combinant (« e » + ◌́, forme NFD) : les
// logiciels de composition (InDesign, Typst, Word) posent mal l'accent combinant
// avec certaines polices, les césures et la recherche le coupent, les
// correcteurs le soulignent. Les copier-coller depuis un Mac ou un PDF en
// apportent ; le modèle d'IA, lui, renvoie toujours la forme à un signe.
//
// Les lettres sans forme composée restent décomposées : NFC n'en perd aucune.

/** Le texte en forme composée (NFC). Tout ce qui n'est pas du texte devient
 * une chaîne vide, comme ailleurs dans l'application. */
export function nfc(texte) {
  return String(texte ?? '').normalize('NFC')
}
