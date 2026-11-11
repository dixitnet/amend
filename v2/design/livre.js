// Les modèles de mise en page des livres (règle 21), tels que décidés dans
// les réglages (`livre`, ADR 0008) : ceux d'amend.ink, et les règles des
// modèles d'équipe (réglages ouverts, catalogue des polices ; ADR 0011).
import { REGLAGES_LIVRE } from './reglagesLivre.js'

export const MODELES_LIVRE = REGLAGES_LIVRE.modeles

/** Ce qu'une équipe peut changer dans un modèle, et ce qui le borne. */
export const REGLES_MODELES = Object.freeze({
  reglables: REGLAGES_LIVRE.reglables,
  polices: REGLAGES_LIVRE.polices,
  largeurUtileMin: REGLAGES_LIVRE.largeurUtileMin,
})
