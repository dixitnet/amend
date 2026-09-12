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
]

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
  page: { size: 'A4', marginTop: 25, marginRight: 20, marginBottom: 25, marginLeft: 20 },
  body: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', spaceBefore: 0, spaceAfter: 8 },
  quote: { font: 'system', size: 11, bold: false, italic: false, uppercase: false, align: 'left', spaceBefore: 4, spaceAfter: 8 },
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
  lines.push(`${scope} p { font-size: ${style.body.size}pt; ${blockDeclarations(style.body)} }`)
  lines.push(
    `${scope} blockquote { font-size: ${style.quote.size}pt; ${blockDeclarations(style.quote)} }`
  )
  const headingDecl = blockDeclarations(style.heading)
  const sizes = style.heading.sizes || DEFAULT_STYLE.heading.sizes
  for (let level = 1; level <= 5; level++) {
    lines.push(`${scope} h${level} { font-size: ${sizes[level - 1]}pt; ${headingDecl} }`)
  }
  return lines.join('\n')
}

/** `@page` rule for the PDF/print export — the one place page size and
 * margins actually apply. */
export function buildPageCss(style) {
  const p = style.page
  const size = p.size === 'Letter' ? 'letter' : p.size === 'A5' ? 'A5' : 'A4'
  return `@page { size: ${size}; margin: ${p.marginTop}mm ${p.marginRight}mm ${p.marginBottom}mm ${p.marginLeft}mm; }`
}
