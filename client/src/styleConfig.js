// Côté client de la feuille de style. Le **modèle** vit dans
// `shared/style.js`, partagé avec le serveur (voir le commentaire en tête
// de ce fichier-là) ; il ne reste ici que ce qui est propre au navigateur :
// aller chercher une feuille de style, l'enregistrer, et la traduire en CSS
// pour l'export PDF.
//
// Rien dans ce fichier ne connaît le nom d'un réglage : tout se déduit de
// `BLOCS` et `PROPRIETES`. Ajouter « retrait de première ligne » n'a demandé
// aucune ligne ici — c'est le but.

export {
  POLICES,
  ALIGNEMENTS,
  INTERLIGNES,
  FORMATS_PAGE,
  LANGUES,
  langue,
  PROPRIETES,
  BLOCS,
  VERSION_STYLE,
  styleParDefaut,
  fusionner,
  reduire,
  police,
  formatPage,
} from '../../shared/style.js'

import { BLOCS, POLICES, formatPage, police, styleParDefaut } from '../../shared/style.js'

/** Pile CSS de la police d'un bloc. */
export function fontFamily(fontId) {
  return police(fontId).css
}

/** Nom unique à demander à Word (`undefined` pour « Système » : laisser
 * Word choisir sa police par défaut). */
export function docxFontName(fontId) {
  return police(fontId).docx
}

// --- Chargement et enregistrement -----------------------------------------

/** Le style **par défaut de l'instance** — celui que règle la page
 * `#/style`. Depuis le 16/09/2026 ce n'est plus la loi de tous les
 * documents, seulement le point de départ de ceux qui n'ont pas le leur. */
export async function loadStyle() {
  try {
    const res = await fetch('/api/style')
    if (!res.ok) return styleParDefaut()
    return await res.json()
  } catch {
    return styleParDefaut()
  }
}

export async function saveStyle(style) {
  const res = await fetch('/api/style', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(style),
  })
  if (!res.ok) throw new Error(`échec de l'enregistrement (${res.status})`)
  return res.json()
}

/** La mise en page effective d'un document : valeurs par défaut du code,
 * puis style de l'instance, puis celui du document. `propre` dit si le
 * document a fait ses propres choix ou s'il suit encore le défaut. */
export async function loadDocStyle(docId) {
  try {
    const res = await fetch(`/api/docs/${docId}/style`)
    if (!res.ok) return { style: styleParDefaut(), propre: false }
    return await res.json()
  } catch {
    return { style: styleParDefaut(), propre: false }
  }
}

export async function saveDocStyle(docId, style) {
  const res = await fetch(`/api/docs/${docId}/style`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(style),
  })
  if (!res.ok) throw new Error(`échec de l'enregistrement (${res.status})`)
  return res.json()
}

/** Rend au document l'héritage du style par défaut de l'instance. */
export async function resetDocStyle(docId) {
  const res = await fetch(`/api/docs/${docId}/style`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`échec (${res.status})`)
  return res.json()
}

// --- Traduction en CSS ----------------------------------------------------

const MM_EN_PT = 72 / 25.4

/** Des millimètres du modèle vers les points du CSS. */
function enPt(mm) {
  return Math.round((Number(mm) || 0) * MM_EN_PT * 100) / 100
}

/** Les déclarations CSS d'un bloc. Engendrées à partir des valeurs du bloc,
 * sans liste de propriétés en dur : un réglage ajouté au modèle qui
 * n'apparaît pas ici est simplement ignoré à l'export, jamais une erreur. */
function blocCss(valeurs) {
  const parts = [
    `font-family: ${fontFamily(valeurs.font)}`,
    `font-size: ${valeurs.size}pt`,
    `font-weight: ${valeurs.bold ? 700 : 400}`,
    `font-style: ${valeurs.italic ? 'italic' : 'normal'}`,
    `text-transform: ${valeurs.uppercase ? 'uppercase' : 'none'}`,
    `text-align: ${valeurs.align || 'left'}`,
    `line-height: ${valeurs.lineHeight ?? 1.15}`,
    // Le retrait à gauche est une marge, et non un `padding` : c'est ce
    // qui le fait se comporter comme dans un traitement de texte, et ce que
    // reproduit `pad()` côté Typst.
    `margin: ${valeurs.spaceBefore ?? 0}pt 0 ${valeurs.spaceAfter ?? 0}pt ${enPt(valeurs.indent)}pt`,
    `text-indent: ${enPt(valeurs.firstLineIndent)}pt`,
  ]
  // Césures : uniquement sur du texte justifié. Justifier sans couper, ce
  // serait le pire des deux mondes — les espaces s'étirent sans rien pour
  // absorber la différence. C'est aussi ce que fait Typst par défaut
  // (`hyphenate: auto` = « oui si justifié »), ce qui garde les deux
  // moteurs comparables. La langue vient de `<html lang="fr">`.
  if ((valeurs.align || 'left') === 'justify') {
    parts.push('-webkit-hyphens: auto', 'hyphens: auto', 'hyphenate-limit-chars: 6 3 3')
  }
  return parts.join('; ')
}

/** La feuille de style entière en CSS, portée sous `scope` (`.print-doc`
 * pour l'export PDF). Une règle par bloc, dans l'ordre du modèle. */
export function buildStyleCss(style, { scope }) {
  const complet = style && style.blocs ? style : styleParDefaut()
  return BLOCS.map((b) => `${scope} ${b.balise} { ${blocCss(complet.blocs[b.id] || b.defauts)} }`).join('\n')
}

/** La règle `@page` — taille, marges, numérotation. Sans équivalent dans
 * l'éditeur, qui défile sans pagination : export PDF seulement. */
export function buildPageCss(style, { scope } = {}) {
  const p = (style && style.page) || styleParDefaut().page
  const format = formatPage(p.size)
  const taille = format.id === 'Letter' ? 'letter' : format.id
  const pageNumbers = p.pageNumbers || { enabled: false, startAt: 1 }
  const corps = (style && style.blocs && style.blocs.body) || styleParDefaut().blocs.body
  const bottomCenter = pageNumbers.enabled
    ? `\n  @bottom-center { content: counter(page); font-family: ${fontFamily(corps.font)}; font-size: 9pt; }`
    : ''
  const pageRule = `@page { size: ${taille}; margin: ${p.marginTop}mm ${p.marginRight}mm ${p.marginBottom}mm ${p.marginLeft}mm;${bottomCenter} }`
  if (!pageNumbers.enabled || !scope) return pageRule
  // -1 : le compteur « page » s'incrémente avant l'affichage de chaque
  // page, donc pour que la première affiche `startAt` il faut le remettre à
  // startAt - 1 juste avant.
  const startAt = Math.max(1, Number(pageNumbers.startAt) || 1)
  return `${pageRule}\n${scope} { counter-reset: page ${startAt - 1}; }`
}

// Conservé pour les quelques appels qui veulent la forme complète sans
// passer par le serveur.
export const DEFAULT_STYLE = styleParDefaut()
