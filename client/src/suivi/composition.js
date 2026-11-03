// Une composition (touche morte, méthode de saisie) est-elle en cours dans
// l'éditeur ? Tenu par les évènements compositionstart / compositionend
// (curseursComposition.js), lu par la réécriture en suivi (reecriture.js) :
// la transaction qui ouvre une composition ne porte pas toujours la méta
// `composition` de ProseMirror (sélection sur plusieurs blocs, 03/11/2026).

let enCours = false

export function compositionEnCours() {
  return enCours
}

export function noterComposition(valeur) {
  enCours = !!valeur
}
