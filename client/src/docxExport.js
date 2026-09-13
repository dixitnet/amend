// Export "Word (.docx)" — troisième format à côté de .md et .pdf (voir le
// menu "Exporter" dans editor.js). Applique la feuille de style dans son
// intégralité (police, taille, gras, italique, majuscules, alignement,
// espacement, interligne, taille de page, marges, numéros de page) — même
// principe que pdfExport.js. Contrairement à l'export PDF, l'éditeur lui-
// même n'applique plus du tout la feuille de style depuis le 13/09/2026
// (voir styleConfig.js/adminStyle.js) : ce fichier et pdfExport.js sont les
// deux seuls endroits qui la prennent réellement en compte.
//
// Comme dans mdExport.js/pdfExport.js, "l'état présent" du document est
// pris tel quel : les marques insertion/suppression du suivi des
// modifications ressortent en texte normal, rien n'est accepté ni rejeté
// au passage.
//
// Bibliothèque `docx` (dolanmiu/docx, npm) plutôt qu'une implémentation
// maison du format .docx (un zip de XML avec son propre schéma OOXML) —
// même raisonnement que nodemailer pour l'email (voir README.md, section
// "Droits et authentification") : un format aussi subtil gagne à s'appuyer
// sur une bibliothèque mûre plutôt que sur du code maison. Fonctionne
// entièrement dans le navigateur (Packer.toBlob) : aucune dépendance
// réseau à l'export, cohérent avec le reste du projet.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  UnderlineType,
  LineRuleType,
  PageNumber,
  NumberFormat,
  Footer,
  convertMillimetersToTwip,
} from 'docx'
import { DEFAULT_STYLE, docxFontName } from './styleConfig.js'
import { safeFilenameBase } from './mdExport.js'

// Dimensions standard en millimètres — converties en twips (1/20e de point,
// l'unité de `docx`) via `convertMillimetersToTwip`, même valeurs que
// `buildPageCss` (styleConfig.js) utilise en CSS pour l'export PDF.
const PAGE_SIZES_MM = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
}

const ALIGN_MAP = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
]

function ptToHalfPt(pt) {
  return Math.round((pt || 0) * 2)
}

function ptToTwips(pt) {
  return Math.round((pt || 0) * 20)
}

/** Propriétés de paragraphe (alignement, espacement avant/après, et
 * interligne si fourni) pour un bloc `block` de la feuille de style
 * (style.body ou style.heading). */
function paragraphProps(block, { lineHeight } = {}) {
  const spacing = {
    before: ptToTwips(block.spaceBefore),
    after: ptToTwips(block.spaceAfter),
  }
  if (lineHeight) {
    // "auto" : la valeur est en 240ièmes d'une ligne simple (240 = 1,0),
    // même principe que `line-height` en CSS — voir buildStyleCss.
    spacing.line = Math.round(lineHeight * 240)
    spacing.lineRule = LineRuleType.AUTO
  }
  return {
    alignment: ALIGN_MAP[block.align] || AlignmentType.LEFT,
    spacing,
  }
}

/** Propriétés de texte (police/taille/gras/italique/majuscules) communes à
 * tous les runs d'un bloc — combinées ensuite avec les marques propres à
 * chaque run (gras/italique/souligné/barré) dans inlineToRuns. */
function baseRunProps(block, sizePt) {
  const font = docxFontName(block.font)
  return {
    ...(font ? { font } : {}),
    size: ptToHalfPt(sizePt),
    bold: !!block.bold,
    italics: !!block.italic,
    allCaps: !!block.uppercase,
  }
}

/** Les runs (morceaux de texte avec mise en forme) d'un nœud "inline"
 * ProseMirror — même détail que inlineToHtml (pdfExport.js) : les marques
 * insertion/suppression du suivi des modifications ne changent rien au
 * texte (voir la note en tête de fichier). */
function inlineToRuns(node, block, sizePt) {
  const runs = []
  const base = baseRunProps(block, sizePt)
  node.forEach((child) => {
    if (child.type.name === 'hard_break') {
      runs.push(new TextRun({ ...base, text: '', break: 1 }))
      return
    }
    if (!child.isText) return
    let bold = base.bold
    let italics = base.italics
    let strike = false
    let underline
    for (const mark of child.marks) {
      const name = mark.type.name
      if (name === 'strong') bold = true
      else if (name === 'em') italics = true
      else if (name === 'strike') strike = true
      else if (name === 'underline') underline = { type: UnderlineType.SINGLE }
      // insertion / deletion : texte normal, voir la note en tête de fichier.
    }
    runs.push(new TextRun({ ...base, bold, italics, strike, underline, text: child.text }))
  })
  // Un paragraphe entièrement vide a quand même besoin d'un run (sinon Word
  // n'affiche pas la ligne vide) — un run de texte vide suffit.
  return runs.length ? runs : [new TextRun({ ...base, text: '' })]
}

