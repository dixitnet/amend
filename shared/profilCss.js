// Le profil CSS d'un modèle de mise en page (28/10/2026).
//
// Un modèle est une feuille de style **CSS d'impression**, un fichier lisible
// et identifiable (décision de Sylvain, 21/10/2026). Ce module est le seul à
// savoir passer de la feuille de style interne (shared/style.js) à ce CSS, et
// retour :
//
//  - `ecrireProfil(style)` écrit une feuille CSS complète et autonome ;
//  - `lireProfil(css)` en tire un calque de feuille de style, plus la liste
//    de ce qu'il n'a pas compris (`avertissements`).
//
// Les exports (Typst, Word) et le formulaire de réglage ne changent pas : ils
// lisent toujours la feuille de style interne. Le CSS n'est qu'un format de
// stockage — et un format qu'une personne peut lire, ou qu'un autre outil
// peut produire.
//
// **Le profil est fermé.** On ne garde du CSS lu que des valeurs qu'on
// reconnaît (listes fermées, bornes de `assainir`), et on réécrit le CSS à
// partir de ces valeurs, jamais à partir du texte reçu. `url()`, `@import`,
// `@font-face` et tout ce qui n'est pas dans la liste sont ignorés et
// signalés : un modèle de l'instance touche tous les documents qui
// l'utilisent, et aucun CSS ni Typst libre ne doit passer par là.
//
// Ce que le profil comprend :
//  - `:root` : variables `--amend-*` pour ce que le CSS n'a pas (langue,
//    début de la numérotation et sa position, marges miroir, césure, veuves
//    et orphelines, premier paragraphe sans retrait, descente des débuts de
//    chapitre, notes de bas de page, séparateur de scène, images pleine page,
//    en-tête et numéro sur les pages d'ouverture) ;
//  - `@page` : `size` (A4, A5, letter, orientation, ou deux longueurs) et
//    `margin` ; `@page :left` / `:right` avec `@top-center { content }`
//    pour les en-têtes ; `@bottom-center { content: counter(page) }` pour
//    la numérotation ;
//  - un sélecteur par bloc (`p`, `blockquote`, `h1`…, `p.style-titre`) avec
//    `font-family` (une pile résolue contre les polices de l'instance),
//    `font-size`, `font-weight`, `font-style`, `text-transform`,
//    `text-align`, `line-height`, `margin-top`, `margin-bottom`,
//    `text-indent`, `margin-left` ;
//  - `h1 { break-before: auto | page | recto }` et `h1, h2, h3 { break-after: avoid }`.
//
// Les colonnes (`--amend-colonnes` : 1, 2 ou 3 ; `--amend-gouttiere` : espace
// entre elles) valent pour tout le texte ; en-têtes et numéros restent sur la
// largeur de la page.

import {
  BLOCS,
  POLICES,
  GENERIQUES,
  FORMATS_PAGE,
  FORMATS_ANCIENS,
  ALIGNEMENTS,
  INTERLIGNES,
  INTERLIGNES_NOTES,
  COLONNES,
  POSITIONS_NUMERO,
  SEPARATEURS,
  LANGUES,
  VERSION_STYLE,
  assainir,
  police,
} from './style.js'

/** Version du profil, écrite dans `--amend-profil`. */
export const VERSION_PROFIL = 1

/** Taille maximale d'un fichier de profil, en caractères. */
export const PROFIL_MAX = 64 * 1024

const PROFONDEUR_MAX = 6
const AVERTISSEMENTS_MAX = 30

// --- Analyse : un CSS en arbre de règles ----------------------------------

function sansCommentaires(css) {
  let out = ''
  let quote = null
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (quote) {
      out += c
      if (c === '\\' && i + 1 < css.length) out += css[++i]
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      out += c
    } else if (c === '/' && css[i + 1] === '*') {
      const fin = css.indexOf('*/', i + 2)
      if (fin < 0) break
      i = fin + 1
      out += ' '
    } else out += c
  }
  return out
}

