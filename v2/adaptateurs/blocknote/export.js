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
import { gabaritTypst, nfc, compter, entreesTable, profondeurTable, chaineTypst } from '../../domaine/index.js'
import { TYPE_NOTE } from '../../extensions/note/index.js'
import { STYLE_SURLIGNE } from '../../extensions/surligne/index.js'
import { TYPE_TABLE, texteEnLigne, titresDesBlocs } from '../../extensions/tableDesMatieres/index.js'
import { TYPE_TITRE, TYPE_SOUS_TITRE, TYPE_LEGENDE, TYPE_BIBLIOGRAPHIE } from '../../extensions/titres/index.js'

/** Les blocs du texte de base, lus dans son fragment Yjs. */
export const blocsDuTexte = (editeur, fragment) => yfragmentToBlocks(editeur, fragment)

// L'exposant en Markdown : BlockNote passe par le HTML, dont la conversion
// garde le texte d'un `<sup>` mais perd la balise ; il est donc marqué par
// deux caractères à usage privé, que le Markdown n'échappe pas, puis remplacé
// par `<sup>…</sup>` (le Markdown admet le HTML en ligne).
const DEBUT_SUP = '\uE000'
const FIN_SUP = '\uE001'
// La note en Markdown (12/11/2026) : l'appel `[^n]` et, en fin de fichier, le
// texte `[^n]: …`, marqués de même (le Markdown échapperait les crochets).
const APPEL = '\uE002'
const DEFINITION = '\uE003'

/** Un texte tapé qui contiendrait déjà ces marques les perd (audit du
 * 11/11/2026) : elles ne viennent que de nous. */
const sansMarques = (texte) => texte.replace(/[\uE000-\uE003]/g, '')

/** Les textes en exposant, entourés des deux marques ; les cellules des
 * tableaux aussi (audit du 11/11/2026). */
function marquerExposants(contenu) {
  if (contenu?.type === 'tableContent')
    return {
      ...contenu,
      rows: (contenu.rows ?? []).map((r) => ({
        ...r,
        cells: (r.cells ?? []).map((c) =>
          Array.isArray(c) ? marquerExposants(c) : { ...c, content: marquerExposants(c.content) },
        ),
      })),
    }
  if (!Array.isArray(contenu)) return contenu
  // Le surlignage ne part pas dans le Markdown (Sylvain, 26/11/2026 ; il part dans le PDF depuis le 27/11).
  const sans = (styles, ...cles) =>
    Object.fromEntries(Object.entries(styles ?? {}).filter(([cle]) => !cles.includes(cle)))
  return contenu.map((c) =>
    c.type === 'text'
      ? c.styles?.exposant
        ? {
            ...c,
            text: DEBUT_SUP + sansMarques(c.text) + FIN_SUP,
            styles: sans(c.styles, 'exposant', STYLE_SURLIGNE),
          }
        : { ...c, text: sansMarques(c.text), styles: sans(c.styles, STYLE_SURLIGNE) }
      : Array.isArray(c.content)
        ? { ...c, content: marquerExposants(c.content) }
        : c,
  )
}

/**
 * Les blocs prêts pour le Markdown : une table des matières devient la liste
 * des titres jusqu'à sa profondeur, sans titre (Sylvain, 15/11/2026) ; un saut
 * de page n'a pas d'équivalent et disparaît ; l'exposant est marqué ; le
 * titre devient un paragraphe en gras, le sous-titre un paragraphe en
 * italique (Sylvain, 12/11/2026 : pas un titre de niveau 1 ailleurs).
 * @param {Array} blocs
 */
