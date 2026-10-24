// Export "Word (.docx)" — troisième format à côté de .md et .pdf (voir le
// menu "Exporter" dans editor.js). Applique la feuille de style dans son
// intégralité (police, taille, gras, italique, majuscules, alignement,
// espacement, interligne, taille de page, marges, numéros de page) — même
// principe que typstExport.js. Contrairement à l'export PDF, l'éditeur lui-
// même n'applique plus du tout la feuille de style depuis le 13/09/2026
// (voir styleConfig.js/stylePanel.js) : ce fichier et typstExport.js sont les
// deux seuls endroits qui la prennent réellement en compte.
//
// Ce que le document contient au moment où il arrive ici a déjà été
// décidé : `exportVariante.js` résout les marques du suivi avant de passer
// le document à ce fichier — acceptées pour « document final », rendues en
// souligné/barré ordinaire pour « version en cours ». Les marques
// insertion/suppression qui parviendraient tout de même jusqu'ici sont donc
// sans effet, à dessein.
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
  Header,
  TableOfContents,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  EndnoteReferenceRun,
  ExternalHyperlink,
  convertMillimetersToTwip,
  PageOrientation,
  BorderStyle,
} from 'docx'
import { numerosDesNotes } from './notes.js'
import { adresseAutorisee } from '../../shared/liens.js'
import { DEFAULT_STYLE, docxFontName } from './styleConfig.js'
import { BLOCS, langue, dimensionsPage, blocDuParagraphe } from '../../shared/style.js'

/** Les réglages d'un bloc du modèle (voir shared/style.js) : « body »,
 * « quote », « h1 »… Un document enregistré avant le 16/09/2026 est déjà
 * remonté au format actuel par le serveur, donc `style.blocs` existe
 * toujours ici — la garde ne sert qu'au cas d'un appel direct. */
function reglages(style, blocId) {
  const defini = BLOCS.find((b) => b.id === blocId)
  const bloc = (style.blocs && style.blocs[blocId]) || (defini && defini.defauts) || DEFAULT_STYLE.blocs.body
  // La langue est une propriété du document, pas du bloc — mais c'est le
  // bloc qui voyage jusqu'aux runs, seul endroit où Word la porte. On la
  // pose donc ici plutôt que de faire descendre le style entier à travers
  // une douzaine de signatures.
  return { ...bloc, _langue: langue(style.page && style.page.langue).docx }
}
import { nomDeFichier, telecharger, niveauTitre } from './exportCommun.js'
import { imageAutorisee } from '../../shared/securite.js'
import { nfc } from '../../shared/propre.js'

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
 * (voir shared/style.js : « body », « quote », « h1 »…). */
function paragraphProps(block, { lineHeight } = {}) {
  // `lineHeight` reste un paramètre séparé pour les quelques appels qui
  // veulent l'imposer ; sinon il vient du bloc lui-même, chaque bloc ayant
  // désormais le sien.
  if (lineHeight === undefined) lineHeight = block.lineHeight
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
  const props = {
    alignment: ALIGN_MAP[block.align] || AlignmentType.LEFT,
    spacing,
  }
  // Retrait de première ligne (16/09/2026) — en millimètres dans le modèle,
  // en twips pour `docx`.
  // Retrait de première ligne et retrait du bloc entier partagent la même
  // propriété Word, d'où la construction en une fois.
  const indent = {}
  if (block.firstLineIndent) indent.firstLine = convertMillimetersToTwip(block.firstLineIndent)
  if (block.indent) indent.left = convertMillimetersToTwip(block.indent)
  if (Object.keys(indent).length) props.indent = indent
  return props
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
    // Langue du texte : Word s'en sert pour la césure et le correcteur
    // orthographique — sans elle, un document anglais arrive souligné de
    // rouge d'un bout à l'autre.
    ...(block._langue ? { language: { value: block._langue } } : {}),
  }
}

/** Les runs (morceaux de texte avec mise en forme) d'un nœud "inline"
 * ProseMirror — même détail que typstExport.js : les marques
 * insertion/suppression du suivi des modifications ne changent rien au
 * texte (voir la note en tête de fichier). */