/** Un CSS en arbre : `{ declarations: [{ prop, valeur }], noeuds: [{ prelude,
 * declarations, noeuds, sansBloc? }] }`. Tolérant (une accolade en trop ou en
 * moins ne fait rien tomber) mais borné en taille et en profondeur. */
function analyser(css) {
  const src = sansCommentaires(css)
  let i = 0

  function bloc(profondeur) {
    if (profondeur > PROFONDEUR_MAX) throw new Error('profil CSS trop imbriqué')
    const noeuds = []
    const declarations = []
    const ajouter = (prelude) => {
      if (!prelude) return
      if (prelude.startsWith('@')) {
        noeuds.push({ prelude, declarations: [], noeuds: [], sansBloc: true })
        return
      }
      const deuxPoints = prelude.indexOf(':')
      if (deuxPoints < 1) return
      declarations.push({
        prop: prelude.slice(0, deuxPoints).trim().toLowerCase(),
        valeur: prelude.slice(deuxPoints + 1).trim(),
      })
    }
    while (i < src.length) {
      const debut = i
      let parentheses = 0
      let quote = null
      let arret = null
      for (; i < src.length; i++) {
        const c = src[i]
        if (quote) {
          if (c === '\\') i++
          else if (c === quote) quote = null
          continue
        }
        if (c === '"' || c === "'") quote = c
        else if (c === '(') parentheses++
        else if (c === ')') parentheses = Math.max(0, parentheses - 1)
        else if (parentheses === 0 && (c === '{' || c === ';' || c === '}')) {
          arret = c
          break
        }
      }
      const prelude = src.slice(debut, i).trim()
      if (arret === null) {
        ajouter(prelude)
        break
      }
      i++
      if (arret === '{') {
        const enfant = bloc(profondeur + 1)
        noeuds.push({ prelude, declarations: enfant.declarations, noeuds: enfant.noeuds })
      } else if (arret === ';') ajouter(prelude)
      else {
        ajouter(prelude)
        // Une accolade fermante en trop, au niveau de la feuille, ne coupe pas la lecture.
        if (profondeur > 0) break
      }
    }
    return { noeuds, declarations }
  }

  return bloc(0)
}

// --- Valeurs ---------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/g

const MM_PAR = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 }

/** Une longueur CSS en mm, ou `null`. `0` sans unité vaut 0. */
function enMm(valeur) {
  const m = /^(-?\d*\.?\d+)(mm|cm|in|pt|px)?$/i.exec(String(valeur).trim())
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  if (!m[2]) return n === 0 ? 0 : null
  return n * MM_PAR[m[2].toLowerCase()]
}

/** Une longueur CSS en points, ou `null`. */
function enPt(valeur) {
  const mm = enMm(valeur)
  return mm === null ? null : (mm * 72) / 25.4
}

const arrondi = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const nombre = (n) => String(arrondi(n))

function booleenCss(valeur) {
  const v = String(valeur).trim().toLowerCase()
  if (['oui', 'yes', 'true', '1', 'on'].includes(v)) return true
  if (['non', 'no', 'false', '0', 'off'].includes(v)) return false
  return null
}

/** Le contenu d'une chaîne CSS (`"…"`) ou `null`. Les échappements `\"`, `\\`
 * et `\XXXX ` sont défaits ; tout caractère de contrôle devient une espace. */