function listItemToParagraphs(item, style, level) {
  const out = []
  const lineHeight = style.body.lineHeight ?? DEFAULT_STYLE.body.lineHeight
  item.forEach((child) => {
    if (child.type.name === 'bullet_list') {
      out.push(...listToParagraphs(child, style, level + 1))
    } else {
      out.push(
        new Paragraph({
          ...paragraphProps(style.body, { lineHeight }),
          bullet: { level },
          children: inlineToRuns(child, style.body, style.body.size),
        })
      )
    }
  })
  return out
}

function listToParagraphs(list, style, level) {
  const out = []
  list.forEach((item) => out.push(...listItemToParagraphs(item, style, level)))
  return out
}

/** Un nœud de bloc ProseMirror -> une ou plusieurs `Paragraph` docx. */
function blockToParagraphs(node, style) {
  switch (node.type.name) {
    case 'heading': {
      const level = node.attrs.level
      const sizes = style.heading.sizes || DEFAULT_STYLE.heading.sizes
      const sizePt = sizes[level - 1] || sizes[sizes.length - 1]
      return [
        new Paragraph({
          heading: HEADING_LEVELS[level - 1],
          ...paragraphProps(style.heading),
          children: inlineToRuns(node, style.heading, sizePt),
        }),
      ]
    }
    case 'paragraph': {
      const lineHeight = style.body.lineHeight ?? DEFAULT_STYLE.body.lineHeight
      return [
        new Paragraph({
          ...paragraphProps(style.body, { lineHeight }),
          children: inlineToRuns(node, style.body, style.body.size),
        }),
      ]
    }
    case 'blockquote': {
      // Aligné sur le texte normal (13/09/2026, voir README.md) : mêmes
      // propriétés que le corps de texte, aucune indentation particulière
      // — cohérent avec pdfExport.js/styleConfig.js (buildStyleCss applique
      // la même règle à <p> et <blockquote>).
      const out = []
      node.forEach((child) => out.push(...blockToParagraphs(child, style)))
      return out
    }
    case 'bullet_list':
      return listToParagraphs(node, style, 0)
    case 'horizontal_rule':
      // Saut de page — même rôle qu'à l'export PDF (voir pdfExport.js) :
      // ce nœud ne dessine jamais de trait, juste un saut de page.
      return [new Paragraph({ pageBreakBefore: true, children: [] })]
    default:
      return []
  }
}

/** Construit le fichier .docx entier sous forme de Blob, prêt à
 * télécharger — même feuille de style (`style`, voir styleConfig.js) que
 * l'export PDF. */
export async function buildDocxBlob(doc, style) {
  const children = []
  doc.forEach((node) => {
    children.push(...blockToParagraphs(node, style))
  })

  const page = style.page || DEFAULT_STYLE.page
  const [widthMm, heightMm] = PAGE_SIZES_MM[page.size] || PAGE_SIZES_MM.A4
  const pageNumbers = page.pageNumbers || DEFAULT_STYLE.page.pageNumbers

  const pageProperties = {
    size: {
      width: convertMillimetersToTwip(widthMm),
      height: convertMillimetersToTwip(heightMm),
    },
    margin: {
      top: convertMillimetersToTwip(page.marginTop),
      right: convertMillimetersToTwip(page.marginRight),
      bottom: convertMillimetersToTwip(page.marginBottom),
      left: convertMillimetersToTwip(page.marginLeft),
    },
  }

  let footers
  if (pageNumbers.enabled) {
    // Bas de page centré, comme `@bottom-center` en CSS d'impression (voir
    // buildPageCss, styleConfig.js) — même position dans les deux formats.
    pageProperties.pageNumbers = {
      start: Math.max(1, Number(pageNumbers.startAt) || 1),
      formatType: NumberFormat.DECIMAL,
    }
    footers = {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT] })],
          }),
        ],
      }),
    }
  }

  const docxDocument = new Document({
    sections: [
      {
        properties: { page: pageProperties },
        ...(footers ? { footers } : {}),
        // Un document vide a quand même besoin d'un paragraphe — sinon
        // certaines versions de Word refusent d'ouvrir le fichier.
        children: children.length ? children : [new Paragraph({})],
      },
    ],
  })

  return Packer.toBlob(docxDocument)
}

/** Construit le .docx et déclenche son téléchargement — même titre/nom de
 * fichier que markdownFilename (mdExport.js), juste une extension
 * différente. */
export async function downloadDocx(doc, style, title) {
  const blob = await buildDocxBlob(doc, style)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilenameBase(title)}.docx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
