// La page « Mes documents » : ce qui se calcule sans toucher au DOM
// (12/10/2026, claude/conception-dossiers-corbeille.md). Le rangement est
// personnel — dossiers, favoris, emplacement de chaque document — et le
// serveur (server/rangement.js) en tient le registre ; ici on ne fait que
// composer ce qu'on montre : les favoris en haut, le contenu du dossier
// ouvert, ou les résultats d'une recherche qui traverse tous les dossiers.

import { libelleDuRole } from '../../shared/identite.js'

/** Les dossiers vont jusqu'à trois niveaux (la racine ne compte pas). Le
 * serveur est seul juge ; cette valeur sert à ne pas proposer ce qu'il
 * refuserait. */
export const PROFONDEUR_MAX = 3

export const TRIS = [
  { cle: 'recents', libelle: 'Modifiés récemment' },
  { cle: 'titre', libelle: 'Titre (A → Z)' },
  { cle: 'creation', libelle: 'Créés récemment' },
]

/** Ce qu'on est sur ce document, pour le badge à côté du titre.
 *
 * Toujours quelque chose : « propriétaire », puis le rôle. La propriété
 * l'emporte parce qu'elle est plus forte que le rôle — un propriétaire est
 * éditeur de toute façon, et c'est la propriété qui explique le bouton de
 * corbeille plutôt que « Quitter ».
 *
 * Le repli sur la valeur brute du rôle est délibéré : le jour où
 * « lecteur » entrera dans `server/roles.js`, le badge l'affichera sans
 * qu'on touche à ce fichier. Un rôle inconnu vaut mieux affiché tel quel
 * que disparu. */
export function libelleRole(doc) {
  if (doc.jeSuisProprietaire) return { cle: 'proprietaire', libelle: 'propriétaire' }
  if (!doc.myRole) return null
  return { cle: doc.myRole, libelle: libelleDuRole(doc.myRole) }
}

/** Pour comparer des titres : sans accents ni majuscules. « Été » se trouve
 * en tapant « ete ». */
export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** Les dossiers de la racine jusqu'à `id` (lui compris). Tolère un dossier
 * inconnu (liste vide) et une boucle (qui ne devrait pas exister). */
export function chemin(dossiers, id) {
  const parId = new Map((dossiers || []).map((d) => [d.id, d]))
  const sortie = []
  const vus = new Set()
  let courant = id
  while (courant && parId.has(courant) && !vus.has(courant)) {
    vus.add(courant)
    const d = parId.get(courant)
    sortie.unshift(d)
    courant = d.parent || null
  }
  return sortie
}

/** 0 pour la racine, 1 pour un dossier de premier niveau, etc. */
export function profondeur(dossiers, id) {
  return id ? chemin(dossiers, id).length : 0
}

export function peutCreerDans(dossiers, id) {
  return profondeur(dossiers, id) < PROFONDEUR_MAX
}

export function libelleChemin(dossiers, id) {
  return chemin(dossiers, id)
    .map((d) => d.nom)
    .join(' › ')
}

/** Le dossier d'un document, ou la racine si ce dossier n'existe plus. */
function dossierDe(doc, ids) {
  return doc.dossier && ids.has(doc.dossier) ? doc.dossier : null
}

/** Combien de documents dans chaque dossier, sous-dossiers compris. */
export function compter(dossiers, docs) {
  const ids = new Set(dossiers.map((d) => d.id))
  const total = new Map(dossiers.map((d) => [d.id, 0]))
  for (const doc of docs) {
    for (const d of chemin(dossiers, dossierDe(doc, ids))) total.set(d.id, total.get(d.id) + 1)
  }
  return total
}

const collateur = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

export function trier(docs, tri) {
  const copie = [...docs]
  if (tri === 'titre') return copie.sort((a, b) => collateur.compare(a.title || 'Sans titre', b.title || 'Sans titre'))
  if (tri === 'creation') return copie.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return copie.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/** Tous les dossiers dans l'ordre d'un menu : chacun suivi de ses
 * sous-dossiers, par ordre alphabétique, avec son niveau d'indentation. */
export function arbre(dossiers) {
  const ids = new Set(dossiers.map((d) => d.id))
  const fils = (parent) =>
    dossiers
      .filter((d) => (d.parent && ids.has(d.parent) ? d.parent : null) === parent)
      .sort((a, b) => collateur.compare(a.nom, b.nom))
  const sortie = []
  const descendre = (parent, niveau) => {
    for (const d of fils(parent)) {
      sortie.push({ dossier: d, niveau })
      descendre(d.id, niveau + 1)
    }
  }
  descendre(null, 1)
  return sortie
}

/** Les destinations du menu « Déplacer vers… ». */
export function optionsDeplacement(dossiers) {
  return [
    { id: '', libelle: 'Mes documents (hors dossier)' },
    ...arbre(dossiers).map(({ dossier, niveau }) => ({
      id: dossier.id,
      libelle: `${'  '.repeat(niveau - 1)}${dossier.nom}`,
    })),
  ]
}

/**
 * Ce que la page montre.
 *
 * - `favoris` : toujours, quel que soit le dossier ouvert (ils tiennent
 *   lieu de raccourcis), avec l'emplacement de chacun.
 * - Sans recherche : les sous-dossiers du dossier ouvert (avec leur
 *   effectif) et les documents qui s'y trouvent directement.
 * - Avec une recherche : une liste plate de tous les documents dont le titre
 *   contient les mots tapés, dossiers ignorés, chacun avec son emplacement.
 */
export function construireVue({ docs, dossiers, courant = null, recherche = '', tri = 'recents' }) {
  const ids = new Set(dossiers.map((d) => d.id))
  const ouvert = courant && ids.has(courant) ? courant : null
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
  const correspond = (doc) => {
    if (!mots.length) return true
    const titre = normaliser(doc.title || 'Sans titre')
    return mots.every((m) => titre.includes(m))
  }
  const avecChemin = (doc) => ({ doc, emplacement: libelleChemin(dossiers, dossierDe(doc, ids)) })

  const favoris = trier(docs.filter((d) => d.starred && correspond(d)), tri).map(avecChemin)
  const fil = chemin(dossiers, ouvert)

  if (mots.length) {
    return {
      ouvert,
      fil,
      recherche: true,
      favoris,
      sousDossiers: [],
      documents: trier(docs.filter(correspond), tri).map(avecChemin),
    }
  }

  const effectifs = compter(dossiers, docs)
  const sousDossiers = arbre(dossiers)
    .filter(({ dossier }) => (dossier.parent && ids.has(dossier.parent) ? dossier.parent : null) === ouvert)
    .map(({ dossier }) => ({ dossier, effectif: effectifs.get(dossier.id) || 0 }))
  return {
    ouvert,
    fil,
    recherche: false,
    favoris,
    sousDossiers,
    documents: trier(docs.filter((d) => dossierDe(d, ids) === ouvert), tri).map(avecChemin),
  }
}

/** « 12/10/2026 » — la date à laquelle un document est entré dans la corbeille. */
export function dateCorbeille(entree) {
  const le = entree && entree.corbeille && entree.corbeille.le
  if (!le) return ''
  return new Date(le).toLocaleDateString('fr-FR')
}
