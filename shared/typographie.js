// La typographie française, en une fonction (08/10/2026).
//
// Une seule source de vérité pour les trois endroits où du texte entre dans
// un document : la frappe, le collage, et ce que renvoient l'IA et Claude.
// Module pur, sans dépendance, partagé par le navigateur et le serveur.
//
// Cinq règles, volontairement :
//
//   '            →  ’            apostrophe typographique (U+2019)
//   "            →  « … »        guillemets français, espace insécable à
//                                l'intérieur
//   ...          →  …            un seul caractère (U+2026)
//   « mot ;      →  espace fine insécable (U+202F) avant ; ! ?
//   mot :        →  espace insécable (U+00A0) avant :
//
// Rien d'autre : nombres, unités, tirets, abréviations, ligatures et
// majuscules accentuées ont trop d'exceptions (« moelle », 12:30, une
// adresse) pour gagner à être automatiques.
//
// Principes :
//  - **Idempotent** : typographier(typographier(x)) === typographier(x).
//  - **On ne fait que transformer** : jamais d'espace ajoutée devant un
//    signe, sauf à l'intérieur de « » qu'on vient de créer. « mot; » reste
//    « mot; » — la personne a peut-être ses raisons.
//  - **L'existant correct est respecté** : une espace insécable ou fine
//    déjà là, de l'une ou l'autre sorte, n'est pas remplacée.
//  - **Les adresses et les courriels ne sont pas touchés.**

export const NBSP = ' '
export const FINE = ' '
/** L'espace posée avant ; ! ? — une seule constante à changer si une police
 * affiche mal l'espace fine (U+202F) : NBSP convient partout. */
export const AVANT_DOUBLE = FINE

const PROTEGE = /(?:https?:\/\/|www\.)[^\s<>«»]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/giu
// Ce qui peut suivre un signe double pour que ce soit bien de la ponctuation
// (et non un « != », un « ?param », un « :) » ou un clin d'œil « ;) »).
// Après ? et ! une parenthèse fermante est normale : « (Vraiment ?) ».
const SUITE = String.raw`(?=[\s  »”"’…!?.,;:\]]|$)`
const SUITE_AVEC_PARENTHESE = String.raw`(?=[\s  »”"’…!?.,;:\])]|$)`
const AVANT_INTERROGATION = new RegExp(String.raw`(?<=\S)[ \t]+([!?])` + SUITE_AVEC_PARENTHESE, 'gu')
const AVANT_POINT_VIRGULE = new RegExp(String.raw`(?<=\S)[ \t]+(;)` + SUITE, 'gu')
const AVANT_DEUX_POINTS = new RegExp(String.raw`(?<=\S)[ \t]+(:)` + SUITE, 'gu')
const OUVRANT = /[\s  (\[{«‘“–—\/]/u

/** Une chaîne sans zone protégée. */
function corps(s, avant) {
  s = s.replace(/\.{3}/g, '…')
  s = s.replace(AVANT_INTERROGATION, `${AVANT_DOUBLE}$1`)
  s = s.replace(AVANT_POINT_VIRGULE, `${AVANT_DOUBLE}$1`)
  s = s.replace(AVANT_DEUX_POINTS, `${NBSP}$1`)

  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const dernier = out.length ? out[out.length - 1] : avant
    if (c === "'") {
      out += '’'
    } else if (c === '"') {
      if (dernier === '' || OUVRANT.test(dernier)) {
        out += '«' + NBSP
        // L'espace qui suivait déjà ne s'ajoute pas à la nôtre.
        if (s[i + 1] === ' ') i++
      } else {
        if (out.endsWith(' ')) out = out.slice(0, -1) + NBSP
        else if (!out.endsWith(NBSP) && !out.endsWith(FINE)) out += NBSP
        out += '»'
      }
    } else if (c === '«') {
      out += '«'
      if (s[i + 1] === ' ') {
        out += NBSP
        i++
      }
    } else if (c === '»') {
      if (out.endsWith(' ')) out = out.slice(0, -1) + NBSP
      out += '»'
    } else {
      out += c
    }
  }
  return out
}

/**
 * Le texte, typographié.
 * @param {string} texte
 * @param {{avant?: string}} [options] `avant` : le caractère qui précède ce
 *   texte dans le document (pour décider si un `"` ouvre ou ferme).
 */
export function typographier(texte, { avant = '' } = {}) {
  const t = String(texte ?? '')
  if (!/['"«»;:!?]|\.\.\./.test(t)) return t
  let out = ''
  let reste = 0
  let precedent = avant
  const ajouter = (morceau, protege) => {
    if (!morceau) return
    const tape = protege ? morceau : corps(morceau, precedent)
    out += tape
    precedent = tape[tape.length - 1]
  }
  PROTEGE.lastIndex = 0
  let m
  while ((m = PROTEGE.exec(t))) {
    ajouter(t.slice(reste, m.index), false)
    ajouter(m[0], true)
    reste = m.index + m[0].length
  }
  ajouter(t.slice(reste), false)
  return out
}

/**
 * Ce que la frappe d'un caractère doit changer.
 * `contexte` : les (au plus deux) derniers caractères du bloc avant le
 * curseur ; `car` : ce qu'on vient de taper ; `avantContexte` : le caractère
 * qui précède `contexte`. Renvoie `{ retirer, ecrire }` — retirer ce nombre
 * de caractères avant le curseur, puis écrire ce texte — ou null si la
 * frappe est laissée telle quelle.
 */
export function corrigerSaisie(contexte, car, avantContexte = '') {
  if (car.length !== 1 || !/['".;:!?]/.test(car)) return null
  const brut = contexte + car
  const net = typographier(brut, { avant: avantContexte })
  if (net === brut) return null
  let p = 0
  while (p < contexte.length && p < net.length && contexte[p] === net[p]) p++
  return { retirer: contexte.length - p, ecrire: net.slice(p), brut }
}