function chaineCss(valeur) {
  const m = /^(["'])((?:\\.|(?!\1)[^\\])*)\1$/s.exec(String(valeur).trim())
  if (!m) return null
  return m[2]
    .replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/gs, (_, hex, autre) => {
      if (autre !== undefined) return autre
      const code = parseInt(hex, 16)
      return code > 0x1f && code !== 0x7f && code <= 0x10ffff ? String.fromCodePoint(code) : ' '
    })
    .replace(CONTROLE, ' ')
}

const echapperChaine = (texte) => String(texte).replace(CONTROLE, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/** Une liste séparée par des virgules, hors guillemets. */
function listeCss(valeur) {
  const out = []
  let courant = ''
  let quote = null
  for (let i = 0; i < valeur.length; i++) {
    const c = valeur[i]
    if (quote) {
      courant += c
      if (c === '\\' && i + 1 < valeur.length) courant += valeur[++i]
      else if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      courant += c
    } else if (c === ',') {
      out.push(courant.trim())
      courant = ''
    } else courant += c
  }
  if (courant.trim()) out.push(courant.trim())
  return out
}

// --- Polices : une pile CSS contre les polices de l'instance ---------------

const ALIAS_FAMILLES = {
  arial: 'arial',
  helvetica: 'arial',
  'times new roman': 'times',
  times: 'times',
  georgia: 'serif',
  'courier new': 'mono',
  courier: 'mono',
  'system-ui': 'system',
  '-apple-system': 'system',
  blinkmacsystemfont: 'system',
  'segoe ui': 'system',
}
const REPLI_GENERIQUE = { serif: 'serif', 'sans-serif': 'system', monospace: 'mono' }

/** L'identifiant de la police qui porte ce nom de famille, ou `null`. */
function idDepuisFamille(famille) {
  const n = famille.toLowerCase()
  const trouvee = POLICES.find((p) => p.typst.some((t) => t.toLowerCase() === n))
  if (trouvee) return trouvee.id
  const alias = ALIAS_FAMILLES[n]
  return alias && POLICES.some((p) => p.id === alias) ? alias : null
}

/** La pile `font-family` d'une police : sa famille d'abord, puis le
 * générique, comme `"Libertinus Serif", serif`. */
function pileDePolice(id) {
  const p = police(id)
  const generique = String(p.css).split(',').pop().trim().replace(/"/g, '')
  return `"${echapperChaine(p.typst[0])}", ${GENERIQUES.includes(generique) ? generique : 'sans-serif'}`
}

/** Résout une pile contre le catalogue : la première famille connue gagne ;
 * à défaut, le générique donne une police de repli. `{ id, avertissement }`,
 * `id` à `null` si rien ne se résout (le bloc garde sa police). */
function resoudrePolice(valeur) {
  const familles = listeCss(valeur).map((f) => chaineCss(f) ?? f.replace(/^["']|["']$/g, ''))
  if (!familles.length) return { id: null, avertissement: 'font-family vide.' }
  const premiere = familles[0]
  const generique = (f) => Object.hasOwn(REPLI_GENERIQUE, f.toLowerCase())
  for (const [k, f] of familles.entries()) {
    if (generique(f)) continue
    const id = idDepuisFamille(f)
    if (!id) continue
    const avertissement =
      k > 0 && !generique(premiere)
        ? `« ${premiere} » n’est pas dans les polices de l’instance : « ${f} » est utilisée à la place.`
        : null
    return { id, avertissement }
  }
  const g = familles.find(generique)
  if (g) {
    const id = REPLI_GENERIQUE[g.toLowerCase()]
    return {
      id,
      avertissement: generique(premiere)
        ? null
        : `« ${premiere} » n’est pas dans les polices de l’instance : repli sur ${police(id).label}.`,
    }
  }
  return {
    id: null,
    avertissement: `« ${premiere} » n’est pas dans les polices de l’instance : police du bloc inchangée.`,
  }
}

// --- Les sélecteurs ---------------------------------------------------------

const selecteurDe = (b) => (b.classe ? `${b.balise}.${b.classe}` : b.balise)
const BLOC_PAR_SELECTEUR = Object.fromEntries(BLOCS.map((b) => [selecteurDe(b), b.id]))
const TITRES = BLOCS.filter((b) => b.docxHeading !== null)

const NOMS_FORMATS = [...FORMATS_PAGE, ...FORMATS_ANCIENS].filter((f) => f.mm)
const nomCssDuFormat = (id) => (id === 'Letter' ? 'letter' : id)

// --- Lecture ---------------------------------------------------------------

/**
 * Lit un profil CSS.
 *
 * @param {string} css
 * @returns {{ style: object, avertissements: string[], version: number|null }}
 *   `style` : un calque de feuille de style (ce que le CSS dit, rien de
 *   plus) ; à passer à `assainir` / `reduire` par l'appelant. Lève une erreur
 *   si le texte est trop gros ou trop imbriqué.
 */
export function lireProfil(css) {
  if (typeof css !== 'string') throw new Error('profil CSS invalide')
  if (css.length > PROFIL_MAX) throw new Error('profil CSS trop volumineux')
  const avertissements = []
  const avertir = (texte) => {
    if (avertissements.length < AVERTISSEMENTS_MAX && !avertissements.includes(texte)) avertissements.push(texte)
  }
  const page = {}
  const blocs = {}
  let version = null

  const arbre = analyser(css)
  const entetes = { gauche: {}, droite: {} }

  const variables = (declarations) => {
    for (const { prop, valeur } of declarations) {
      if (!prop.startsWith('--amend-')) {
        avertir(`« ${prop} » est ignoré dans :root.`)
        continue
      }
      switch (prop) {
        case '--amend-profil':
          version = Number(valeur) || null
          break
        case '--amend-langue': {
          const l = valeur.replace(/^["']|["']$/g, '').toLowerCase()
          if (LANGUES.some((x) => x.id === l)) page.langue = l
          else avertir(`Langue « ${l} » non prise en charge (${LANGUES.map((x) => x.id).join(', ')}).`)
          break
        }
        case '--amend-numero-debut': {
          const n = Number(valeur)
          if (Number.isFinite(n)) page.pageNumbers = { ...(page.pageNumbers || {}), startAt: n }
          break
        }
        case '--amend-images-pleine-page':
        case '--amend-entete-saut-ouverture':
        case '--amend-numero-saut-ouverture':
        case '--amend-marges-miroir':
        case '--amend-cesure':
        case '--amend-veuves-orphelines':
        case '--amend-premier-sans-retrait': {
          const b = booleenCss(valeur)
          if (b === null) avertir(`Valeur de ${prop} non comprise : « ${valeur} ».`)
          else if (prop === '--amend-images-pleine-page') page.imagesPleinePage = b
          else if (prop === '--amend-marges-miroir') page.margesMiroir = b
          else if (prop === '--amend-cesure') page.cesure = b
          else if (prop === '--amend-veuves-orphelines') page.veuvesOrphelines = b
          else if (prop === '--amend-premier-sans-retrait') page.premierSansRetrait = b
          else if (prop === '--amend-numero-saut-ouverture') {
            page.pageNumbers = { ...(page.pageNumbers || {}), sautOuverture: b }
          } else page.entete = { ...(page.entete || {}), sautOuverture: b }
          break
        }
        case '--amend-numero-position': {
          const v = valeur.trim().toLowerCase()
          if (POSITIONS_NUMERO.some((x) => x.id === v)) {
            page.pageNumbers = { ...(page.pageNumbers || {}), position: v }
          } else avertir(`Position « ${v} » non prise en charge (${POSITIONS_NUMERO.map((x) => x.id).join(', ')}).`)
          break
        }
        case '--amend-separateur': {
          const v = valeur.trim().toLowerCase()
          if (SEPARATEURS.some((x) => x.id === v)) page.separateur = v
          else avertir(`Séparateur « ${v} » non pris en charge (${SEPARATEURS.map((x) => x.id).join(', ')}).`)
          break
        }
        case '--amend-descente': {
          const mm = enMm(valeur)
          if (mm === null || mm < 0) avertir(`Descente « ${valeur} » non comprise.`)
          else page.descente = arrondi(mm, 1)
          break
        }
        case '--amend-notes-reduction': {
          const pt = enPt(valeur)
          if (pt === null || pt < 0) avertir(`Réduction des notes « ${valeur} » non comprise.`)
          else page.notesReduction = arrondi(pt, 1)
          break
        }
        case '--amend-notes-interligne': {
          const n = Number(valeur)
          if (INTERLIGNES_NOTES.some((x) => x.id === n)) page.notesInterligne = n
          else
            avertir(
              `Interligne des notes « ${valeur} » non pris en charge (0 = comme le texte, ${INTERLIGNES.map((x) => x.id).join(', ')}).`
            )
          break
        }
        case '--amend-colonnes': {
          const n = Number(valeur)
          if (COLONNES.some((x) => x.id === n)) page.colonnes = n
          else avertir(`Colonnes « ${valeur} » non prises en charge (${COLONNES.map((x) => x.id).join(', ')}).`)
          break
        }
        case '--amend-gouttiere': {
          const mm = enMm(valeur)
          if (mm === null || mm < 0) avertir(`Gouttière « ${valeur} » non comprise.`)
          else page.gouttiere = arrondi(mm, 1)
          break
        }
        default:
          avertir(`Variable « ${prop} » inconnue.`)
      }
    }
  }

  const dimensionsFormat = (valeur) => {
    const mots = valeur.toLowerCase().split(/\s+/).filter(Boolean)
    const paysage = mots.includes('landscape')
    const portrait = mots.includes('portrait')
    const reste = mots.filter((m) => m !== 'landscape' && m !== 'portrait')
    const nommee = NOMS_FORMATS.find((f) => reste.length === 1 && nomCssDuFormat(f.id).toLowerCase() === reste[0])
    if (nommee) {
      page.size = nommee.id
      page.orientation = paysage ? 'paysage' : 'portrait'
      return
    }
    const cotes = reste.map(enMm)
    if (cotes.length >= 1 && cotes.length <= 2 && cotes.every((c) => c !== null && c > 0)) {
      let [l, h] = cotes.length === 1 ? [cotes[0], cotes[0]] : cotes
      if (paysage && l < h) [l, h] = [h, l]
      if (portrait && l > h) [l, h] = [h, l]
      // Deux longueurs qui sont celles d'un format nommé : on retient le nom.
      const proche = (a, b) => Math.abs(a - b) < 0.5
      const connu = NOMS_FORMATS.find(
        (f) => (proche(l, f.mm[0]) && proche(h, f.mm[1])) || (proche(l, f.mm[1]) && proche(h, f.mm[0]))
      )
      if (connu) {
        page.size = connu.id
        page.orientation = l > h ? 'paysage' : 'portrait'
      } else {
        page.size = 'personnalise'
        page.largeur = arrondi(l, 1)
        page.hauteur = arrondi(h, 1)
      }
      return
    }
    avertir(`Format de page « ${valeur} » non compris.`)
  }

  const marges = (valeur) => {
    const v = valeur.split(/\s+/).map(enMm)
    if (v.length < 1 || v.length > 4 || v.some((x) => x === null || x < 0)) {
      avertir(`Marges « ${valeur} » non comprises.`)
      return
    }
    const [haut, droite = haut, bas = haut, gauche = droite] = v
    Object.assign(page, {
      marginTop: arrondi(haut, 1),
      marginRight: arrondi(droite, 1),
      marginBottom: arrondi(bas, 1),
      marginLeft: arrondi(gauche, 1),
    })
  }

  const regleDePage = (noeud) => {
    const pseudo = noeud.prelude
      .replace(/^@page/i, '')
      .trim()
      .toLowerCase()
    if (pseudo && pseudo !== ':left' && pseudo !== ':right') {
      avertir(`@page ${pseudo} est ignoré (seuls :left et :right sont lus).`)
      return
    }
    for (const { prop, valeur } of noeud.declarations) {
      if (pseudo) {
        avertir(`« ${prop} » est ignoré dans @page ${pseudo}.`)
        continue
      }
      if (prop === 'size') dimensionsFormat(valeur)
      else if (prop === 'margin') marges(valeur)
      else if (['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].includes(prop)) {
        const mm = enMm(valeur)
        const cle = 'margin' + prop.slice(7, 8).toUpperCase() + prop.slice(8)
        if (mm === null || mm < 0) avertir(`Marge « ${valeur} » non comprise.`)
        else page[cle] = arrondi(mm, 1)
      } else avertir(`« ${prop} » est ignoré dans @page.`)
    }
    for (const enfant of noeud.noeuds) {
      const boite = enfant.prelude.toLowerCase()
      const contenu = enfant.declarations.find((d) => d.prop === 'content')
      if (boite === '@top-center' && pseudo) {
        const cote = pseudo === ':left' ? 'gauche' : 'droite'
        if (!contenu) continue
        const v = contenu.valeur.trim()
        const texte = chaineCss(v)
        if (/^none$|^normal$/i.test(v)) entetes[cote] = { type: 'rien', texte: '' }
        else if (texte !== null) entetes[cote] = { type: 'texte', texte }
        else if (/^string\(\s*titre-document\s*\)$/i.test(v)) entetes[cote] = { type: 'titreDocument', texte: '' }
        else if (/^string\(\s*titre-1\s*\)$/i.test(v)) entetes[cote] = { type: 'titre', texte: '' }
        else avertir(`En-tête « ${v} » non compris (texte entre guillemets, string(titre-document), string(titre-1)).`)
      } else if (boite === '@bottom-center' && !pseudo) {
        if (!contenu) continue
        page.pageNumbers = { ...(page.pageNumbers || {}), enabled: /counter\(\s*page\s*\)/i.test(contenu.valeur) }
      } else avertir(`${enfant.prelude} est ignoré.`)
    }
  }

  const regleDeBloc = (idBloc, declarations, selecteur) => {
    const b = (blocs[idBloc] = blocs[idBloc] || {})
    for (const { prop, valeur } of declarations) {
      const v = valeur.trim()
      const mots = v.toLowerCase()
      switch (prop) {
        case 'font-family': {
          if (/url\s*\(/i.test(v)) {
            avertir('url() n’est pas admis dans un profil.')
            break
          }
          const r = resoudrePolice(v)
          if (r.avertissement) avertir(r.avertissement)
          if (r.id) b.font = r.id
          break
        }
        case 'font-size': {
          const pt = enPt(v)
          if (pt === null || pt <= 0) avertir(`Taille « ${v} » non comprise (pt, mm, cm, in, px).`)
          else b.size = arrondi(pt, 1)
          break
        }
        case 'font-weight': {
          if (mots === 'bold' || mots === 'bolder' || Number(mots) >= 600) b.bold = true
          else if (mots === 'normal' || mots === 'lighter' || (Number(mots) > 0 && Number(mots) < 600)) b.bold = false
          else avertir(`font-weight « ${v} » non compris.`)
          break
        }
        case 'font-style':
          if (mots === 'italic' || mots === 'oblique') b.italic = true
          else if (mots === 'normal') b.italic = false
          else avertir(`font-style « ${v} » non compris.`)
          break
        case 'text-transform':
          if (mots === 'uppercase') b.uppercase = true
          else if (mots === 'none') b.uppercase = false
          else avertir(`text-transform « ${v} » non pris en charge (uppercase ou none).`)
          break
        case 'text-align':
          if (ALIGNEMENTS.some((a) => a.id === mots)) b.align = mots
          else avertir(`text-align « ${v} » non compris.`)
          break
        case 'line-height': {
          const n = Number(mots)
          if (INTERLIGNES.some((x) => x.id === n)) b.lineHeight = n
          else avertir(`Interligne « ${v} » non pris en charge (${INTERLIGNES.map((x) => x.id).join(', ')}).`)
          break
        }
        case 'margin-top':
        case 'margin-bottom': {
          const pt = enPt(v)
          if (pt === null || pt < 0) avertir(`${prop} « ${v} » non compris.`)
          else b[prop === 'margin-top' ? 'spaceBefore' : 'spaceAfter'] = arrondi(pt, 1)
          break
        }
        case 'text-indent':
        case 'margin-left': {
          const mm = enMm(v)
          if (mm === null || mm < 0) avertir(`${prop} « ${v} » non compris.`)
          else b[prop === 'text-indent' ? 'firstLineIndent' : 'indent'] = arrondi(mm, 1)
          break
        }
        case 'break-before':
          if (idBloc !== 'h1') avertir(`break-before n’est lu que sur h1 (pas sur ${selecteur}).`)
          else if (mots === 'recto' || mots === 'right') page.debutChapitre = 'droite'
          else if (mots === 'page') page.debutChapitre = 'page'
          else if (mots === 'auto' || mots === 'avoid') page.debutChapitre = 'continuer'
          else avertir(`break-before « ${v} » non compris.`)
          break
        case 'break-after':
          if (!TITRES.some((t) => t.id === idBloc))
            avertir(`break-after n’est lu que sur les titres (pas sur ${selecteur}).`)
          else if (mots === 'avoid' || mots === 'avoid-page') page.titresSolidaires = true
          else if (mots === 'auto') page.titresSolidaires = false
          else avertir(`break-after « ${v} » non compris.`)
          break
        default:
          avertir(`« ${prop} » est ignoré (${selecteur}).`)
      }
    }
    if (!Object.keys(b).length) delete blocs[idBloc]
  }

  for (const noeud of arbre.noeuds) {
    const p = noeud.prelude
    if (noeud.sansBloc || /^@(import|font-face|charset|namespace)/i.test(p)) {
      avertir(`${p.split(/[\s({]/)[0]} n’est pas admis dans un profil : ignoré.`)
      continue
    }
    if (/^@page/i.test(p)) {
      regleDePage(noeud)
      continue
    }
    if (p.startsWith('@')) {
      avertir(`${p.split(/[\s({]/)[0]} est ignoré.`)
      continue
    }
    for (const sel of p.split(',').map((s) => s.trim().replace(/\s+/g, ' '))) {
      if (sel === ':root' || sel === 'html') variables(noeud.declarations)
      else if (Object.hasOwn(BLOC_PAR_SELECTEUR, sel)) regleDeBloc(BLOC_PAR_SELECTEUR[sel], noeud.declarations, sel)
      else avertir(`Sélecteur « ${sel} » ignoré.`)
    }
  }

  for (const cote of ['gauche', 'droite']) {
    if (Object.keys(entetes[cote]).length) page.entete = { ...(page.entete || {}), [cote]: entetes[cote] }
  }
  if (version !== null && version > VERSION_PROFIL) {
    avertir(`Ce profil est d’une version plus récente (${version}) que celle qu’amend.ink lit (${VERSION_PROFIL}).`)
  }

  const style = { version: VERSION_STYLE }
  if (Object.keys(page).length) style.page = page
  if (Object.keys(blocs).length) style.blocs = blocs
  return { style, avertissements, version }
}

// --- Écriture --------------------------------------------------------------

const ouiNon = (b) => (b ? 'oui' : 'non')

/** Écrit une feuille de style en profil CSS **complet** : tout y est, de
 * sorte que le fichier se lit seul. `style` est assaini d'abord. */
export function ecrireProfil(style) {
  const s = assainir(style)
  const p = s.page
  const L = []
  const ligne = (t = '') => L.push(t)

  ligne(`/* amend.ink — profil de mise en page (version ${VERSION_PROFIL}).`)
  ligne('   Feuille CSS d’impression : elle ne règle que les exports (PDF, Word), pas l’éditeur.')
  ligne('   Seules les règles ci-dessous sont lues ; le reste est ignoré. */')
  ligne()
  ligne(':root {')
  ligne(`  --amend-profil: ${VERSION_PROFIL};`)
  ligne(`  --amend-langue: ${p.langue};`)
  ligne(`  --amend-numero-debut: ${p.pageNumbers.startAt};`)
  ligne(`  --amend-images-pleine-page: ${ouiNon(p.imagesPleinePage)};`)
  ligne(`  --amend-entete-saut-ouverture: ${ouiNon(p.entete.sautOuverture)};`)
  ligne(`  --amend-numero-position: ${p.pageNumbers.position};`)
  ligne(`  --amend-numero-saut-ouverture: ${ouiNon(p.pageNumbers.sautOuverture)};`)
  ligne(`  --amend-marges-miroir: ${ouiNon(p.margesMiroir)};`)
  ligne(`  --amend-cesure: ${ouiNon(p.cesure)};`)
  ligne(`  --amend-veuves-orphelines: ${ouiNon(p.veuvesOrphelines)};`)
  ligne(`  --amend-premier-sans-retrait: ${ouiNon(p.premierSansRetrait)};`)
  ligne(`  --amend-descente: ${nombre(p.descente)}mm;`)
  ligne(`  --amend-notes-reduction: ${nombre(p.notesReduction)}pt;`)
  ligne(`  --amend-notes-interligne: ${p.notesInterligne};`)
  ligne(`  --amend-separateur: ${p.separateur};`)
  ligne(`  --amend-colonnes: ${p.colonnes};`)
  ligne(`  --amend-gouttiere: ${nombre(p.gouttiere)}mm;`)
  ligne('}')
  ligne()

  let taille
  if (p.size === 'personnalise') taille = `${nombre(p.largeur)}mm ${nombre(p.hauteur)}mm`
  else taille = `${nomCssDuFormat(p.size)}${p.orientation === 'paysage' ? ' landscape' : ''}`
  ligne('@page {')
  ligne(`  size: ${taille};`)
  if (p.margesMiroir) ligne('  /* Marges miroir : « gauche » est la marge intérieure, « droite » l’extérieure. */')
  ligne(
    `  margin: ${[p.marginTop, p.marginRight, p.marginBottom, p.marginLeft].map((m) => `${nombre(m)}mm`).join(' ')};`
  )
  ligne(`  @bottom-center { content: ${p.pageNumbers.enabled ? 'counter(page)' : 'none'}; }`)
  ligne('}')
  for (const [pseudo, cote] of [
    [':left', 'gauche'],
    [':right', 'droite'],
  ]) {
    const e = p.entete[cote]
    let contenu = 'none'
    if (e.type === 'texte') contenu = `"${echapperChaine(e.texte)}"`
    else if (e.type === 'titreDocument') contenu = 'string(titre-document)'
    else if (e.type === 'titre') contenu = 'string(titre-1)'
    ligne(`@page ${pseudo} {`)
    ligne(`  @top-center { content: ${contenu}; }`)
    ligne('}')
  }

  for (const b of BLOCS) {
    const v = s.blocs[b.id]
    ligne()
    ligne(`${selecteurDe(b)} {`)
    ligne(`  font-family: ${pileDePolice(v.font)};`)
    ligne(`  font-size: ${nombre(v.size)}pt;`)
    ligne(`  font-weight: ${v.bold ? 'bold' : 'normal'};`)
    ligne(`  font-style: ${v.italic ? 'italic' : 'normal'};`)
    ligne(`  text-transform: ${v.uppercase ? 'uppercase' : 'none'};`)
    ligne(`  text-align: ${v.align};`)
    ligne(`  line-height: ${v.lineHeight};`)
    ligne(`  margin-top: ${nombre(v.spaceBefore)}pt;`)
    ligne(`  margin-bottom: ${nombre(v.spaceAfter)}pt;`)
    ligne(`  text-indent: ${nombre(v.firstLineIndent)}mm;`)
    ligne(`  margin-left: ${nombre(v.indent)}mm;`)
    if (b.id === 'h1')
      ligne(`  break-before: ${{ droite: 'recto', page: 'page', continuer: 'auto' }[p.debutChapitre]};`)
    ligne('}')
  }
  ligne()
  ligne(`${TITRES.map(selecteurDe).join(', ')} {`)
  ligne(`  break-after: ${p.titresSolidaires ? 'avoid' : 'auto'};`)
  ligne('}')
  return L.join('\n') + '\n'
}
