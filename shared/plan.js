// Le plan du document — **les règles que l'éditeur et la page publiée
// partagent** (10/10/2026).
//
// Le plan de l'éditeur (client/src/outline.js) liste les titres du
// document ; la page publiée (server/publication.js) montre le même plan
// en colonne latérale. Les deux doivent dire la même chose d'un même
// document : quels niveaux de titre existent, comment s'appelle un titre
// vide, à partir de quand un plan vaut la peine d'être montré. Ces trois
// règles vivent ici, et nulle part ailleurs, pour qu'elles ne divergent pas
// en silence — le jour où l'éditeur passera à quatre niveaux, la page
// publiée suivra sans qu'on y pense.

import { NIVEAUX_TITRE } from './style.js'

/** Le niveau d'indentation d'un titre dans le plan : de 1 à NIVEAUX_TITRE.
 * Un document ancien peut porter un `h4` ou un `h5` (la page publiée en
 * accepte jusqu'à cinq) : il se range au dernier niveau du plan. */
export function niveauDuPlan(niveau) {
  const n = Math.round(Number(niveau)) || 1
  return Math.min(NIVEAUX_TITRE, Math.max(1, n))
}

/** Le texte d'une ligne du plan. Un titre vide reste une ligne — on doit
 * pouvoir le retrouver pour le remplir —, sous le nom « (sans titre) ». */
export function intituleDuPlan(texte) {
  const t = String(texte == null ? '' : texte).replace(/\s+/g, ' ').trim()
  return t || '(sans titre)'
}

/** Combien de titres faut-il pour qu'un plan serve à quelque chose à un
 * lecteur ? Un seul titre ne s'oriente pas : la page publiée n'affiche le
 * plan qu'à partir de deux. (L'éditeur, lui, le montre toujours : celui qui
 * écrit y voit aussi son premier titre apparaître.) */
export const TITRES_MIN_POUR_UN_PLAN_PUBLIE = 2
