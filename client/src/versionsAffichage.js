// Ce que la page des versions écrit à l'écran, sans toucher au DOM : de
// petites fonctions pures, testables (client/test/versionsAffichage.test.js).

import { diffWords } from './diff.js'

export function dateLisible(ts) {
  if (!ts) return 'date inconnue'
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ORIGINES = {
  nommee: 'Version nommée',
  session: 'Fin d’une session de travail',
  compactage: 'Enregistrée automatiquement',
  'avant-restauration': 'Avant une restauration',
}

/** Le titre et le détail d'une version dans la liste : son nom si elle en a
 * un, sinon d'où elle vient. */
export function libelleVersion(v) {
  const origine = ORIGINES[v.origine] || 'Version enregistrée'
  return {
    titre: v.nom || origine,
    detail: [dateLisible(v.ts), v.nom ? origine : null, v.par ? `par ${v.par}` : null].filter(Boolean).join(' — '),
    nommee: !!v.nom,
  }
}

export const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`

/** « 2 paragraphes modifiés, 1 ajouté, 3 supprimés — 120 identiques ». */
export function resumeComparaison(c) {
  const compte = { modifie: 0, ajoute: 0, supprime: 0 }
  for (const x of c.changements) compte[x.type]++
  const morceaux = []
  if (compte.modifie) morceaux.push(pluriel(compte.modifie, 'paragraphe modifié', 'paragraphes modifiés'))
  if (compte.ajoute) morceaux.push(pluriel(compte.ajoute, 'ajouté', 'ajoutés'))
  if (compte.supprime) morceaux.push(pluriel(compte.supprime, 'supprimé', 'supprimés'))
  if (!morceaux.length) return 'Aucune différence de texte.'
  return `${morceaux.join(', ')} — ${pluriel(c.identiques, 'paragraphe identique', 'paragraphes identiques')}.`
}

/** Un bloc modifié, mot à mot : `[{ type: 'equal'|'delete'|'insert', text }]`. */
export function segmentsDeDiff(avant, apres) {
  return diffWords(avant, apres)
}

/** Ce qu'une restauration va faire (ou vient de faire), en une phrase. */
export function phraseRestauration(r, { auFutur = true } = {}) {
  const { modifies, ajoutes, supprimes } = r.stats
  const morceaux = []
  if (modifies) morceaux.push(pluriel(modifies, 'paragraphe retouché', 'paragraphes retouchés'))
  if (ajoutes) morceaux.push(pluriel(ajoutes, 'paragraphe rétabli', 'paragraphes rétablis'))
  if (supprimes)
    morceaux.push(pluriel(supprimes, 'paragraphe proposé à la suppression', 'paragraphes proposés à la suppression'))
  if (!morceaux.length) return 'Le texte du document est déjà celui de cette version : rien à restaurer.'
  return `${auFutur ? 'Seront proposés' : 'Ont été proposés'} en suivi de modifications : ${morceaux.join(', ')}.`
}
