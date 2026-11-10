// La typographie française (couche domaine) : cinq règles, volontairement
// limitées (décision de la v1, 08/10/2026 ; plan de l'étape 4) :
//
//   '        →  ’         apostrophe typographique (U+2019)
//   "        →  « … »     guillemets français, espace insécable à l'intérieur
//   ...      →  …         points de suspension (U+2026)
//   mot ;    →  espace fine insécable (U+202F) avant ; ! ?
//   mot :    →  espace insécable (U+00A0) avant :
//
// Rien d'autre : nombres, unités, tirets, abréviations ont trop d'exceptions.
// Principes :
//  - idempotente : typographier(typographier(x)) === typographier(x) ;
//  - ne fait que transformer : jamais d'espace ajoutée devant un signe tapé
//    collé (« mot; » reste « mot; »), sauf à l'intérieur des « » qu'elle crée ;
//  - respecte l'existant correct (espace fine ou insécable déjà là) ;
//  - ne touche ni aux adresses ni aux courriels ;
//  - suit la langue du document : hors du français, rien ne change.
// Une seule source pour la frappe, le collage et, plus tard, les textes de Margo.

export const ESPACE_INSECABLE = '\u00A0'
export const ESPACE_FINE = '\u202F'

// Une adresse s'arrête avant la ponctuation de phrase qui la suit (« voir
// www.site.fr... ») : celle-ci reste typographiée (audit du 10/11/2026). Les
// guillemets et parenthèses finales restent à l'adresse (« ?y="z" »).
const PROTEGE = /(?:https?:\/\/|www\.)[^\s<>«»]*[^\s<>«».,;:!?…]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/giu
// Ce qui suit un signe double pour qu'il soit de la ponctuation, et non un
// « != », un « ?param », un « :) ». Après ! et ?, une parenthèse fermante est normale.
const SUITE = '(?=[\\s\\u00A0\\u202F»”"’…!?.,;:\\]]|$)'
const SUITE_PARENTHESE = '(?=[\\s\\u00A0\\u202F»”"’…!?.,;:\\])]|$)'
const AVANT_EXCLAMATION = new RegExp('(?<=\\S)[ \\t]+([!?])' + SUITE_PARENTHESE, 'gu')
const AVANT_POINT_VIRGULE = new RegExp('(?<=\\S)[ \\t]+(;)' + SUITE, 'gu')
const AVANT_DEUX_POINTS = new RegExp('(?<=\\S)[ \\t]+(:)' + SUITE, 'gu')
// Ce qui précède un guillemet ouvrant.
const OUVRANT = /[\s\u00A0\u202F([{«‘“–—/]/u
const SIGNES = /['"«»;:!?]|\.\.\./

/** Un morceau sans zone protégée ; `avant` : le caractère qui le précède. */
function corps(s, avant) {
  // Le caractère qui précède compte pour « mot : » quand le morceau commence
  // par l'espace (après une adresse protégée, par exemple).
  const prefixe = avant ? avant.slice(-1) : ''
  s = (prefixe + s.replace(/\.{3}/g, '…'))
    .replace(AVANT_EXCLAMATION, `${ESPACE_FINE}$1`)
    .replace(AVANT_POINT_VIRGULE, `${ESPACE_FINE}$1`)
    .replace(AVANT_DEUX_POINTS, `${ESPACE_INSECABLE}$1`)
    .slice(prefixe.length)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const precedent = out ? out[out.length - 1] : avant
    if (c === "'") out += '’'
    else if (c === '"') {
      if (precedent === '' || OUVRANT.test(precedent)) {
        out += '«' + ESPACE_INSECABLE
        if (s[i + 1] === ' ') i++ // l'espace déjà tapée ne s'ajoute pas à la nôtre
      } else {
        if (out.endsWith(' ')) out = out.slice(0, -1)
        if (!out.endsWith(ESPACE_INSECABLE) && !out.endsWith(ESPACE_FINE)) out += ESPACE_INSECABLE
        out += '»'
      }
    } else if (c === '«') {
      out += '«'
      if (s[i + 1] === ' ') {
        out += ESPACE_INSECABLE
        i++
      }
    } else if (c === '»') {
      if (out.endsWith(' ')) out = out.slice(0, -1) + ESPACE_INSECABLE
      out += '»'
    } else out += c
  }
  return out
}

/**
 * Le texte typographié (collage, textes de Margo).
 * @param {string} texte
 * @param {{ langue?: string, avant?: string }} [options] `langue` : celle du
 *   document ; `avant` : le caractère qui précède ce texte dans le document
 *   (pour savoir si un `"` ouvre ou ferme).
 */
export function typographier(texte, { langue = 'fr', avant = '' } = {}) {
  const t = String(texte ?? '')
  if (langue !== 'fr' || !SIGNES.test(t)) return t
  let out = ''
  let precedent = String(avant ?? '').slice(-1)
  let reste = 0
  const ajouter = (morceau, protege) => {
    if (!morceau) return
    const fait = protege ? morceau : corps(morceau, precedent)
    out += fait
    precedent = fait[fait.length - 1]
  }
  for (const m of t.matchAll(PROTEGE)) {
    ajouter(t.slice(reste, m.index), false)
    ajouter(m[0], true)
    reste = m.index + m[0].length
  }
  ajouter(t.slice(reste), false)
  return out
}

/** Au plus combien de caractères avant le curseur une frappe peut changer. */
const PORTEE_SAISIE = 3
// En cours de frappe, l'adresse peut continuer après une ponctuation (« ?b=1 ») :
// le mot entier, ponctuation finale comprise, est protégé.
const PROTEGE_EN_FRAPPE = /(?:https?:\/\/|www\.)[^\s<>«»]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/iu
const ZONE_PROTEGEE = new RegExp(`^(?:${PROTEGE_EN_FRAPPE.source})$`, 'iu')

/**
 * Ce que la frappe d'un caractère doit changer.
 * @param {string} avantCurseur le texte du bloc avant le curseur
 * @param {string} car le caractère tapé
 * @returns {{ retirer: number, ecrire: string } | null} retirer ce nombre
 *   de caractères avant le curseur, puis écrire ce texte (qui remplace aussi
 *   le caractère tapé) ; `null` : la frappe reste telle quelle.
 */
export function saisie(avantCurseur, car, { langue = 'fr' } = {}) {
  if (langue !== 'fr' || typeof car !== 'string' || !/^['".;:!?]$/.test(car)) return null
  const avant = String(avantCurseur ?? '')
  // Une adresse ou un courriel en cours de frappe : rien.
  const mot = avant.slice(avant.search(/\S*$/u)) + car
  if (ZONE_PROTEGEE.test(mot)) return null
  // Une frappe ne réécrit que ce qui la touche, jamais un passage plus ancien.
  const fenetre = avant.slice(-PORTEE_SAISIE)
  const brut = fenetre + car
  const net = typographier(brut, { langue, avant: avant.slice(-PORTEE_SAISIE - 1, -PORTEE_SAISIE) })
  if (net === brut) return null
  let p = 0
  while (p < fenetre.length && p < net.length && fenetre[p] === net[p]) p++
  return { retirer: fenetre.length - p, ecrire: net.slice(p) }
}
