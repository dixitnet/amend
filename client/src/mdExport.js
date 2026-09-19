// Serializes the current ProseMirror document to plain Markdown, for the
// "Exporter (.md)" button. Deliberately hand-rolled and minimal, matching
// this project's schema (headings, paragraphs, blockquote, listes à puces,
// numérotées et à cocher,
// strong/em/underline/strike) — no external Markdown library needed for
// such a small, fixed set of node/mark types.
//
// Ce que le document contient au moment où il arrive ici a déjà été
// décidé : `exportVariante.js` résout les marques du suivi avant de passer
// le document à ce fichier — acceptées pour « document final », rendues en
// souligné/barré ordinaire pour « version en cours ». Les marques
// insertion/suppression qui parviendraient tout de même jusqu'ici sont donc
// sans effet, à dessein.

/** Wraps `text` in a Markdown emphasis-style delimiter (**, *, ~~), pulling
 * any leading/trailing whitespace outside the delimiters first. CommonMark
 * emphasis can't start or end with whitespace right inside its delimiters
 * (most parsers then refuse to treat it as emphasis at all) — and a marked
 * run starting/ending with a space is an easy, common case in practice
 * (e.g. holding a mark on while typing " combo" right after other marked
 * text). A run that's pure whitespace is left unwrapped — there's nothing
 * meaningful to emphasize. */
function wrapEmphasis(text, delimiter) {
  const [, lead, core, trail] = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (core === '') return text
  return `${lead}${delimiter}${core}${delimiter}${trail}`
}

function markTextToMarkdown(text, marks) {
  let out = text
  for (const mark of marks) {
    const name = mark.type.name
    if (name === 'strong') out = wrapEmphasis(out, '**')
    else if (name === 'em') out = wrapEmphasis(out, '*')
    else if (name === 'strike') out = wrapEmphasis(out, '~~')
    else if (name === 'underline') out = `<u>${out}</u>` // an HTML tag, not whitespace-sensitive
    // insertion / deletion: no wrapper — see note above.
  }
  return out
}

function inlineToMarkdown(node) {
  let out = ''
  node.forEach((child) => {
    if (child.isText) out += markTextToMarkdown(child.text, child.marks)
    else if (child.type.name === 'hard_break') out += '  \n'
  })
  return out
}

const LISTES = ['bullet_list', 'ordered_list', 'task_list']

/** One list item's lines, at the given indent depth (0 = top-level list).
 * `puce` est la marque de l'élément : « - », « 3. » ou « - [x] » selon le
 * type de liste (15/09/2026). */
function listItemToLines(item, depth, puce) {
  const indent = '  '.repeat(depth)
  const lines = []
  let first = true
  item.forEach((child) => {
    if (LISTES.includes(child.type.name)) {
      lines.push(...listToLines(child, depth + 1))
    } else {
      lines.push((first ? `${indent}${puce} ` : `${indent}  `) + inlineToMarkdown(child))
    }
    first = false
  })
  return lines
}

function listToLines(list, depth) {
  const lines = []
  let numero = list.type.name === 'ordered_list' ? list.attrs.order || 1 : 0
  list.forEach((item) => {
    const puce =
      list.type.name === 'ordered_list'
        ? `${numero++}.`
        : list.type.name === 'task_list'
          ? `- [${item.attrs.checked ? 'x' : ' '}]`
          : '-'
    lines.push(...listItemToLines(item, depth, puce))
  })
  return lines
}

/** Un tableau en syntaxe GitHub (pipes). La première ligne devient
 * l'en-tête : le Markdown l'exige (le séparateur `---` ne peut pas être
 * ailleurs), même quand l'auteur n'a pas voulu d'en-tête. Les retours à la
 * ligne dans une cellule sont remplacés par un espace et les pipes
 * échappés — sans quoi le tableau serait cassé à la lecture. */
function tableToLines(table) {
  const lignes = []
  table.forEach((row) => {
    const cellules = []
    row.forEach((cell) => {
      let texte = ''
      cell.forEach((bloc) => {
        texte += (texte ? ' ' : '') + inlineToMarkdown(bloc)
      })
      cellules.push(texte.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim())
    })
    lignes.push(`| ${cellules.join(' | ')} |`)
    if (lignes.length === 1) lignes.push(`| ${cellules.map(() => '---').join(' | ')} |`)
  })
  return lignes
}

/** Une image, en lien **absolu** vers l'instance. Choix assumé du
 * 16/09/2026 : un .md est un fichier unique et l'URL est protégée par la
 * session, donc le lien ne s'affichera pas hors connexion. Les deux autres
 * options étaient pires — l'image en data-URI gonfle le .md jusqu'à
 * l'absurde, et une archive .zip n'est plus « télécharger un .md ».
 * L'export Markdown sert à récupérer le texte, pas à archiver. */
function imageEnMarkdown(node) {
  const base = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  return `![${node.attrs.alt || 'image'}](${base}${node.attrs.src})`
}

/** One block node's Markdown lines, including its trailing blank-line
 * separator (blocks are joined with '\n' afterwards, so consecutive blocks
 * end up one blank line apart, like normal Markdown paragraphs). */
function blockToLines(node) {
  switch (node.type.name) {
    case 'heading':
      return [`${'#'.repeat(node.attrs.level)} ${inlineToMarkdown(node)}`, '']
    case 'paragraph':
      return [inlineToMarkdown(node), '']
    case 'blockquote': {
      const inner = []
      node.forEach((child) => inner.push(...blockToLines(child)))
      while (inner.length && inner[inner.length - 1] === '') inner.pop()
      return [...inner.map((line) => (line === '' ? '>' : `> ${line}`)), '']
    }
    case 'bullet_list':
    case 'ordered_list':
    case 'task_list':
      return [...listToLines(node, 0), '']
    case 'table':
      return [...tableToLines(node), '']
    case 'image':
      return [imageEnMarkdown(node), '']
    case 'horizontal_rule':
      // Le Markdown n'a pas de notion de saut de page (voir typstExport.js
      // pour ce que devient ce même nœud à l'export PDF) — la ligne
      // horizontale standard reste la meilleure équivalence ici.
      return ['---', '']
    default:
      return ['']
  }
}

/** The whole document as a Markdown string, ready to save as a .md file. */
export function docToMarkdown(doc) {
  const lines = []
  doc.forEach((node) => lines.push(...blockToLines(node)))
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

/** A safe-ish filename base from the document's title, e.g. "Mon Titre" ->
 * "Mon Titre" (no extension) — shared with docxExport.js, so every export
 * format sanitizes the title the same way. Falls back to "document" for
 * an empty/blank title. */
export function safeFilenameBase(title) {
  const base = (title || '').trim() || 'document'
  return base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150)
}

/** A safe-ish filename from the document's title, e.g. "Mon Titre" ->
 * "Mon Titre.md". Falls back to "document.md" for an empty/blank title. */
export function markdownFilename(title) {
  return `${safeFilenameBase(title)}.md`
}

/** Triggers a browser download of `text` as a file named `filename`. */
export function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
