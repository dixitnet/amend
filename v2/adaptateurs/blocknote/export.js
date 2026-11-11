// Les exports d'un document (couche 2) : Markdown et PDF, par les modules de
// BlockNote, comme Docs (`doc-export/`, docs/v2-etape-7-plan.md).
//
// - Markdown : `blocksToMarkdownLossy` de BlockNote.
// - PDF : le texte en ligne (styles, liens, échappement) par l'exportateur
//   Typst de BlockNote (`@blocknote/xl-typst-exporter`) ; les blocs par le
//   parcours ci-dessous, pour qu'aucun ne porte de blanc à lui (l'exportateur
//   de BlockNote entoure chaque bloc d'un blanc de 6,9 pt, qui casserait la
//   grille du livre) ; le préambule par le domaine (`gabaritTypst`) ; la
//   compilation par le compilateur Typst de BlockNote (WebAssembly), chargé à
//   la première demande seulement.
//
// On exporte toujours le texte de base, jamais les suggestions en cours : les
// blocs sont lus dans le document Yjs, pas dans l'affichage de l'éditeur.
import { yfragmentToBlocks } from '@blocknote/core/y'
import { TypstExporter, typstDefaultSchemaMappings } from '@blocknote/xl-typst-exporter'
import { gabaritTypst, nfc, compter, entreesTable, profondeurTable } from '../../domaine/index.js'
import { TYPE_TABLE, texteEnLigne, titresDesBlocs } from '../../extensions/tableDesMatieres/index.js'

/** Les blocs du texte de base, lus dans son fragment Yjs. */
export const blocsDuTexte = (editeur, fragment) => yfragmentToBlocks(editeur, fragment)

// L'exposant en Markdown : BlockNote passe par le HTML, dont la conversion
// garde le texte d'un `<sup>` mais perd la balise ; il est donc marqué par
// deux caractères à usage privé, que le Markdown n'échappe pas, puis remplacé
// par `<sup>…</sup>` (le Markdown admet le HTML en ligne).
const DEBUT_SUP = '\uE000'
const FIN_SUP = '\uE001'

/** Les textes en exposant, entourés des deux marques. */
function marquerExposants(contenu) {
  if (!Array.isArray(contenu)) return contenu
  return contenu.map((c) =>
    c.type === 'text' && c.styles?.exposant
      ? {
          ...c,
          text: DEBUT_SUP + c.text + FIN_SUP,
          styles: Object.fromEntries(Object.entries(c.styles).filter(([cle]) => cle !== 'exposant')),
        }
      : Array.isArray(c.content)
        ? { ...c, content: marquerExposants(c.content) }
        : c,
  )
}

/**
 * Les blocs prêts pour le Markdown : une table des matières devient la liste
 * des titres jusqu'à sa profondeur (après son titre, s'il est donné) ; un saut
 * de page n'a pas d'équivalent et disparaît ; l'exposant est marqué.
 * @param {Array} blocs
 * @param {{ titreTable?: string }} [textes]
 */
export function blocsPourMarkdown(blocs, { titreTable } = {}) {
  const titres = titresDesBlocs(blocs)
  const preparer = (liste) =>
    liste.flatMap((b) => {
      if (b.type === 'pageBreak') return []
      if (b.type === TYPE_TABLE)
        return [
          ...(titreTable ? [{ type: 'paragraph', content: [{ type: 'text', text: titreTable, styles: {} }] }] : []),
          ...entreesTable(titres, b.props?.profondeur).map((e) => ({
            type: 'bulletListItem',
            content: [{ type: 'text', text: e.texte, styles: {} }],
          })),
        ]
      return [{ ...b, content: marquerExposants(b.content), children: preparer(b.children ?? []) }]
    })
  return preparer(blocs)
}

/** Les marques d'exposant changées en `<sup>`. */
export const poserExposants = (md) => md.replaceAll(DEBUT_SUP, '<sup>').replaceAll(FIN_SUP, '</sup>')

/** Le document en Markdown, en forme composée (NFC). */
export const versMarkdown = (editeur, blocs, textes) =>
  nfc(poserExposants(editeur.blocksToMarkdownLossy(blocsPourMarkdown(blocs, textes))))

/** Le texte de chaque bloc (texte en ligne, cellules des tableaux), enfants compris. */
export function textesDesBlocs(blocs) {
  const textes = []
  for (const b of blocs ?? []) {
    if (Array.isArray(b.content)) textes.push(texteEnLigne(b.content))
    else if (b.content?.type === 'tableContent')
      for (const rangee of b.content.rows ?? [])
        for (const cellule of rangee.cells ?? [])
          textes.push(texteEnLigne(Array.isArray(cellule) ? cellule : cellule.content))
    textes.push(...textesDesBlocs(b.children))
  }
  return textes
}

/** Signes (espaces compris) et mots du texte de base (domaine, `compter`). */
export const compterBlocs = (blocs) => compter(textesDesBlocs(blocs))

/** Les correspondances Typst de BlockNote, plus l'exposant (`super` de Typst). */
const CORRESPONDANCES = {
  ...typstDefaultSchemaMappings,
  styleMapping: {
    ...typstDefaultSchemaMappings.styleMapping,
    exposant: (actif) => (actif ? (e) => `super(${e})` : (e) => e),
  },
}

const LISTES = { bulletListItem: 'list', numberedListItem: 'enum' }

