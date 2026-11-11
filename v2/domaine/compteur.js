// Le compteur d'un document (couche 4) : signes, espaces compris, et mots
// (règle 5 de CLAUDE.md : les signes d'abord). Même règle que la v1
// (client/src/wordcount.js) : un signe est un caractère tapé, sans séparateur
// ajouté entre deux blocs ; les mots se comptent aux blancs, deux blocs
// voisins ne collant jamais leurs mots. Compté en NFC : une lettre accentuée
// vaut un signe, même arrivée décomposée.

/**
 * @param {string[]} textes  le texte de chaque bloc, dans l'ordre
 * @returns {{ signes: number, mots: number }}
 */
export function compter(textes) {
  let signes = 0
  let mots = 0
  for (const brut of textes) {
    const t = String(brut ?? '').normalize('NFC')
    signes += [...t].length
    const nus = t.trim()
    if (nus) mots += nus.split(/\s+/u).length
  }
  return { signes, mots }
}

// La table des matières insérée dans le texte (renoncement n° 5 levé le
// 11/11/2026) : les titres jusqu'à une profondeur choisie, de 1 à 5 (les
// niveaux de titre du livre), 2 par défaut (Sylvain, 11/11/2026 : « donner le
// choix, idem v1 »).
export const PROFONDEURS_TABLE = [1, 2, 3, 4, 5]
export const PROFONDEUR_TABLE_PAR_DEFAUT = 2

/** Une profondeur permise, ou celle par défaut. */
export function profondeurTable(valeur) {
  const n = Number(valeur)
  return PROFONDEURS_TABLE.includes(n) ? n : PROFONDEUR_TABLE_PAR_DEFAUT
}

/**
 * Les entrées d'une table des matières : les titres non vides dont le niveau
 * ne dépasse pas la profondeur, dans l'ordre du texte.
 * @param {Array<{ niveau: number, texte: string }>} titres
 * @param {number} profondeur
 */
export function entreesTable(titres, profondeur) {
  const p = profondeurTable(profondeur)
  return titres.filter((t) => t.niveau <= p && String(t.texte ?? '').trim())
}