/** Les numéros des notes du document en cours d'export — posés par
 * buildDocxBlob, lus par inlineToRuns. */
let NOTES = new Map()

function inlineToRuns(node, block, sizePt, extra = null) {
  const runs = []
  const base = extra ? { ...baseRunProps(block, sizePt), ...extra } : baseRunProps(block, sizePt)
  node.forEach((child) => {
    if (child.type.name === 'hard_break') {
      runs.push(new TextRun({ ...base, text: '', break: 1 }))
      return
    }
    // Une note (28/09/2026) : une vraie note de fin Word, dont le texte est
    // déclaré sur le document (voir buildDocxBlob). Word renumérote.
    if (child.type.name === 'footnote') {
      if (NOTES.has(child)) runs.push(new EndnoteReferenceRun(NOTES.get(child)))
      return
    }
    if (!child.isText) return
    let bold = base.bold
    let italics = base.italics
    let strike = false
    let underline
    let lien = null
    for (const mark of child.marks) {
      const name = mark.type.name
      if (name === 'strong') bold = true
      else if (name === 'em') italics = true
      else if (name === 'strike') strike = true
      else if (name === 'underline') underline = { type: UnderlineType.SINGLE }
      else if (name === 'link') lien = adresseAutorisee(mark.attrs.href)
      // insertion / deletion : texte normal, voir la note en tête de fichier.
    }
    if (lien) {
      // Un vrai lien Word (30/09/2026), souligné et coloré directement sur
      // le run : le style « Hyperlink » n'existe pas dans un document que
      // nous fabriquons, et sans lui Word montrerait un texte ordinaire.
      runs.push(
        new ExternalHyperlink({
          link: lien,
          children: [
            new TextRun({
              ...base,
              bold,
              italics,
              strike,
              color: '1A4D8F',
              underline: { type: UnderlineType.SINGLE },
              text: child.text,
            }),
          ],
        })
      )
      return
    }
    runs.push(new TextRun({ ...base, bold, italics, strike, underline, text: child.text }))
  })
  // Un paragraphe entièrement vide a quand même besoin d'un run (sinon Word
  // n'affiche pas la ligne vide) — un run de texte vide suffit.
  return runs.length ? runs : [new TextRun({ ...base, text: '' })]
}

const LISTES = ['bullet_list', 'ordered_list', 'task_list']

/** Référence de numérotation déclarée sur le Document (voir plus bas) —
 * `docx` exige qu'une liste numérotée pointe vers une configuration, là où
 * les puces ont un raccourci intégré. */
const NUMEROTATION = 'liste-numerotee'
/** Les listes à tirets : un tiret à chaque niveau, comme à l'écran (la puce
 * intégrée de `docx` alterne •, ◦, ▪). */
const TIRETS = 'liste-tirets'

function listItemToParagraphs(item, style, level, type, coche) {
  const out = []
  const corps = reglages(style, 'body')
  let premierBloc = true
  item.forEach((child) => {
    if (LISTES.includes(child.type.name)) {
      out.push(...listToParagraphs(child, style, level + 1))
      premierBloc = false
      return
    }
    // Word n'a pas de case à cocher simple : une tâche devient un caractère
    // (☑/☐) en tête du premier bloc de l'élément, et son texte part barré
    // quand elle est cochée — comme à l'écran. D'où une indentation posée à
    // la main, puisqu'on n'utilise ni puce ni numérotation pour ce cas.
    const tache = type === 'task_list'
    const marque =
      tache && premierBloc
        ? [
            new TextRun({
              ...baseRunProps(corps, corps.size),
              text: coche ? '☑ ' : '☐ ',
            }),
          ]
        : []
    const puce =
      type === 'ordered_list'
        ? { numbering: { reference: NUMEROTATION, level } }
        : tache
          ? {
              indent: {
                left: convertMillimetersToTwip(6 + level * 6),
                hanging: convertMillimetersToTwip(5),
              },
            }
          : { numbering: { reference: TIRETS, level } }
    out.push(
      new Paragraph({
        ...paragraphProps(corps),
        ...puce,
        children: [...marque, ...inlineToRuns(child, corps, corps.size, tache && coche ? { strike: true } : null)],
      })
    )
    premierBloc = false
  })
  return out
}

