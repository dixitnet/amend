// Les textes de Margo côté technique : ce qu'elle fait, pourquoi elle s'arrête,
// et sa réponse en morceaux.
import { t } from './commun.js'

/** Ce que fait Margo pendant une demande (événements du serveur). */
export const MARGO_EN_COURS = {
  reflexion: () => t('margo.enCours.reflexion'),
  lire: () => t('margo.enCours.lire'),
  chercher: () => t('margo.enCours.chercher'),
  proposer: () => t('margo.enCours.proposer'),
  commenter: () => t('margo.enCours.commenter'),
  repli: () => t('margo.enCours.repli'),
}
/** Pourquoi une demande s'est arrêtée avant la fin (codes du serveur). */
export const MARGO_ARRET = {
  etapes: () => t('margo.arret.etapes'),
  'refus-en-serie': () => t('margo.arret.refusEnSerie'),
  longueur: () => t('margo.arret.longueur'),
  refus: () => t('margo.arret.refus'),
  erreur: () => t('margo.arret.erreur'),
}

/** Le texte d'une réponse de Margo en morceaux : texte, et liens vers les
 * blocs qu'elle cite ([12]) ; les marques de gras du Markdown sont retirées. */
export function morceauxDeMargo(m, allerAuBloc) {
  return String(m.texte)
    .replace(/\*\*|__/g, '')
    .split(/(\[\d+\])/)
    .filter(Boolean)
    .map((x) => {
      const n = /^\[(\d+)\]$/.exec(x)?.[1]
      const id = n ? m.blocs?.[n] : null
      return id
        ? { lien: x, libelle: t('margo.allerAuBloc', { n: Number(n) }), surClic: () => allerAuBloc(id) }
        : { texte: x }
    })
}
