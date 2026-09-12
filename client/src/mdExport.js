// Serializes the current ProseMirror document to plain Markdown, for the
// "Exporter (.md)" button. Deliberately hand-rolled and minimal, matching
// this project's schema (headings, paragraphs, blockquote, bullet list,
// strong/em/underline/strike) — no external Markdown library needed for
// such a small, fixed set of node/mark types.
//
// Tracked changes (insertion/deletion marks) are exported as plain text
// either way — "l'état présent" (the file as it stands right now) is taken
// literally: nothing has been accepted or rejected yet, so both a pending
// insertion and a pending deletion are still part of the current document
// and both come out as ordinary text, with no special Markdown markup for
// either. (Worth revisiting later if what's wanted is instead "export as if
// everything pending were accepted".)

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

/** One list item's lines, at the given indent depth (0 = top-level list). */
function listItemToLines(item, depth) {
  const indent = '  '.repeat(depth)
  const lines = []
  let first = true
  item.forEach((child) => {
    if (child.type.name === 'bullet_list') {
      lines.push(...listToLines(child, depth + 1))
    } else {
      lines.push((first ? `${indent}- ` : `${indent}  `) + inlineToMarkdown(child))
    }
    first = false
  })
  return lines
}

function listToLines(list, depth) {
  const lines = []
  list.forEach((item) => lines.push(...listItemToLines(item, depth)))
  return lines
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
      return [...listToLines(node, 0), '']
    case 'horizontal_rule':
      // Le Markdown n'a pas de notion de saut de page (voir pdfExport.js
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

/** A safe-ish filename from the document's title, e.g. "Mon Titre" ->
 * "Mon Titre.md". Falls back to "document.md" for an empty/blank title. */
export function markdownFilename(title) {
  const base = (title || '').trim() || 'document'
  return `${base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150)}.md`
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