function listToParagraphs(list, style, level) {
  const out = []
  const type = list.type.name
  list.forEach((item) => out.push(...listItemToParagraphs(item, style, level, type, !!item.attrs.checked)))
  return out
}

/** Récupère les octets de toutes les images du document, en une passe,
 * avant la construction : `blockToParagraphs` est synchrone, et `docx`
 * veut les octets, pas une URL. Une image qu'on n'arrive pas à relire
 * (session expirée, fichier disparu) n'interrompt pas l'export — elle
 * laisse une mention à sa place, ce qui est plus honnête qu'un document
 * qui perd silencieusement une figure. */
async function chargerImages(doc) {
  const sources = new Set()
  doc.descendants((node) => {
    if (node.type.name === 'image' && imageAutorisee(node.attrs.src)) sources.add(node.attrs.src)
  })
  const octetsPar = new Map()
  await Promise.all(
    [...sources].map(async (src) => {
      try {
        const reponse = await fetch(src)
        if (!reponse.ok) return
        const data = new Uint8Array(await reponse.arrayBuffer())
        octetsPar.set(src, { data, type: src.endsWith('.png') ? 'png' : 'jpg' })
      } catch {
        /* image laissée de côté, voir ci-dessus */
      }
    })
  )
  return octetsPar
}

/** Hauteur utile d'une page (entre les marges haute et basse), en pixels à
 * 96 ppp — pour les images « pleine page ». Deux pixels de moins que le calcul
 * exact : une image aussi haute que la zone de texte déborde sinon d'un
 * arrondi et passe seule à la page suivante. */
function hauteurUtilePx(style) {
  const page = style.page || DEFAULT_STYLE.page
  const [, hauteurMm] = dimensionsPage(page)
  const utileMm = hauteurMm - (page.marginTop || 0) - (page.marginBottom || 0)
  return Math.max(50, Math.round((utileMm / 25.4) * 96) - 2)
}

/** Largeur utile d'une page, en pixels à 96 ppp — l'unité qu'attend
 * `transformation` de `docx`. Une image plus large que ça déborderait des
 * marges de la feuille de style. */
function largeurUtilePx(style) {
  const page = style.page || DEFAULT_STYLE.page
  const [largeurMm] = dimensionsPage(page)
  const utileMm = largeurMm - (page.marginLeft || 0) - (page.marginRight || 0)
  return Math.max(50, Math.round((utileMm / 25.4) * 96))
}

