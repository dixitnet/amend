// Les consignes de Margo (règle 30) : des textes pour le modèle, par langue
// du document, versionnés avec le code mais hors du code. Format ICU, comme
// les catalogues de l'interface. Tout document est en français pour le moment
// (renoncement n° 14) : le catalogue anglais viendra avec un texte qui le demande.
import { IntlMessageFormat } from 'intl-messageformat'
import fr from './consignes/fr.json' with { type: 'json' }

const CONSIGNES = { fr }

/** La consigne `cle` (`margo`, `outils.lire`, `refus.introuvable`…) dans la
 * langue du document, avec ses paramètres. Une clé absente lève une erreur :
 * Margo ne part jamais sans sa consigne. */
export function consigne(cle, parametres = {}, langue = 'fr') {
  const catalogue = CONSIGNES[langue] ?? CONSIGNES.fr
  const texte = cle.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), catalogue)
  if (typeof texte !== 'string') throw new Error(`consigne absente : ${cle}`)
  return String(new IntlMessageFormat(texte, langue).format(parametres))
}