/**
 * La source Typst d'un livre : le gabarit du modèle, puis le corps.
 * @param {object} editeur  un éditeur BlockNote (pour son schéma)
 * @param {Array} blocs
 * @param {object} modele  modèle de mise en page (domaine, `gabaritTypst`)
 * @param {{ titre?: string, langue?: string }} [document]  une image
 *   introuvable est omise plutôt que de faire échouer l'export
 * @returns {Promise<{ source: string, fichiers: Map<string, Uint8Array> }>}
 */
export async function versTypst(editeur, blocs, modele, { titre, langue } = {}) {
  const exportateur = new TypstExporter(editeur.schema, CORRESPONDANCES, {
    fontFamily: modele.police,
    fontSize: modele.grille.corps,
    resolveFileUrl: (url) => fetch(url).then((r) => r.blob()),
  })
  const corps = await parcourir(exportateur, blocs)
  return {
    source: nfc(gabaritTypst(modele, { titre, langue }) + '\n' + corps.join('\n\n') + '\n'),
    fichiers: exportateur.assetFiles,
  }
}

async function parcourir(exportateur, blocs) {
  // Seuls les blocs de texte ont un contenu en ligne : un tableau a le sien
  // (`tableContent`), une image aucun (audit du 10/11/2026 : un tableau faisait
  // échouer tout l'export).
  const enLigne = (b) => (Array.isArray(b.content) ? exportateur.transformInlineContent(b.content).join('') : '')
  const sortie = []
  let precedent = null
  for (let i = 0; i < blocs.length; i++) {
    const b = blocs[i]
    const liste = LISTES[b.type]
    if (liste) {
      const items = []
      while (i < blocs.length && blocs[i].type === b.type) {
        const enfants = await parcourir(exportateur, blocs[i].children ?? [])
        items.push(`[${[enLigne(blocs[i]), ...enfants].join('\n\n')}]`)
        i++
      }
      i--
      sortie.push(`#${liste}(${items.join(', ')})`)
      precedent = b
      continue
    }
    const texte = enLigne(b)
    // Un paragraphe vide est sauté sans compter : le premier paragraphe écrit
    // après un titre de chapitre reste « le premier ».
    if (b.type === 'paragraph' && !texte && !b.children?.length) continue
    if (b.type === 'paragraph') {
      // Un paragraphe vide n'ajoute pas de blanc : la grille ne bouge pas.
      if (texte) {
        // Pas d'alinéa au premier paragraphe d'un chapitre.
        const ouverture = precedent?.type === 'heading' && precedent.props?.level === 1
        sortie.push(ouverture ? `#amend-sans-alinea[${texte}]` : texte)
      }
    } else if (b.type === 'heading') sortie.push(`#heading(level: ${b.props?.level ?? 1})[${texte}]`)
    else if (b.type === 'quote') sortie.push(`#quote(block: true)[${texte}]`)
    else if (b.type === 'divider') sortie.push('#amend-blanc')
    else if (b.type === 'pageBreak') sortie.push('#pagebreak()')
    // La table des matières de Typst, à la place du bloc, titre dans la
    // langue du document (`lang` du gabarit).
    else if (b.type === TYPE_TABLE) sortie.push(`#outline(depth: ${profondeurTable(b.props?.profondeur)})`)
    else {
      // Tableaux et images : la correspondance de BlockNote, hors grille.
      try {
        const typst = await exportateur.mapBlock(b, 0, 0, [])
        // Une image introuvable (adresse morte, accès refusé) devient chez
        // BlockNote un fichier vide, que Typst refuse : le bloc est omis, et
        // le reste du livre s'exporte (audit du 10/11/2026). Le fichier vide,
        // que rien ne référence plus, ne gêne pas la compilation.
        const fichiers = exportateur.assetFiles
        const vide = [...typst.matchAll(/image\("([^"]+)"/g)].some((m) => !fichiers.get(m[1])?.length)
        if (!vide) sortie.push(typst)
      } catch {
        // Un bloc que BlockNote ne sait pas exporter est omis de même.
      }
    }
    sortie.push(...(await parcourir(exportateur, b.children ?? [])))
    precedent = b
  }
  return sortie
}

/**
 * Compile une source Typst en PDF, déclaré accessible (PDF/UA-1) quand le
 * document s'y prête, sinon en PDF balisé ordinaire, comme le fait le module
 * PDF de BlockNote.
 * @param {string} source
 * @param {{ fichiers?: Map<string, Uint8Array>, polices: Uint8Array[], wasm?: Uint8Array | string | URL }} options
 * @returns {Promise<Uint8Array>}  lève une erreur de code `export-pdf-echoue`
 */
export async function compilerPdf(source, { fichiers, polices, wasm }) {
  const { TypstCompiler, isPdfStandardViolation } = await import('@blocknote/xl-typst-compiler')
  const compilateur = await TypstCompiler.create({ fonts: polices, wasm })
  const assets = fichiers ?? new Map()
  let resultat = compilateur.compilePdf(source, { assets, pdfStandard: 'ua-1' })
  if (resultat.error && resultat.compileErrors.every(isPdfStandardViolation))
    resultat = compilateur.compilePdf(source, { assets })
  if (resultat.error)
    throw Object.assign(new Error(resultat.compileErrors.map((e) => e.message).join(' ; ')), {
      code: 'export-pdf-echoue',
    })
  return resultat.pdf
}
