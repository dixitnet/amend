// L'administration de l'instance (couche domaine), back-office de la v2
// (Sylvain, 09/11/2026) : les administrateurs sont une liste d'adresses
// tenue dans l'environnement du serveur (comme la v1 ; Docs s'appuie sur
// l'administration de Django et ses comptes « staff »). Une adresse en
// .invalid (comptes de développement et d'essai) n'est jamais administratrice.
import { adresseCourriel } from './partage.js'

const ESSAI = /\.invalid$/i

/** La liste des administrateurs, depuis « a@x.fr, b@y.fr » (adresses
 * normalisées ; les adresses invalides ou en .invalid sont ignorées). */
export function listeAdministrateurs(brut) {
  const liste = new Set()
  for (const morceau of String(brut ?? '').split(/[,;\s]+/)) {
    const a = adresseCourriel(morceau)
    if (a.ok && !ESSAI.test(a.courriel)) liste.add(a.courriel)
  }
  return liste
}

/** Une personne est-elle administratrice de l'instance ? */
export function estAdministrateur(courriel, liste) {
  const a = adresseCourriel(courriel)
  return a.ok && !ESSAI.test(a.courriel) && liste.has(a.courriel)
}

/** Le numéro de version de la v2 (Sylvain, 09/11/2026) : 2.001, 2.002…,
 * d'après le nombre de fusions dans main qui touchent v2/ ; `null` sans dépôt. */
export const numeroDeVersion = (fusions) =>
  Number.isInteger(fusions) && fusions > 0 ? `2.${String(fusions).padStart(3, '0')}` : null

/** L'adresse de l'aide de l'instance (lot du 11/11/2026, comme le
 * `documentation_url` de Docs) : une adresse absolue en http ou https, sans
 * identifiants ; sinon `null` (pas d'entrée « Aide »). */
export function adresseAide(brut) {
  const texte = String(brut ?? '').trim()
  if (!texte) return null
  let u
  try {
    u = new URL(texte)
  } catch {
    return null
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
  return u.href
}
