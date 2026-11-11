// Les règles des dossiers d'équipe (couche domaine), étape 6d, d'après
// l'étude arbitrée (docs/v2-etude-dossiers-equipes.md) et le plan de la 6d
// (Sylvain, 09/11/2026) : une équipe est un dossier d'équipe ; chaque membre
// a un rôle pour tout le dossier ; le gestionnaire a les droits du
// propriétaire (rôle `proprietaire`, affiché « gestionnaire ») ; l'équipe
// possède ses documents ; jamais aucun gestionnaire. Des codes, jamais des phrases.
import { ROLES } from './droits.js'

/**
 * Peut-on changer (ou retirer : `nouveau === null`) le rôle `actuel` d'un
 * membre ? Seul un gestionnaire gère les membres. Rend `null` ou un code.
 * @param {readonly string[]} caps  celles de qui agit, d'après son rôle de membre
 * @param {string | null} actuel
 * @param {string | null} nouveau
 * @param {number} gestionnaires  le nombre de gestionnaires de l'équipe
 */
export function refusMembre(caps, actuel, nouveau, gestionnaires) {
  if (!caps.includes('transferer')) return 'droit-insuffisant'
  if (nouveau !== null && !ROLES.includes(nouveau)) return 'role-invalide'
  if (actuel === 'proprietaire' && nouveau !== 'proprietaire' && gestionnaires <= 1) return 'dernier-gestionnaire'
  return null
}

/** Partir d'une équipe : toujours, sauf le dernier gestionnaire. */
export const refusDepart = (actuel, gestionnaires) =>
  actuel === 'proprietaire' && gestionnaires <= 1 ? 'dernier-gestionnaire' : null

/** Gérer les dossiers d'une équipe (créer, renommer, déplacer, supprimer
 * vide) et y créer ou déplacer des documents : un membre au moins éditeur. */
export const peutModifierEquipe = (capsMembre) => capsMembre.includes('ecrire')

/** Renommer ou supprimer (vide) une équipe, gérer ses membres : le gestionnaire. */
export const peutGererEquipe = (capsMembre) => capsMembre.includes('transferer')

/** Créer, modifier, supprimer les modèles de mise en page de l'équipe et
 * choisir son modèle par défaut : le gestionnaire (Sylvain, 10/11/2026, Q3). */
export const peutGererModeles = (capsMembre) => peutGererEquipe(capsMembre)

/**
 * Déplacer un document vers un espace (Mes documents : `null`, ou une
 * équipe). Rend `{ action }` (`ranger`, `entrer`, `sortir`) ou `{ code }`.
 * - Dans Mes documents : son propriétaire, s'il est rangé chez lui.
 * - Entrer dans une équipe : le même, s'il est au moins éditeur de l'équipe ;
 *   ses propriétaires en deviennent éditeurs (arbitrage 4.1).
 * - Dans l'équipe : un membre au moins éditeur.
 * - Sortir de l'équipe : un gestionnaire ; le document va dans ses documents
 *   et il en devient propriétaire (arbitrage 5.1).
 * - D'une équipe à une autre : non (en deux temps).
 * @param {{ source: string | null, destination: string | null, emplacementEstMoi: boolean,
 *   capsDocument: readonly string[], capsSource: readonly string[], capsDestination: readonly string[] }} o
 *   `capsSource` et `capsDestination` : d'après mon rôle de membre de chaque équipe
 */
export function deplacementDocument({
  source,
  destination,
  emplacementEstMoi,
  capsDocument,
  capsSource,
  capsDestination,
}) {
  const refus = { code: 'droit-insuffisant' }
  if (source === null) {
    if (!emplacementEstMoi || !capsDocument.includes('ranger')) return refus
    if (destination === null) return { action: 'ranger' }
    return peutModifierEquipe(capsDestination) ? { action: 'entrer' } : refus
  }
  if (destination === source) return peutModifierEquipe(capsSource) ? { action: 'ranger' } : refus
  if (destination === null) return peutGererEquipe(capsSource) ? { action: 'sortir' } : refus
  return { code: 'deplacement-impossible' }
}
