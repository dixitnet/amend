// Les textes destinés aux personnes : catalogues par langue, format ICU
// (docs/v2-regles-developpement.md, règles 23 à 31 ; ADR 0009).
// Le français est la langue source ; une clé absente d'une langue retombe sur
// le français, jamais sur la clé elle-même.
import { IntlMessageFormat } from 'intl-messageformat'
import fr from './fr.json' with { type: 'json' }
import en from './en.json' with { type: 'json' }
import { pseudoCatalogue } from './pseudo.js'

export const CATALOGUES = { fr, en }
export const LANGUES = Object.keys(CATALOGUES)
export const LANGUE_SOURCE = 'fr'
export const LANGUE_PSEUDO = 'pseudo'
const CATALOGUES_CONTROLE = {}

/** Les clés d'un catalogue, à plat : `document.titre`, … */
export function cles(catalogue, prefixe = '') {
  return Object.entries(catalogue).flatMap(([k, v]) =>
    v && typeof v === 'object' ? cles(v, `${prefixe}${k}.`) : [`${prefixe}${k}`],
  )
}

function chercher(catalogue, cle) {
  return cle.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), catalogue)
}

/** La langue à utiliser parmi celles qu'on a, d'après une liste de préférences. */
export function choisirLangue(preferences = []) {
  for (const p of preferences) {
    const l = String(p || '')
      .toLowerCase()
      .split('-')[0]
    if (LANGUES.includes(l)) return l
  }
  return LANGUE_SOURCE
}

/** Un traducteur pour une langue : `t('suggestions.titre', { n: 2 })`. */
export function creerTraducteur(langue = LANGUE_SOURCE) {
  // « pseudo » : langue de contrôle, jamais proposée aux personnes (règle 31).
  if (langue === LANGUE_PSEUDO)
    return traducteur(LANGUE_PSEUDO, (CATALOGUES_CONTROLE.pseudo ??= pseudoCatalogue(fr)), 'fr')
  const l = LANGUES.includes(langue) ? langue : LANGUE_SOURCE
  return traducteur(l, CATALOGUES[l], l)
}

function traducteur(l, catalogue, locale) {
  const cache = new Map()
  const t = (cle, valeurs) => {
    let fmt = cache.get(cle)
    if (!fmt) {
      const brut = chercher(catalogue, cle) ?? chercher(CATALOGUES[LANGUE_SOURCE], cle)
      if (typeof brut !== 'string') throw new Error(`clé de traduction inconnue : ${cle}`)
      fmt = new IntlMessageFormat(brut, locale)
      cache.set(cle, fmt)
    }
    return fmt.format(valeurs)
  }
  t.langue = l
  return t
}

/** Le message d'un code d'erreur : `erreurs.<code>` s'il existe, sinon le
 * message générique avec le code (les codes viennent du domaine et du serveur). */
export function messageErreur(t, code) {
  // Seule une clé absente renvoie au message générique : un message mal formé
  // doit se voir, pas se cacher derrière lui.
  const cle = `erreurs.${code}`
  return chercher(CATALOGUES[LANGUE_SOURCE], cle) === undefined ? t('application.erreur', { code }) : t(cle)
}

/** Le libellé d'un rôle (code du domaine) ; un code inconnu revient tel quel. */
export const libelleDuRole = (t, role) =>
  ({
    lecteur: t('roles.lecteur'),
    correcteur: t('roles.correcteur'),
    editeur: t('roles.editeur'),
    proprietaire: t('roles.proprietaire'),
  })[role] ?? role
