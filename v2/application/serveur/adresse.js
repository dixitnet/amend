// Petits outils d'adresse partagés par les routes du serveur.

/** Un segment d'adresse décodé, ou `null` s'il est mal formé (« %E0 »). */
export function decoder(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/** L'adresse d'une requête pour le journal, sans le jeton secret d'une
 * connexion (`/api/connexion/<jeton>` devient `/api/connexion/***`). */
export function adresseSansSecret(url) {
  return String(url ?? '').replace(/^(\/api\/connexion\/)[^/?#]+/, '$1***')
}
