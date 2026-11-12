// Le schéma du livre (couche 2) : les blocs, contenus en ligne et styles
// qu'amend.ink garde de BlockNote (décision de Sylvain, étape 4 ; ce qui est
// retiré est au registre des renoncements, n° 8). Partagé par l'éditeur et
// par le serveur, pour qu'un document se lise partout avec le même schéma.
// Ajouts du 11/11/2026 (comparaison v1 / v2, points 6, 18 et 19) : le saut de
// page de BlockNote (`withPageBreak`, comme Docs), le bloc « Table des
// matières » et le style « exposant » (nos extensions).
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  createHeadingBlockSpec,
  withPageBreak,
} from '@blocknote/core'
import { blocTableDesMatieres } from '../../extensions/tableDesMatieres/index.js'
import { styleExposant } from '../../extensions/exposant/index.js'
import { blocTitre, blocSousTitre } from '../../extensions/titres/index.js'
import { elementNote } from '../../extensions/note/index.js'

const { paragraph, quote, bulletListItem, numberedListItem, divider, table, image } = defaultBlockSpecs
const { bold, italic, underline, strike } = defaultStyleSpecs

const BLOCS_DU_LIVRE = {
  paragraph,
  // Titres 1 à 5 (niveaux 4 et 5 remis par Sylvain le 09/11/2026), sans
  // titres repliables : comme les listes repliables, retirés (n° 8).
  heading: createHeadingBlockSpec({ levels: [1, 2, 3, 4, 5], allowToggleHeadings: false }),
  quote,
  bulletListItem,
  numberedListItem,
  divider,
  table,
  image,
  tableDesMatieres: blocTableDesMatieres(),
  // Titre et sous-titre du document (12/11/2026), hors plan et table.
  titre: blocTitre(),
  sousTitre: blocSousTitre(),
}
const STYLES_DU_LIVRE = { bold, italic, underline, strike, exposant: styleExposant }

export const schemaLivre = withPageBreak(
  BlockNoteSchema.create({
    blockSpecs: BLOCS_DU_LIVRE,
    // La note de bas de page (12/11/2026) : un appel en ligne qui porte son texte.
    inlineContentSpecs: { ...defaultInlineContentSpecs, note: elementNote },
    styleSpecs: STYLES_DU_LIVRE,
  }),
)
