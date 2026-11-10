// Les modèles de mise en page des livres (règle 21), tels que décidés dans
// les réglages (`livre`, ADR 0008) : ceux d'amend.ink, et les règles des
// modèles d'équipe (réglages ouverts, catalogue des polices ; ADR 0011).
import { REGLAGES } from './reglages.js'

export const MODELES_LIVRE = REGLAGES.livre.modeles

/** Ce qu'une équipe peut changer dans un modèle, et ce qui le borne. */
export const REGLES_MODELES = Object.freeze({
  reglables: REGLAGES.livre.reglables,
  polices: REGLAGES.livre.polices,
  largeurUtileMin: REGLAGES.livre.largeurUtileMin,
})