/** Un nœud de bloc ProseMirror -> une ou plusieurs `Paragraph` docx. */
function blockToParagraphs(node, style, images, racine = false) {
  switch (node.type.name) {
    case 'heading': {
      const level = niveauTitre(node.attrs.level)
      // Chaque niveau a ses propres réglages complets depuis le 16/09/2026
      // — police, casse, alignement, espacement, et pas seulement sa taille.
      const bloc = reglages(style, `h${level}`)
      return [
        new Paragraph({
          heading: HEADING_LEVELS[level - 1],
          ...paragraphProps(bloc),
          // « Paragraphes solidaires » de Word : le titre suit le texte
          // qu'il annonce plutôt que de rester seul en bas d'une page
          // (19/09/2026). Le passage des titres 1 en belle page, lui, n'a
          // pas d'équivalent simple en .docx — il demanderait une section
          // par titre — et reste propre à l'export PDF.
          keepNext: (style && style.page ? style.page.titresSolidaires : true) !== false,
          children: inlineToRuns(node, bloc, bloc.size),
        }),
      ]
    }
    case 'paragraph': {
      // « Titre » et « Sous-titre » (14/10/2026) : le bloc de la feuille de
      // style change, et Word reçoit ses styles du même nom — « Title »,
      // « Subtitle » — pour que le document reste lisible dans son panneau
      // de styles. Ni l'un ni l'autre n'est un titre de section : ils
      // n'entrent pas dans la table des matières.
      const idBloc = blocDuParagraphe(node.attrs.style)
      const corps = reglages(style, idBloc)
      const styleWord =
        idBloc === 'title' ? { heading: HeadingLevel.TITLE } : idBloc === 'subtitle' ? { style: 'Subtitle' } : {}
      return [
        new Paragraph({
          ...styleWord,
          ...paragraphProps(corps),
          children: inlineToRuns(node, corps, corps.size),
        }),
      ]
    }
    case 'blockquote': {
      // La citation a son propre bloc réglable depuis le 16/09/2026 ; ses
      // valeurs par défaut restent celles du corps de texte, conformément à
      // la décision du 13/09, mais elles sont désormais modifiables. D'où
      // le rendu direct de ses paragraphes avec CE bloc, plutôt qu'une
      // récursion qui les traiterait en texte courant.
      const citation = reglages(style, 'quote')
      const out = []
      node.forEach((child) => {
        if (child.type.name === 'paragraph') {
          out.push(
            new Paragraph({
              ...paragraphProps(citation),
              children: inlineToRuns(child, citation, citation.size),
            })
          )
        } else {
          out.push(...blockToParagraphs(child, style, images))
        }
      })
      return out
    }
    case 'bullet_list':
    case 'ordered_list':
    case 'task_list':
      return listToParagraphs(node, style, 0)
    case 'table': {
      const corps = reglages(style, 'body')
      const lignes = []
      node.forEach((row) => {
        const cellules = []
        row.forEach((cell) => {
          const contenu = []
          cell.forEach((bloc) => {
            contenu.push(
              new Paragraph({
                ...paragraphProps(corps),
                children: inlineToRuns(bloc, corps, corps.size),
              })
            )
          })
          cellules.push(new TableCell({ children: contenu.length ? contenu : [new Paragraph({})] }))
        })
        lignes.push(new TableRow({ children: cellules }))
      })
      // Largeur en pourcentage : le document Word garde des marges propres
      // quel que soit le format de page choisi dans la feuille de style.
      return lignes.length ? [new Table({ rows: lignes, width: { size: 100, type: WidthType.PERCENTAGE } })] : []
    }
    case 'image': {
      // `corps` n'existait que dans le `case 'table'` voisin : tout export Word
      // d'un document contenant une image levait une ReferenceError (trouvé par
      // le lint, 11/10/2026).
      const corps = reglages(style, 'body')
      const octets = images && images.octetsPar.get(node.attrs.src)
      if (!octets) {
        return [
          new Paragraph({
            ...paragraphProps(corps),
            children: [
              new TextRun({ ...baseRunProps(corps, corps.size), italics: true, text: '[image non récupérée]' }),
            ],
          }),
        ]
      }
      const largeurSource = node.attrs.largeur || images.largeurUtile
      const hauteurSource = node.attrs.hauteur || Math.round(largeurSource * 0.75)
      // « Images pleine page » (23/10/2026), pour les images posées au premier
      // niveau : la plus grande taille qui tient entre les marges, dans les
      // deux sens, proportions gardées — agrandie au besoin. Le paragraphe
      // est dessiné à part, sans les retraits ni l'interligne du texte
      // courant : un interligne de 1,15 sur une image aussi haute que la
      // page la ferait déborder, et un retrait de première ligne la
      // décentrerait.
      //
      // Elle a sa **propre page** et y est centrée aussi **en hauteur** :
      // saut de page avant, et un espacement avant égal à la moitié de ce qui
      // reste de la zone utile. (Word n'a pas de « centrage vertical » pour
      // un paragraphe, hors d'une section entière.) Le saut qui renvoie le
      // texte suivant à la page d'après est posé par `buildDocxBlob`, d'après
      // le drapeau `images.sautApres`.
      if (images.pleinePage && racine) {
        const k = Math.min(images.largeurUtile / largeurSource, images.hauteurUtile / hauteurSource)
        const largeurFinale = Math.max(1, Math.round(largeurSource * k))
        const hauteurFinale = Math.max(1, Math.round(hauteurSource * k))
        // 1 px à 96 ppp = 15 twips.
        const avantTwips = Math.max(0, Math.floor(((images.hauteurUtile - hauteurFinale) / 2) * 15))
        images.sautApres = true
        return [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            pageBreakBefore: true,
            spacing: { before: avantTwips, after: 0, line: 240, lineRule: LineRuleType.AUTO },
            children: [
              new ImageRun({
                type: octets.type,
                data: octets.data,
                transformation: { width: largeurFinale, height: hauteurFinale },
                altText: node.attrs.alt
                  ? { description: node.attrs.alt, name: node.attrs.alt, title: node.attrs.alt }
                  : undefined,
              }),
            ],
          }),
        ]
      }
      const facteur = Math.min(1, images.largeurUtile / largeurSource)
      return [
        new Paragraph({
          ...paragraphProps(corps),
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type: octets.type,
              data: octets.data,
              transformation: {
                width: Math.round(largeurSource * facteur),
                height: Math.round(hauteurSource * facteur),
              },
              altText: node.attrs.alt
                ? { description: node.attrs.alt, name: node.attrs.alt, title: node.attrs.alt }
                : undefined,
            }),
          ],
        }),
      ]
    }
    case 'table_of_contents': {
      // Word calcule la table à l'ouverture du fichier (`updateFields`
      // ci-dessous le lui demande) : `headingStyleRange` dit seulement
      // quels niveaux de titre reprendre.
      const n = niveauTitre(node.attrs.profondeur, 2)
      return [new TableOfContents('Table des matières', { hyperlink: true, headingStyleRange: `1-${n}` })]
    }
    case 'horizontal_rule':
      // Saut de page — même rôle qu'à l'export PDF (voir typstExport.js) :
      // ce nœud ne dessine jamais de trait, juste un saut de page.
      return [new Paragraph({ pageBreakBefore: true, children: [] })]
    case 'ligne_separation':
      // Un trait : la bordure basse d'un paragraphe vide (Word n'a pas de
      // « règle horizontale » à proprement parler).
      return [
        new Paragraph({
          children: [],
          spacing: { before: 120, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: '999999' } },
        }),
      ]
    default:
      return []
  }
}

