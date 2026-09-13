// Shared "feuille de style" model — used by the admin page (adminStyle.js),
// the light in-editor preview (editor.js), and the PDF export (pdfExport.js).
// One config, three consumers: the point is that changing a setting here
// changes what the editor shows a little and what the PDF export shows
// fully, from the same source, never three copies to keep in sync by hand.

// A fixed, closed list rather than free text — see the design note in
// README2.md: guarantees the PDF export renders with the same font the
// admin picked, regardless of what's actually installed on whichever
// machine opens the PDF later. Common, very-widely-available stacks for
// this first version; embedding real font files is a possible later step,
// not needed to ship this.
export const FONT_OPTIONS = [
  { id: 'system', label: 'Système (sans-serif)', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' },
  { id: 'serif', label: 'Serif (Georgia)', family: 'Georgia, "Times New Roman", serif' },
  { id: 'times', label: 'Times New Roman', family: '"Times New Roman", Times, serif' },
  { id: 'arial', label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { id: 'mono', label: 'Monospace', family: '"Courier New", Courier, monospace' },
  // Auto-hébergées (fichiers .woff2 dans client/src/fonts/, @font-face dans
  // style.css) plutôt que chargées depuis Google Fonts au moment de
  // l'affichage — même raisonnement que le reste de cette liste fermée :
  // aucune dépendance réseau, et garantie que l'export PDF utilise
  // exactement la même police que celle réglée ici.
  { id: 'roboto', label: 'Roboto', family: '"Roboto", -apple-system, sans-serif' },
  { id: 'libre-caslon-text', label: 'Libre Caslon Text', family: '"Libre Caslon Text", Georgia, serif' },
]

// Interligne du corps de texte uniquement (voir DEFAULT_STYLE.body plus bas)
// — citation et titres n'en ont pas besoin pour l'instant, demande précise.
export const LINE_HEIGHT_OPTIONS = [1, 1.15, 1.5, 2]

export const ALIGN_OPTIONS = [
  { id: 'left', label: 'Gauche' },
  { id: 'center', label: 'Centré' },
  { id: 'right', label: 'Droite' },
  { id: 'justify', label: 'Justifié' },
]

export const PAGE_SIZE_OPTIONS = [
  { id: 'A4', label: 'A4' },
  { id: 'A5', label: 'A5' },
  { id: 'Letter', label: 'Letter (US)' },
]

/** One "block" style shape (corps de texte, citation, titres) — kept
 * identical across all three so the same code (blockCss below) renders
 * any of them. `sizes` only appears on the heading block (one size per
 * niveau 1-5, everything else shared — see the design note in README2.md
 * on why titres don't get five fully independent style blocks). */
export const DEFAULT_STYLE = {
  page: {
    size: 'A4',
    marginTop: 25,
    marginRight: 20,
    marginBottom: 25,
    marginLeft: 20,
    // Numérotation des pages — export PDF seulement (voir buildPageCss plus
    // bas) : aucun sens dans l'éditeur en défilement continu, même principe
    // que taille de page/marges juste au-dessus.
    pageNumbers: { enabled: false, startAt: 1 },
  },
  body: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', spaceBefore: 0, spaceAfter: 8, lineHeight: 1.15 },
  heading: {
    font: 'system',
    bold: true,
    italic: false,
    uppercase: false,
    align: 'left',
    spaceBefore: 16,
    spaceAfter: 8,
    sizes: [24, 20, 17, 15, 13],
  },
}

export function fontFamily(fontId) {
  return (FONT_OPTIONS.find((f) => f.id === fontId) || FONT_OPTIONS[0]).family
}

/** Fetches the current style config from the server. Never throws or
 * caches — the config is a tiny JSON file, and always re-reading it means
 * an export always reflects whatever was last saved on the admin page,
 * even from another tab. Falls back to DEFAULT_STYLE if the server can't
 * be reached or hasn't got one yet. */
export async function loadStyle() {
  try {
    const res = await fetch('/api/style')
    if (!res.ok) return DEFAULT_STYLE
    return await res.json()
  } catch {
    return DEFAULT_STYLE
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

/** One block's CSS declarations (corps/citation/titre). Applies identically
 * in the editor preview and at export/print — unlike the old underline
 * setting (removed), italic has no visual collision with the tracked-
 * insertion styling, so there's no reason to hold it back from the editor. */
function blockDeclarations(block) {
  const parts = [
    `font-family: ${fontFamily(block.font)}`,
    `font-weight: ${block.bold ? 700 : 400}`,
    `font-style: ${block.italic ? 'italic' : 'normal'}`,
    `text-transform: ${block.uppercase ? 'uppercase' : 'none'}`,
    `text-align: ${block.align || 'left'}`,
    `margin: ${block.spaceBefore ?? 0}pt 0 ${block.spaceAfter ?? 0}pt 0`,
  ]
  return parts.join('; ')
}

/**
 * The style config as CSS text, scoped under `scope` (a selector prefix —
 * `.ProseMirror` for the light editor preview, `.print-doc` for the PDF/
 * print export). Page size/margins are deliberately NOT included here —
 * they mean nothing inside a scrolling editor with no pagination; see
 * printCss below, PDF-export-only.
 */
export function buildStyleCss(style, { scope }) {
  const lines = []
  const bodyLineHeight = style.body.lineHeight ?? DEFAULT_STYLE.body.lineHeight
  // Citation retirée de la feuille de style (13/09/2026) : le blockquote
  // s'aligne sur le texte normal plutôt que d'avoir son propre réglage.
  lines.push(
    `${scope} p, ${scope} blockquote { font-size: ${style.body.size}pt; line-height: ${bodyLineHeight}; ${blockDeclarations(style.body)} }`
  )
  const headingDecl = blockDeclarations(style.heading)
  const sizes = style.heading.sizes || DEFAULT_STYLE.heading.sizes
  for (let level = 1; level <= 5; level++) {
    lines.push(`${scope} h${level} { font-size: ${sizes[level - 1]}pt; ${headingDecl} }`)
  }
  return lines.join('\n')
}

/** `@page` rule for the PDF/print export — the one place page size and
 * margins actually apply. `scope` (the `.print-doc` container, same as
 * buildStyleCss) is where the starting page number gets reset — see
 * `pageNumbers` below. Numérotation des pages : `@page { @bottom-center {
 * content: counter(page) } }` (support Chrome 131+/Safari 18.2+ — voir
 * README.md, section "Feuille de style admin") plutôt qu'une bibliothèque
 * de pagination : la fonctionnalité existe maintenant nativement dans les
 * navigateurs déjà ciblés par ce projet pour l'export PDF. */
export function buildPageCss(style, { scope } = {}) {
  const p = style.page
  const size = p.size === 'Letter' ? 'letter' : p.size === 'A5' ? 'A5' : 'A4'
  const pageNumbers = p.pageNumbers || DEFAULT_STYLE.page.pageNumbers
  const bottomCenter = pageNumbers.enabled
    ? `\n  @bottom-center { content: counter(page); font-family: ${fontFamily(style.body.font)}; font-size: 9pt; }`
    : ''
  const pageRule = `@page { size: ${size}; margin: ${p.marginTop}mm ${p.marginRight}mm ${p.marginBottom}mm ${p.marginLeft}mm;${bottomCenter} }`
  if (!pageNumbers.enabled || !scope) return pageRule
  // -1 : le compteur "page" du navigateur s'incrémente avant l'affichage de
  // chaque page (voir le commentaire de la spec CSS Paged Media) — pour
  // que la première page affiche `startAt`, il faut le réinitialiser à
  // startAt - 1 juste avant.
  const startAt = Math.max(1, Number(pageNumbers.startAt) || 1)
  return `${pageRule}\n${scope} { counter-reset: page ${startAt - 1}; }`
}
