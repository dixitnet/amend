// Le schéma du livre (couche 2) : les blocs, contenus en ligne et styles
// qu'amend.ink garde de BlockNote (décision de Sylvain, étape 4 ; ce qui est
// retiré est au registre des renoncements, n° 8). Partagé par l'éditeur et
// par le serveur, pour qu'un document se lise partout avec le même schéma.
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  createHeadingBlockSpec,
} from '@blocknote/core'

const { paragraph, quote, bulletListItem, numberedListItem, divider, table, image } = defaultBlockSpecs
const { bold, italic, underline, strike } = defaultStyleSpecs

export const BLOCS_DU_LIVRE = {
  paragraph,
  // Sans titres repliables : comme les listes repliables, retirés (n° 8).
  heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false }),
  quote,
  bulletListItem,
  numberedListItem,
  divider,
  table,
  image,
}
export const STYLES_DU_LIVRE = { bold, italic, underline, strike }

export const schemaLivre = BlockNoteSchema.create({
  blockSpecs: BLOCS_DU_LIVRE,
  inlineContentSpecs: { ...defaultInlineContentSpecs },
  styleSpecs: STYLES_DU_LIVRE,
})
