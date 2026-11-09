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
import { gabaritTypst, nfc } from '../../domaine/index.js'

/** Les blocs du texte de base, lus dans son fragment Yjs. */
export const blocsDuTexte = (editeur, fragment) => yfragmentToBlocks(editeur, fragment)

/** Le document en Markdown, en forme composée (NFC). */
export const versMarkdown = (editeur, blocs) => nfc(editeur.blocksToMarkdownLossy(blocs))

const LISTES = { bulletListItem: 'list', numberedListItem: 'enum' }

/**
 * La source Typst d'un livre : le gabarit du modèle, puis le corps.
 * @param {object} editeur  un éditeur BlockNote (pour son schéma)
 * @param {Array} blocs
 * @param {object} modele  modèle de mise en page (domaine, `gabaritTypst`)
 * @param {{ titre?: string, langue?: string, recupererFichier?: (url: string) => Promise<Blob> }} [options]
 *   `recupererFichier` va chercher une image ; une image introuvable est
 *   omise plutôt que de faire échouer l'export
 * @returns {Promise<{ source: string, fichiers: Map<string, Uint8Array> }>}
 */
export async function versTypst(editeur, blocs, modele, { titre, langue, recupererFichier } = {}) {
  const exportateur = new TypstExporter(editeur.schema, typstDefaultSchemaMappings, {
    fontFamily: modele.police,
    fontSize: modele.grille.corps,
    resolveFileUrl: recupererFichier ?? ((url) => fetch(url).then((r) => r.blob())),
  })
  const corps = await parcourir(exportateur, blocs)
  return {
    source: nfc(gabaritTypst(modele, { titre, langue }) + '\n' + corps.join('\n\n') + '\n'),
    fichiers: exportateur.assetFiles,
  }
}

async function parcourir(exportateur, blocs) {
  const enLigne = (b) => exportateur.transformInlineContent(b.content ?? []).join('')
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
    else {
      // Tableaux et images : la correspondance de BlockNote, hors grille.
      try {
        sortie.push(await exportateur.mapBlock(b, 0, 0, []))
      } catch {
        // Une image introuvable (adresse morte, accès refusé) est omise.
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
