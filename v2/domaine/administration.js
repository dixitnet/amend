// L'administration de l'instance (couche domaine), back-office de la v2
// (Sylvain, 09/11/2026) : les administrateurs sont une liste d'adresses
// tenue dans l'environnement du serveur (comme la v1 ; Docs s'appuie sur
// l'administration de Django et ses comptes « staff »). Une adresse en
// .invalid (comptes de développement et d'essai) n'est jamais administratrice.
import { adresseCourriel } from './partage.js'

const ESSAI = /\.invalid$/i

/** La liste des administrateurs, depuis « a@x.fr, b@y.fr » (adresses
 * normalisées ; les adresses invalides ou en .invalid sont ignorées). */
export function listeAdministrateurs(brut) {
  const liste = new Set()
  for (const morceau of String(brut ?? '').split(/[,;\s]+/)) {
    const a = adresseCourriel(morceau)
    if (a.ok && !ESSAI.test(a.courriel)) liste.add(a.courriel)
  }
  return liste
}

/** Une personne est-elle administratrice de l'instance ? */
export function estAdministrateur(courriel, liste) {
  const a = adresseCourriel(courriel)
  return a.ok && !ESSAI.test(a.courriel) && liste.has(a.courriel)
}

/** Le numéro de version de la v2 (Sylvain, 09/11/2026) : 2.001, 2.002…,
 * d'après le nombre de fusions dans main qui touchent v2/ ; `null` sans dépôt. */
export const numeroDeVersion = (fusions) =>
  Number.isInteger(fusions) && fusions > 0 ? `2.${String(fusions).padStart(3, '0')}` : null

/** L'adresse de l'aide de l'instance (lot du 11/11/2026, comme le
 * `documentation_url` de Docs) : une adresse absolue en http ou https, sans
 * identifiants ; sinon `null` (pas d'entrée « Aide »). */
export function adresseAide(brut) {
  const texte = String(brut ?? '').trim()
  if (!texte) return null
  let u
  try {
    u = new URL(texte)
  } catch {
    return null
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null
  return u.href
}

// --- Le suivi de l'instance (Sylvain, 11/11/2026, « stabiliser, fiabiliser ») ---
/** Le journal du back-office se garde 30 jours, les relevés de mémoire 7 jours. */
export const DUREE_JOURNAL_MS = 30 * 24 * 3600 * 1000
export const DUREE_MESURES_MS = 7 * 24 * 3600 * 1000
/** La mémoire des processus est relevée toutes les cinq minutes. */
export const PAS_MESURE_MS = 5 * 60 * 1000
/** Les processus dont on relève la mémoire. */
export const PROCESSUS_SUIVIS = Object.freeze(['serveur', 'collaboration'])

/** Les refus qui ne font pas partie d'un usage ordinaire : trop de demandes
 * (429), requête trop grosse (413), requête venue d'un autre site. */
const REFUS_NOTES = new Set(['origine-refusee'])

/**
 * Ce que le journal garde d'une réponse du serveur : une erreur à nous (5xx)
 * ou un refus inhabituel ; `null` pour tout le reste (les refus ordinaires,
 * 401, 403, 404, ne sont pas notés).
 * @param {number} statut
 * @param {string | null | undefined} code  le code rendu dans la réponse
 * @returns {{ type: 'erreur' | 'refus', code: string } | null}
 */
export function evenementDeReponse(statut, code) {
  const c = typeof code === 'string' && code ? code : `http-${statut}`
  if (statut >= 500) return { type: 'erreur', code: c }
  if (statut === 429 || statut === 413 || REFUS_NOTES.has(c)) return { type: 'refus', code: c }
  return null
}

/** Un relevé de mémoire reçu d'un processus est-il valable ? (processus connu, octets plausibles) */
export const mesureValable = (processus, memoire) =>
  PROCESSUS_SUIVIS.includes(processus) && Number.isSafeInteger(memoire) && memoire > 0 && memoire < 2 ** 40
