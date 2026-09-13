// "Exporter en PDF" — the light v1 (see README2.md for the longer-term
// options considered). Serializes the document to plain HTML (same
// "current state taken literally" convention as mdExport.js: tracked
// insertion/deletion marks come out as plain text, nothing accepted or
// rejected), wraps it in the feuille-de-style CSS (styleConfig.js) plus an
// `@page` rule for size/margins, and prints it via the browser's own
// print — the person picks "Enregistrer en PDF" in the system dialog.
//
// The trick for "print only the document, not the rest of the app": the
// content is dropped into a normally-hidden #print-root, and a print-only
// stylesheet (see .printing rules in style.css) hides everything else and
// reveals #print-root only while actually printing. No popup window (can
// be blocked, and inherits nothing from this page's CSS) and no iframe
// (cross-origin-style headaches for zero benefit here).

import { buildStyleCss, buildPageCss } from './styleConfig.js'

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function wrapMark(text, mark) {
  const name = mark.type.name
  if (name === 'strong') return `<strong>${text}</strong>`
  if (name === 'em') return `<em>${text}</em>`
  if (name === 'strike') return `<s>${text}</s>`
  if (name === 'underline') return `<u>${text}</u>`
  return text // insertion / deletion: plain text, see file-level note above
}

function inlineToHtml(node) {
  let out = ''
  node.forEach((child) => {
    if (child.isText) {
      let t = escapeHtml(child.text)
      for (const mark of child.marks) t = wrapMark(t, mark)
      out += t
    } else if (child.type.name === 'hard_break') {
      out += '<br>'
    }
  })
  return out
}

function listItemToHtml(item) {
  let out = ''
  item.forEach((child) => {
    out += child.type.name === 'bullet_list' ? blockToHtml(child) : inlineToHtml(child)
  })
  return `<li>${out}</li>`
}

function blockToHtml(node) {
  switch (node.type.name) {
    case 'heading':
      return `<h${node.attrs.level}>${inlineToHtml(node)}</h${node.attrs.level}>`
    case 'paragraph':
      return `<p>${inlineToHtml(node)}</p>`
    case 'blockquote': {
      let inner = ''
      node.forEach((child) => {
        inner += blockToHtml(child)
      })
      return `<blockquote>${inner}</blockquote>`
    }
    case 'bullet_list': {
      let inner = ''
      node.forEach((item) => {
        inner += listItemToHtml(item)
      })
      return `<ul>${inner}</ul>`
    }
    case 'horizontal_rule':
      // Contrairement à l'éditeur (un <hr> visible, voir schema.js) et à
      // l'export .md (une ligne "---"), le PDF n'affiche aucun trait ici :
      // c'est un saut de page (voir la règle .page-break dans
      // printDocument ci-dessous), la fonction réelle de ce nœud.
      return '<div class="page-break"></div>'
    default:
      return ''
  }
}

/** The whole document as plain HTML (no <html>/<head> — just the content
 * markup, dropped into #print-doc by printDocument below). */
export function docToHtml(doc) {
  let out = ''
  doc.forEach((node) => {
    out += blockToHtml(node)
  })
  return out
}

/** Builds and triggers a print of `doc` using `style` (from styleConfig.js)
 * — the browser's own print dialog, "Enregistrer en PDF" gives the file.
 * `title` becomes the document title while printing, which most browsers
 * use as the default filename in that dialog. */
export function printDocument(doc, title, style) {
  const html = docToHtml(doc)
  const css = buildStyleCss(style, { scope: '.print-doc' })
  const pageCss = buildPageCss(style, { scope: '.print-doc' })

  const existing = document.getElementById('print-root')
  if (existing) existing.remove()

  // `break-after` (standard) + `page-break-after` (alias encore nécessaire
  // pour certains moteurs d'impression) : force un saut de page à cet
  // endroit sans rien dessiner (voir blockToHtml ci-dessus) — la ligne
  // visible dans l'éditeur (schema.js) n'a de sens qu'à l'écran.
  const pageBreakCss = '.print-doc .page-break { break-after: page; page-break-after: always; height: 0; margin: 0; border: none; }'

  const root = document.createElement('div')
  root.id = 'print-root'
  root.innerHTML = `<style>${pageCss}\n${css}\n${pageBreakCss}</style><div class="print-doc">${html}</div>`
  document.body.appendChild(root)

  const previousTitle = document.title
  if (title) document.title = title
  document.body.classList.add('printing')

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    document.body.classList.remove('printing')
    document.title = previousTitle
    root.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // Belt-and-braces: `afterprint` is reliable in every real browser, but if
  // some embedding context never fires it, don't leave #print-root (and the
  // "printing" body class) stuck around forever.
  setTimeout(cleanup, 30000)
}
