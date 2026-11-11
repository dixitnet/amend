// La corbeille, la copie d'un document et le tri des listes (couche domaine,
// lots du 11/11/2026, `docs/v2-lots-2026-11-11-plan.md`, lot A), sur le modèle
// de Docs : suppression douce gardée 30 jours (`TRASHBIN_CUTOFF_DAYS`),
// restaurée par le propriétaire ; copie titrée « … (copie) ».

/** Durée pendant laquelle un document supprimé reste dans la corbeille (Docs : 30 jours). */
export const DUREE_CORBEILLE_MS = 30 * 24 * 3600 * 1000

/** Vrai si un document supprimé à `supprimeLe` (ms) peut encore être restauré à `maintenant`. */
export const dansLaCorbeille = (supprimeLe, maintenant = Date.now()) =>
  Number.isFinite(supprimeLe) && maintenant - supprimeLe < DUREE_CORBEILLE_MS

/** Les jours restants avant l'effacement définitif (au moins 0, arrondi au-dessus). */
export const joursRestants = (supprimeLe, maintenant = Date.now()) =>
  Math.max(0, Math.ceil((supprimeLe + DUREE_CORBEILLE_MS - maintenant) / (24 * 3600 * 1000)))

const LONGUEUR_MAX_TITRE = 200

/**
 * Le titre d'une copie : `gabarit(titre)` (la phrase vient du catalogue de la
 * langue du document, par exemple « {titre} (copie) »). Si le résultat dépasse
 * la longueur d'un titre, l'original est raccourci, avec « … », pour garder la
 * marque de la copie (comme Docs, `_get_copy_title`). Un document sans titre
 * donne `gabarit(sansTitre)`.
 * @param {string | null} titre
 * @param {(titre: string) => string} gabarit
 * @param {string} sansTitre
 */
export function titreDeCopie(titre, gabarit, sansTitre) {
  const base = [...(titre || sansTitre)]
  const complet = [...gabarit(base.join(''))]
  const exces = complet.length - LONGUEUR_MAX_TITRE
  if (exces <= 0) return complet.join('')
  const court = [...gabarit(`${base.slice(0, Math.max(1, base.length - exces - 1)).join('')}…`)]
  // Un gabarit très long peut dépasser seul la borne : le résultat est borné, en points de code.
  return court.slice(0, LONGUEUR_MAX_TITRE).join('')
}

/**
 * Où ranger la copie d'un document pour qui la demande : à côté de l'original
 * s'il peut y écrire (même équipe ou ses documents, même dossier), sinon à la
 * racine de ses documents (un document partagé avec lui, une équipe où il ne
 * fait que lire).
 * @param {{ section: string, equipe: string | null, dossier: string | null }} original
 * @param {boolean} peutEcrireDansLEquipe
 * @returns {{ equipe: string | null, dossier: string | null }}
 */
export function lieuDeLaCopie(original, peutEcrireDansLEquipe) {
  if (original.equipe) return peutEcrireDansLEquipe ? { equipe: original.equipe, dossier: original.dossier } : RACINE
  if (original.section === 'mes-documents') return { equipe: null, dossier: original.dossier ?? null }
  return RACINE
}
const RACINE = Object.freeze({ equipe: null, dossier: null })

/** Les ordres de tri des listes de documents (v1 : modifiés, titre, créés). */
export const ORDRES_TRI = Object.freeze(['modifies', 'titre', 'crees'])

/**
 * Trie des documents (`{ titre, creeLe, modifieLe }`) selon `ordre` ; le
 * titre se compare dans la langue de l'interface, sans casse ; un titre absent
 * passe en dernier ; à égalité, le plus récemment créé d'abord.
 * @param {Array<{ titre: string | null, creeLe: number, modifieLe?: number }>} documents
 * @param {string} ordre
 * @param {string} langue
 */
export function trierDocuments(documents, ordre, langue = 'fr') {
  const recent = (a, b) => b.creeLe - a.creeLe
  const modifie = (d) => d.modifieLe ?? d.creeLe
  // Un ordre inconnu vaut le premier de la liste (modifiés).
  const ordreRetenu = ORDRES_TRI.includes(ordre) ? ordre : ORDRES_TRI[0]
  const comparer =
    ordreRetenu === 'titre'
      ? (a, b) =>
          (a.titre ? 0 : 1) - (b.titre ? 0 : 1) ||
          (a.titre && b.titre ? a.titre.localeCompare(b.titre, langue, { sensitivity: 'base' }) : 0) ||
          recent(a, b)
      : ordreRetenu === 'crees'
        ? recent
        : (a, b) => modifie(b) - modifie(a) || recent(a, b)
  return [...documents].sort(comparer)
}