export function blocsPourMarkdown(blocs) {
  const titres = titresDesBlocs(blocs)
  // Les notes, numérotées dans l'ordre du texte, rendues en fin de fichier.
  const notes = []
  const appels = (contenu) =>
    contenu?.type === 'tableContent'
      ? {
          ...contenu,
          rows: (contenu.rows ?? []).map((r) => ({
            ...r,
            cells: (r.cells ?? []).map((c) => (Array.isArray(c) ? appels(c) : { ...c, content: appels(c.content) })),
          })),
        }
      : Array.isArray(contenu)
        ? contenu.map((c) => {
            if (c.type === TYPE_NOTE) {
              notes.push(sansMarques(nfc(c.props?.texte ?? '')))
              return { type: 'text', text: `${APPEL}${notes.length}${APPEL}`, styles: {} }
            }
            return Array.isArray(c.content) ? { ...c, content: appels(c.content) } : c
          })
        : contenu
  const preparer = (liste) =>
    liste.flatMap((b) => {
      if (b.type === 'pageBreak') return []
      if (b.type === TYPE_TABLE)
        return [
          ...entreesTable(titres, b.props?.profondeur).map((e) => ({
            type: 'bulletListItem',
            content: [{ type: 'text', text: e.texte, styles: {} }],
          })),
        ]
      // Nos blocs deviennent des paragraphes du Markdown : en gras, en italique, ou tels quels (la bibliographie).
      const styles = {
        [TYPE_TITRE]: 'bold',
        [TYPE_SOUS_TITRE]: 'italic',
        [TYPE_LEGENDE]: 'italic',
        [TYPE_BIBLIOGRAPHIE]: null,
      }
      if (Object.hasOwn(styles, b.type))
        return [
          {
            type: 'paragraph',
            content: styles[b.type]
              ? avecStyle(appels(marquerExposants(b.content)), styles[b.type])
              : appels(marquerExposants(b.content)),
            children: preparer(b.children ?? []),
          },
        ]
      return [{ ...b, content: appels(marquerExposants(b.content)), children: preparer(b.children ?? []) }]
    })
  const prets = preparer(blocs)
  return [
    ...prets,
    ...notes.map((texte, i) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `${DEFINITION}${i + 1}${DEFINITION}${texte}`, styles: {} }],
    })),
  ]
}

/** Un contenu en ligne, liens compris, avec un style de plus. */
const avecStyle = (contenu, style) =>
  (contenu ?? []).map((c) =>
    c.type === 'text'
      ? { ...c, styles: { ...c.styles, [style]: true } }
      : Array.isArray(c.content)
        ? { ...c, content: avecStyle(c.content, style) }
        : c,
  )

/** Les marques d'exposant changées en `<sup>`. */
export const poserExposants = (md) =>
  md
    .replaceAll(DEBUT_SUP, '<sup>')
    .replaceAll(FIN_SUP, '</sup>')
    .replace(/\uE002(\d+)\uE002/g, '[^$1]')
    .replace(/\uE003(\d+)\uE003/g, '[^$1]: ')

/** Le document en Markdown, en forme composée (NFC). */
export const versMarkdown = (editeur, blocs) =>
  nfc(poserExposants(editeur.blocksToMarkdownLossy(blocsPourMarkdown(blocs))))

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

/** Les correspondances Typst de BlockNote, plus l'exposant (`super` de Typst)
 * et la note de bas de page (`footnote` de Typst, 12/11/2026). */
const CORRESPONDANCES = {
  ...typstDefaultSchemaMappings,
  inlineContentMapping: {
    ...typstDefaultSchemaMappings.inlineContentMapping,
    [TYPE_NOTE]: (note) => `#footnote[#${chaineTypst(sansMarques(nfc(note.props?.texte ?? '')))}]`,
  },
  styleMapping: {
    ...typstDefaultSchemaMappings.styleMapping,
    exposant: (actif) => (actif ? (e) => `super(${e})` : (e) => e),
    // Le surlignage part dans le PDF (Sylvain, 27/11/2026), par une fonction du gabarit.
    [STYLE_SURLIGNE]: (actif) => (actif ? (e) => `amend-surligne(${e})` : (e) => e),
  },
}

