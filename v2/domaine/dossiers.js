// Les règles des dossiers (couche domaine), étape 6c : le modèle du serveur
// de fichiers d'entreprise (Sylvain, 09/11/2026, sans référence à Docs) :
// « Mes documents » avec des dossiers, « Partagé avec moi », puis les dossiers
// d'équipe (6d). On ne partage que des documents : un dossier de Mes
// documents est un rangement personnel. Des codes, jamais des phrases.

const LONGUEUR_MAX_NOM = 80

/** Le nom d'un dossier : NFC, sans espaces autour, non vide, 80 signes au plus (comme un nom de personne). */
export function nomDossier(brut) {
  if (typeof brut !== 'string') return { ok: false, code: 'nom-vide' }
  const nom = brut.normalize('NFC').trim()
  if (!nom) return { ok: false, code: 'nom-vide' }
  if (nom.length > LONGUEUR_MAX_NOM) return { ok: false, code: 'nom-trop-long' }
  return { ok: true, nom }
}

/**
 * Peut-on mettre le dossier `id` dans `parent` (`null` : à la racine) ?
 * `dossiers` : tous les dossiers de la personne (`{ id, parent }`). Rend
 * `null` si oui, sinon un code : un dossier inconnu, ou une boucle (un
 * dossier dans lui-même ou dans l'un de ses sous-dossiers).
 * @param {ReadonlyArray<{ id: string, parent: string | null }>} dossiers
 * @param {string} id
 * @param {string | null} parent
 */
export function refusDeplacementDossier(dossiers, id, parent) {
  const parents = new Map(dossiers.map((d) => [d.id, d.parent]))
  if (!parents.has(id)) return 'dossier-introuvable'
  if (parent === null) return null
  if (!parents.has(parent)) return 'dossier-introuvable'
  const vus = new Set()
  for (let p = parent; p !== null && p !== undefined && !vus.has(p); p = parents.get(p)) {
    if (p === id) return 'deplacement-circulaire'
    vus.add(p)
  }
  return null
}

/** Où une personne voit un document : dans « Mes documents » s'il est rangé
 * chez elle, sinon dans « Partagé avec moi ». */
export const sectionDuDocument = (emplacement, moi) => (emplacement === moi ? 'mes-documents' : 'partage')

/** Ranger un document dans ses dossiers : son propriétaire, s'il est rangé chez lui. */
export const peutRanger = (caps, emplacement, moi) => emplacement === moi && caps.includes('ranger')

/**
 * Se retirer d'un document (renoncer à son accès) : toujours permis, sauf au
 * dernier propriétaire. Rend `null` ou un code.
 * @param {string | null} actuel  mon rôle donné en propre (hors lien)
 * @param {number} proprietaires
 */
export const refusRetrait = (actuel, proprietaires) =>
  actuel === 'proprietaire' && proprietaires <= 1 ? 'dernier-proprietaire' : null
