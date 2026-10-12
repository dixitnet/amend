// Ce que les exports ont en commun (point 48 de la feuille de route,
// 11/10/2026) : le nom du fichier tiré du titre, et le téléchargement.
// Markdown, Word et PDF en avaient chacun leur copie.

import { NIVEAUX_TITRE } from '../../shared/style.js'

/** Un nom de fichier sûr à partir du titre du document, sans extension :
 * « Mon Titre » → « Mon Titre ». Les caractères interdits par les systèmes
 * de fichiers deviennent des tirets ; « document » pour un titre vide. */
export function nomDeFichier(titre) {
  const base = (titre || '').trim() || 'document'
  return base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150)
}

/** Déclenche le téléchargement d'un Blob sous le nom `nom` (extension
 * comprise). */
export function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Un niveau de titre ramené entre 1 et le plus profond que le schéma
 * connaît (`NIVEAUX_TITRE`). Une valeur absente ou illisible vaut `defaut`.
 * Word et Typst en avaient chacun deux copies (titres, profondeur de la table
 * des matières). */
export function niveauTitre(valeur, defaut = 1) {
  return Math.min(NIVEAUX_TITRE, Math.max(1, Number(valeur) || defaut))
}