const LISTES = { bulletListItem: 'list', numberedListItem: 'enum' }

/** Le fichier d'une image : vide si la réponse est en erreur, si le réseau
 * échoue ou si 15 s ne suffisent pas ; le bloc de l'image est alors omis
 * (voir `parcourir`) au lieu de bloquer ou de faire échouer l'export. */
export async function chargerFichier(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    return r.ok ? await r.blob() : new Blob([])
  } catch {
    return new Blob([])
  }
}

/** Les adresses des images d'un document, sans doublon (blocs imbriqués compris). */
function adressesDesImages(blocs) {
  const urls = new Set()
  const voir = (liste) => {
    for (const b of liste ?? []) {
      if (b.type === 'image' && b.props?.url) urls.add(b.props.url)
      voir(b.children)
    }
  }
  voir(blocs)
  return [...urls]
}

/**
 * La source Typst d'un livre : le gabarit du modèle, puis le corps.
 * @param {object} editeur  un éditeur BlockNote (pour son schéma)
 * @param {Array} blocs
 * @param {object} modele  modèle de mise en page (domaine, `gabaritTypst`)
 * @param {{ titre?: string, langue?: string }} [document]  une image
 *   introuvable est omise plutôt que de faire échouer l'export
 * @returns {Promise<{ source: string, fichiers: Map<string, Uint8Array> }>}
 */
export async function versTypst(editeur, blocs, modele, { titre, langue, auteur, surlignage } = {}) {
  // Toutes les images partent ensemble : chargées une à une, chacune avec ses 15 s de délai,
  // N images lentes s'additionnaient (audit du 16/11/2026).
  const charges = new Map(adressesDesImages(blocs).map((url) => [url, chargerFichier(url)]))
  const exportateur = new TypstExporter(editeur.schema, CORRESPONDANCES, {
    fontFamily: modele.styles?.texte?.police,
    fontSize: modele.grille.corps,
    // Déjà en cours de chargement (voir plus bas) ; une adresse inconnue se charge à la demande.
    resolveFileUrl: (url) => charges.get(url) ?? chargerFichier(url),
  })
  const corps = await parcourir(exportateur, blocs)
  return {
    source: nfc(gabaritTypst(modele, { titre, langue, auteur, surlignage }) + '\n' + corps.join('\n\n') + '\n'),
    fichiers: exportateur.assetFiles,
  }
}

