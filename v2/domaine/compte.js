// La suppression d'un compte (couche domaine, lots du 11/11/2026, lot D), selon
// la règle de la v1 (`server/suppressionCompte.js`, 13/10/2026) : la personne
// s'en va sans détruire le travail des autres, et sans décision silencieuse sur
// lui. Docs ne le fait pas (administration de Django seulement) : écart voulu.
// Les commentaires et suggestions qu'elle laisse restent, sans son nom (les
// noms se lisent par identifiant ; un compte effacé n'en a plus).

/**
 * Ce que deviendrait chaque document et chaque équipe si la personne
 * supprimait son compte. Rien n'est touché ici : c'est l'aperçu montré avant le
 * geste, et le plan que le serveur exécute.
 *
 * Documents qu'elle possède (rôle propriétaire donné en propre) :
 *  - un autre propriétaire existe : elle le quitte (`quitte`) ;
 *  - sinon, un éditeur existe : le plus ancien en devient propriétaire (`confie`) ;
 *  - sinon, seulement des lecteurs ou des correcteurs : **refus** (elle choisit
 *    elle-même à qui le confier) ;
 *  - sinon (personne d'autre) : il est supprimé (`supprime`).
 * Équipes : elle les quitte ; dernier gestionnaire d'une équipe qui a d'autres
 * membres : refus ; seule membre : l'équipe et ses documents sont supprimés.
 *
 * @param {object} o
 * @param {string} o.moi
 * @param {Array<{ id: string, titre: string | null, acces: Array<{ personne: string | null, role: string }> }>} o.documents
 *   ses documents (accès en propre, dans l'ordre où ils ont été donnés)
 * @param {Array<{ id: string, nom: string, membres: Array<{ personne: string, role: string }> }>} o.equipes
 * @returns {{ peut: boolean, documents: Array<{ id: string, titre: string | null, sort: string, a?: string }>,
 *   equipes: Array<{ id: string, nom: string, sort: string }> }}
 */
export function planSuppressionCompte({ moi, documents, equipes }) {
  const docs = documents.map((d) => {
    const autres = d.acces.filter((a) => a.personne && a.personne !== moi)
    const mien = d.acces.find((a) => a.personne === moi)?.role
    if (mien !== 'proprietaire') return { id: d.id, titre: d.titre, sort: 'quitte' }
    if (autres.some((a) => a.role === 'proprietaire')) return { id: d.id, titre: d.titre, sort: 'quitte' }
    const editeur = autres.find((a) => a.role === 'editeur')
    if (editeur) return { id: d.id, titre: d.titre, sort: 'confie', a: editeur.personne }
    if (autres.length) return { id: d.id, titre: d.titre, sort: 'refus' }
    return { id: d.id, titre: d.titre, sort: 'supprime' }
  })
  const eqs = equipes.map((e) => {
    const autres = e.membres.filter((m) => m.personne !== moi)
    const gestionnaire = e.membres.some((m) => m.personne === moi && m.role === 'proprietaire')
    if (!autres.length) return { id: e.id, nom: e.nom, sort: 'supprime' }
    if (gestionnaire && !autres.some((m) => m.role === 'proprietaire')) return { id: e.id, nom: e.nom, sort: 'refus' }
    return { id: e.id, nom: e.nom, sort: 'quitte' }
  })
  return { peut: ![...docs, ...eqs].some((x) => x.sort === 'refus'), documents: docs, equipes: eqs }
}

/** La confirmation : l'adresse du compte, saisie en toutes lettres (v1). */
export const confirmationSuppressionValide = (saisie, courriel) =>
  typeof saisie === 'string' && saisie.trim().toLowerCase() === String(courriel).toLowerCase()
