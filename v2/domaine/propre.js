// La propreté des textes qui sortent d'amend.ink (repris de la v1,
// `shared/propre.js`, par copie revue : la v2 n'importe rien de la v1).
//
// Un accent doit être un seul caractère (« é », forme NFC), pas une lettre
// suivie d'un accent combinant (forme NFD) : les logiciels de composition
// posent mal l'accent combinant, la césure et la recherche le coupent. Les
// lettres sans forme composée restent décomposées : NFC n'en perd aucune.

/** Le texte en forme composée (NFC). Ce qui n'est pas du texte devient une
 * chaîne vide. */
export function nfc(texte) {
  return String(texte ?? '').normalize('NFC')
}