/** Vrai si le document porte au moins une table des matières. */
function contientTable(doc) {
  let trouve = false
  doc.descendants((n) => {
    if (n.type.name === 'table_of_contents') trouve = true
  })
  return trouve
}

/** Construit le fichier .docx entier sous forme de Blob, prêt à
 * télécharger — même feuille de style (`style`, voir styleConfig.js) que
 * l'export PDF. */
export async function buildDocxBlob(doc, style, titre = '') {
  titre = nfc(titre)
  const images = {
    octetsPar: await chargerImages(doc),
    largeurUtile: largeurUtilePx(style),
    hauteurUtile: hauteurUtilePx(style),
    pleinePage: !!(style.page && style.page.imagesPleinePage),
  }
  NOTES = numerosDesNotes(doc)
  const children = []
  const endnotes = {}
  try {
    doc.forEach((node, _decalage, index) => {
      images.sautApres = false
      children.push(...blockToParagraphs(node, style, images, true))
      // Après une image pleine page, le texte qui suit repart en haut de la
      // page suivante. Une image qui suit pose son propre saut avant : le
      // paragraphe-repère ne servirait qu'à laisser une page blanche.
      const suivant = index + 1 < doc.childCount ? doc.child(index + 1) : null
      if (images.sautApres && suivant && suivant.type.name !== 'image') {
        children.push(
          new Paragraph({
            pageBreakBefore: true,
            spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT },
          })
        )
      }
    })
    // Les notes de fin : le texte de chacune, au style du corps, une taille
    // en dessous — Word les place en fin de document et les numérote.
    const corpsNotes = reglages(style, 'body')
    for (const [node, n] of NOTES) {
      endnotes[n] = {
        children: [new Paragraph({ children: inlineToRuns(node, corpsNotes, Math.max(6, corpsNotes.size - 1)) })],
      }
    }
  } finally {
    NOTES = new Map()
  }

  const page = style.page || DEFAULT_STYLE.page
  const [widthMm, heightMm] = dimensionsPage(page)
  const pageNumbers = page.pageNumbers || DEFAULT_STYLE.page.pageNumbers

  // Word écrit toujours la page **en portrait** (largeur ≤ hauteur) et
  // porte l'orientation à part : pour un paysage il faut donc donner les
  // côtés dans l'ordre portrait avec `orientation: LANDSCAPE`, et la
  // bibliothèque les permute à l'écriture. Donner 297 × 210 sans le
  // drapeau ouvrirait une page paysage que Word traite comme portrait
  // (mise en page et impression à l'envers).
  const paysage = widthMm > heightMm
  const pageProperties = {
    size: {
      width: convertMillimetersToTwip(paysage ? heightMm : widthMm),
      height: convertMillimetersToTwip(paysage ? widthMm : heightMm),
      ...(paysage ? { orientation: PageOrientation.LANDSCAPE } : {}),
    },
    margin: {
      top: convertMillimetersToTwip(page.marginTop),
      right: convertMillimetersToTwip(page.marginRight),
      bottom: convertMillimetersToTwip(page.marginBottom),
      left: convertMillimetersToTwip(page.marginLeft),
    },
  }

  // En-têtes (20/09/2026). Word sait distinguer pages paires et impaires,
  // c'est donc la même idée que dans le PDF. Deux limites assumées, dites
  // aussi dans l'infobulle du panneau : le « titre 1 courant » n'a pas
  // d'équivalent fiable ici (il passerait par un champ STYLEREF que la
  // bibliothèque ne sait pas écrire) et devient le titre du document ; et
  // « pas d'en-tête sur les pages de titre 1 » n'a pas d'équivalent du tout
  // — Word ne sait distinguer que la première page.
  const entete = page.entete || DEFAULT_STYLE.page.entete || {}
  const texteEntete = (cote) => {
    if (!cote || cote.type === 'rien') return ''
    // « Titre du document » (02/10/2026) et, faute d'équivalent fiable,
    // « Titre 1 courant » : dans les deux cas, le titre du document.
    if (cote.type === 'titre' || cote.type === 'titreDocument') return String(titre || '')
    return String(cote.texte || '')
  }
  const enteteDroite = texteEntete(entete.droite)
  const enteteGauche = texteEntete(entete.gauche)
  const bandeau = (texte) =>
    new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: texte ? [new TextRun({ text: texte })] : [],
        }),
      ],
    })
  const headers = enteteDroite || enteteGauche ? { default: bandeau(enteteDroite), even: bandeau(enteteGauche) } : null

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
    // Sans ça, Word ouvre le fichier avec une table des matières vide et
    // ne la calcule que si l'on pense à cliquer « Mettre à jour ».
    ...(contientTable(doc) ? { features: { updateFields: true } } : {}),
    ...(Object.keys(endnotes).length ? { endnotes } : {}),
    // Sans ce drapeau, Word ignore l'en-tête des pages paires.
    ...(headers ? { evenAndOddHeaderAndFooters: true } : {}),
    // Le style « Sous-titre » n'existe pas dans les styles par défaut de
    // `docx` (« Title » y est) : on le déclare, vide, pour que Word le
    // reconnaisse. Son aspect vient de la mise en forme posée sur chaque
    // paragraphe, comme pour tous les blocs.
    styles: {
      paragraphStyles: [{ id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', quickFormat: true }],
    },
    // Les listes numérotées exigent une configuration de numérotation
    // déclarée au niveau du document (contrairement aux puces, qui ont un
    // raccourci intégré) — six niveaux, le plafond de l'éditeur
    // (NIVEAUX_DE_LISTE_MAX dans commandesBarre.js).
    numbering: {
      config: [
        {
          reference: TIRETS,
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: NumberFormat.BULLET,
            text: '–',
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: convertMillimetersToTwip(6 + level * 6),
                  hanging: convertMillimetersToTwip(5),
                },
              },
            },
          })),
        },
        {
          reference: NUMEROTATION,
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            // 1. → a. → i., comme à l'écran, puis on recommence.
            format: [NumberFormat.DECIMAL, NumberFormat.LOWER_LETTER, NumberFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: convertMillimetersToTwip(6 + level * 6),
                  hanging: convertMillimetersToTwip(5),
                },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: { page: pageProperties },
        ...(headers ? { headers } : {}),
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
  const blob = await buildDocxBlob(doc, style, title)
  telecharger(blob, `${nomDeFichier(title)}.docx`)
}