async function parcourir(exportateur, blocs, racine = true) {
  // Seuls les blocs de texte ont un contenu en ligne : un tableau a le sien
  // (`tableContent`), une image aucun (audit du 10/11/2026 : un tableau faisait
  // échouer tout l'export).
  const enLigne = (b) => (Array.isArray(b.content) ? exportateur.transformInlineContent(b.content).join('') : '')
  const sortie = []
  let precedent = null
  // Des paragraphes vides entre deux blocs de texte (deux sauts de paragraphe
  // ou plus) donnent une ligne blanche, une seule, sur la grille (Sylvain,
  // 12/11/2026) ; autour d'un titre, d'un séparateur ou d'un saut de page,
  // rien : ces blocs ont déjà leur blanc. Au début d'une page (après un saut de
  // page, ou au tout début du livre), chaque paragraphe vide compte pour une ligne
  // blanche : la personne les a écrits pour descendre le texte (Sylvain, 15/11/2026).
  let blanc = false
  const sansBlanc = (b) => !b || ['heading', 'divider', 'pageBreak'].includes(b.type)
  for (let i = 0; i < blocs.length; i++) {
    const b = blocs[i]
    const texte = enLigne(b)
    // Un paragraphe vide n'est pas écrit et ne compte pas : le premier
    // paragraphe écrit après un titre de chapitre reste « le premier ».
    if (b.type === 'paragraph' && !texte && !b.children?.length) {
      const debutDePage = precedent?.type === 'pageBreak' || (!precedent && racine)
      if (debutDePage) sortie.push('#amend-blanc')
      else blanc = !sansBlanc(precedent)
      continue
    }
    if (blanc && !sansBlanc(b)) sortie.push('#amend-blanc')
    blanc = false
    const liste = LISTES[b.type]
    if (liste) {
      const items = []
      while (i < blocs.length && blocs[i].type === b.type) {
        const enfants = await parcourir(exportateur, blocs[i].children ?? [], false)
        items.push(`[${[enLigne(blocs[i]), ...enfants].join('\n\n')}]`)
        i++
      }
      i--
      sortie.push(`#${liste}(${items.join(', ')})`)
      precedent = b
      continue
    }
    if (b.type === 'paragraph') {
      if (texte) {
        // Pas d'alinéa au premier paragraphe d'un chapitre : après un titre 1, et après un titre 2 quand le
        // modèle lui fait ouvrir une page (le gabarit en décide, 19/11/2026).
        const niveau = precedent?.type === 'heading' ? precedent.props?.level : null
        sortie.push(
          niveau === 1 ? `#amend-sans-alinea[${texte}]` : niveau === 2 ? `#amend-sans-alinea-2[${texte}]` : texte,
        )
      }
    } else if (b.type === 'heading') sortie.push(`#heading(level: ${b.props?.level ?? 1})[${texte}]`)
    else if (b.type === 'quote') sortie.push(`#quote(block: true)[${texte}]`)
    // Titre et sous-titre : dans le flux, centrés (gabarit du modèle).
    else if (b.type === TYPE_TITRE) sortie.push(`#amend-titre[${texte}]`)
    else if (b.type === TYPE_SOUS_TITRE) sortie.push(`#amend-sous-titre[${texte}]`)
    else if (b.type === TYPE_LEGENDE) sortie.push(`#amend-legende[${texte}]`)
    else if (b.type === TYPE_BIBLIOGRAPHIE) sortie.push(`#amend-bibliographie[${texte}]`)
    else if (b.type === 'divider') sortie.push('#amend-separateur')
    else if (b.type === 'pageBreak') sortie.push('#pagebreak()')
    // La table des matières de Typst, à la place du bloc, titre dans la
    // langue du document (`lang` du gabarit).
    else if (b.type === TYPE_TABLE) sortie.push(`#outline(title: none, depth: ${profondeurTable(b.props?.profondeur)})`)
    else {
      // Tableaux et images : la correspondance de BlockNote, hors grille.
      try {
        // Une image n'a pas de légende dans l'export : « légende » n'est qu'un style, un paragraphe sous l'image
        // (Sylvain, 16/11/2026) ; la légende que BlockNote porte sur le bloc est laissée de côté.
        const sansLegende = b.type === 'image' ? { ...b, props: { ...b.props, caption: '' } } : b
        const typst = await exportateur.mapBlock(sansLegende, 0, 0, [])
        // Une image introuvable (adresse morte, accès refusé) devient chez
        // BlockNote un fichier vide, que Typst refuse : le bloc est omis, et
        // le reste du livre s'exporte (audit du 10/11/2026). Le fichier vide,
        // que rien ne référence plus, ne gêne pas la compilation.
        const fichiers = exportateur.assetFiles
        const vide = [...typst.matchAll(/image\("([^"]+)"/g)].some((m) => !fichiers.get(m[1])?.length)
        // Une image occupe toute la largeur de la page hors marges (Sylvain,
        // 14/11/2026, règle du gabarit) : on retire la largeur que BlockNote lui
        // donne (`previewWidth` de l'éditeur, en points, qui déborde de la page).
        if (!vide) sortie.push(typst.replace(/(image\("[^"]+"), width: [^,)]+/g, '$1'))
      } catch {
        // Un bloc que BlockNote ne sait pas exporter est omis de même.
      }
    }
    sortie.push(...(await parcourir(exportateur, b.children ?? [], false)))
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
