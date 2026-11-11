// Margo, l'IA d'amend.ink (couche domaine, étape 8 : docs/v2-etape-8-plan.md).
// Les règles, en JavaScript pur : comment le texte est montré au modèle, comment
// une proposition retrouve son passage, ce qui la fait refuser, et les
// garde-fous d'une demande. Les consignes (textes pour le modèle) sont dans
// v2/i18n/consignes/ (règle 30) ; les droits dans droits.js (`utiliserMargo`).
import { typographier } from './typographie.js'

/** L'auteur des suggestions et des commentaires de Margo, pour y/hub et les
 * fils (les personnes ont des identifiants UUID : pas de collision). */
export const AUTEUR_MARGO = 'margo'

/** Garde-fous d'une demande (repris de la v1, où ils ont fait leurs preuves :
 * server/garde-fous.js, `margoEtapes` et `margoRefusEnSerie`). */
export const GARDE_FOUS_MARGO = Object.freeze({
  /** Tours du modèle au plus pour une demande ; au-delà, un bilan sans outil. */
  etapes: 100,
  /** Écritures refusées en entier d'affilée : au seuil, Margo est avertie ;
   * au double, la demande s'arrête sur un bilan. */
  refusEnSerie: 5,
})

/** La demande d'une personne à Margo : au plus ce nombre de signes ; les
 * échanges précédents renvoyés par le navigateur, au plus ce nombre (les plus
 * récents d'abord ; audit du 10/11/2026, A2). Bornes techniques, pas des tarifs. */
export const MARGO_DEMANDE_MAX_SIGNES = 4000
export const MARGO_HISTORIQUE_MAX_SIGNES = 20000

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

/** Espaces insécables, apostrophes et tirets : un signe pour un signe (v1),
 * pour que les positions trouvées valent pour l'original. */
const memesSignes = (s) =>
  String(s ?? '')
    .replace(/[\u00a0\u202f\u2009\u2007]/g, ' ')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')

/** Pour comparer ou chercher (sans positions) : NFC, puis espaces,
 * apostrophes et tirets ramenés à un seul signe ; Margo écrit rarement les
 * mêmes que le texte. */
export const normaliser = (s) => memesSignes(String(s ?? '').normalize('NFC'))

function occurrences(texte, motif) {
  const r = []
  for (let i = texte.indexOf(motif); i !== -1; i = texte.indexOf(motif, i + 1)) r.push(i)
  return r
}

/**
 * Où se trouve un passage dans le texte d'un bloc : une fois exactement, aux
 * espaces, apostrophes et tirets près. Les positions valent pour le texte tel
 * qu'il est reçu : un texte collé en NFD (décomposé) se cherche sous cette
 * forme, sans le recomposer (audit du 10/11/2026, A1).
 * @returns {{ ok: true, debut: number, fin: number } | { ok: false, motif: 'vide' | 'introuvable' | 'ambigu' }}
 * (un motif de refus pour Margo, pas un code d'erreur : la personne ne le voit pas)
 */
export function situerCitation(texte, citation) {
  const c = String(citation ?? '')
  if (!c) return { ok: false, motif: 'vide' }
  const t = memesSignes(texte)
  const trouves = new Map()
  for (const forme of new Set([c.normalize('NFC'), c.normalize('NFD'), c]))
    for (const i of occurrences(t, memesSignes(forme)))
      trouves.set(`${i}:${forme.length}`, { debut: i, fin: i + forme.length })
  if (!trouves.size) return { ok: false, motif: 'introuvable' }
  if (trouves.size > 1) return { ok: false, motif: 'ambigu' }
  return { ok: true, ...[...trouves.values()][0] }
}

/**
 * Où remplacer `avant` par `apres` dans le texte d'un bloc (voir
 * `situerCitation`). Le nouveau texte est en NFC et typographié selon les
 * règles du document (étape 4). Un remplacement qui ne change rien (ou
 * seulement des espaces, apostrophes ou tirets équivalents) est refusé : il
 * noierait la relecture (leçon de la v1).
 * @param {string} texte  le texte du bloc, tel qu'il se lit avec les suggestions en cours
 * @returns {{ ok: true, debut: number, fin: number, apres: string } | { ok: false, motif: 'vide' | 'introuvable' | 'ambigu' | 'identique' }}
 */
export function situerRemplacement(texte, avant, apres) {
  const ou = situerCitation(texte, avant)
  if (!ou.ok) return ou
  const t = String(texte ?? '')
  // Jamais deux espaces de suite dans un texte de Margo ; d'une suite mêlée,
  // on garde la plus forte (fine, puis insécable) : banc du 11/11/2026, où
  // Margo écrivait une insécable suivie d'une espace avant « : ».
  const resserre = String(apres ?? '')
    .normalize('NFC')
    .replace(/[ \u00a0\u202f]{2,}/g, (m) => (m.includes('\u202f') ? '\u202f' : m.includes('\u00a0') ? '\u00a0' : ' '))
  const nouveau = typographier(resserre, { avant: t.slice(0, ou.debut) })
  if (normaliser(nouveau) === normaliser(t.slice(ou.debut, ou.fin))) return { ok: false, motif: 'identique' }
  return { ok: true, debut: ou.debut, fin: ou.fin, apres: nouveau }
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
