// Margo, l'IA d'amend.ink (couche domaine, étape 8 : docs/v2-etape-8-plan.md).
// Les règles, en JavaScript pur : comment le texte est montré au modèle, comment
// une proposition retrouve son passage, ce qui la fait refuser, et les
// garde-fous d'une demande. Les consignes (textes pour le modèle) sont dans
// v2/i18n/consignes/ (règle 30) ; les droits dans droits.js (`utiliserMargo`).
import { typographier } from './typographie.js'

/** Garde-fous d'une demande (repris de la v1, où ils ont fait leurs preuves :
 * server/garde-fous.js, `margoEtapes` et `margoRefusEnSerie`). */
export const GARDE_FOUS_MARGO = Object.freeze({
  /** Tours du modèle au plus pour une demande ; au-delà, un bilan sans outil. */
  etapes: 100,
  /** Écritures refusées en entier d'affilée : au seuil, Margo est avertie ;
   * au double, la demande s'arrête sur un bilan. */
  refusEnSerie: 5,
})

/** Les signes d'un texte, espaces compris (règle 5 de CLAUDE.md : la seule unité). */
export const signes = (texte) => [...String(texte ?? '')].length

/**
 * Le texte montré à Margo : un bloc par ligne, précédé de son numéro entre
 * crochets (`[12] …`), le même que celui qu'elle cite dans ses réponses ; un
 * titre porte son niveau (`[3] (titre 2) …`).
 * @param {Array<{ n: number, texte: string, titre?: number | null }>} blocs
 */
export function texteNumerote(blocs) {
  return blocs.map((b) => `[${b.n}] ${b.titre ? `(titre ${b.titre}) ` : ''}${b.texte}`).join('\n')
}

/**
 * La portée d'une demande, en numéros de blocs : la sélection (`de` à `a`), ou
 * tout le texte. Une sélection hors du document ou à l'envers vaut tout le texte.
 * @returns {{ type: 'selection', de: number, a: number } | { type: 'document' }}
 */
export function porteeMargo(brute, nombreDeBlocs) {
  const de = Number(brute?.de)
  const a = Number(brute?.a)
  if (
    brute?.type === 'selection' &&
    Number.isSafeInteger(de) &&
    Number.isSafeInteger(a) &&
    de >= 1 &&
    de <= a &&
    a <= nombreDeBlocs
  )
    return { type: 'selection', de, a }
  return { type: 'document' }
}

/** Espaces insécables, apostrophes et tirets : Margo écrit rarement les mêmes
 * que le texte. Un signe pour un signe, pour que les positions trouvées sur le
 * texte normalisé valent pour l'original (v1, `normaliser`). */
export function normaliser(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[\u00a0\u202f\u2009\u2007]/g, ' ')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')
}

function occurrences(texte, motif) {
  const r = []
  for (let i = texte.indexOf(motif); i !== -1; i = texte.indexOf(motif, i + 1)) r.push(i)
  return r
}

/**
 * Où remplacer `avant` par `apres` dans le texte d'un bloc. Le passage doit y
 * être une fois exactement (aux espaces, apostrophes et tirets près). Le nouveau
 * texte est typographié selon les règles du document (étape 4).
 * @param {string} texte  le texte du bloc, tel qu'il se lit avec les suggestions en cours
 * @returns {{ ok: true, debut: number, fin: number, apres: string } | { ok: false, motif: 'vide' | 'introuvable' | 'ambigu' | 'identique' }
 * (un motif de refus pour Margo, pas un code d'erreur : la personne ne le voit pas)}
 */
export function situerRemplacement(texte, avant, apres) {
  const a = String(avant ?? '').normalize('NFC')
  if (!a) return { ok: false, motif: 'vide' }
  const t = String(texte ?? '').normalize('NFC')
  const ou = occurrences(normaliser(t), normaliser(a))
  if (!ou.length) return { ok: false, motif: 'introuvable' }
  if (ou.length > 1) return { ok: false, motif: 'ambigu' }
  const debut = ou[0]
  const fin = debut + a.length
  const nouveau = typographier(String(apres ?? '').normalize('NFC'), { avant: t.slice(0, debut) })
  // Un remplacement qui ne change rien (ou seulement des espaces, apostrophes
  // ou tirets équivalents) noierait la relecture (leçon de la v1).
  if (normaliser(nouveau) === normaliser(t.slice(debut, fin))) return { ok: false, motif: 'identique' }
  return { ok: true, debut, fin, apres: nouveau }
}

/**
 * Le compte des écritures refusées d'affilée. `noter(acceptee)` rend la suite :
 * `continuer`, `avertir` (au seuil : Margo doit passer à autre chose) ou
 * `arreter` (au double : la demande finit sur un bilan). Une écriture
 * acceptée, même en partie, remet le compte à zéro.
 */
export function suiviDesRefus(seuil = GARDE_FOUS_MARGO.refusEnSerie) {
  let suite = 0
  return {
    noter(acceptee) {
      suite = acceptee ? 0 : suite + 1
      if (suite >= seuil * 2) return 'arreter'
      if (suite === seuil) return 'avertir'
      return 'continuer'
    },
  }
}
