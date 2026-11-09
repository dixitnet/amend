// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs, avec le schéma du livre et nos extensions. Il
// reçoit la langue de l'interface (menus de l'éditeur), la langue du document
// (typographie) et la personne. Aucune apparence ici : feuilles de style et
// thème relèvent de la couche design, dont le fournisseur Mantine entoure
// l'application. `modifiable` règle la seule interface : ce qu'une personne
// peut écrire, c'est y/hub qui le garantit.
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { withCollaboration } from '@blocknote/core/y'
import { dictionnaire } from './dictionnaire.js'
import { schemaLivre } from './schema.js'
import { extensionTypographie } from '../../extensions/typographie/index.js'

// La palette flottante de BlockNote, moins les boutons d'alignement (décision
// de Sylvain du 09/11/2026, tous formats d'écran). Même procédé que Docs, qui
// filtre les boutons de la palette par leur clé. Pour les remettre : vider
// cette liste.
const BOUTONS_RETIRES = ['textAlignLeftButton', 'textAlignCenterButton', 'textAlignRightButton']

function Palette() {
  return (
    <FormattingToolbar>
      {getFormattingToolbarItems().filter((bouton) => !BOUTONS_RETIRES.includes(bouton.key))}
    </FormattingToolbar>
  )
}

export function EditeurCollaboratif({ contexte, personne, langue, langueDocument, nomAccessible, modifiable = true }) {
  const editeur = useCreateBlockNote(
    withCollaboration({
      schema: schemaLivre,
      extensions: [extensionTypographie({ langue: langueDocument })],
      dictionary: dictionnaire(langue),
      // La zone d'édition doit avoir un nom pour les lecteurs d'écran (axe-core).
      domAttributes: { editor: { 'aria-label': nomAccessible } },
      collaboration: {
        fragment: contexte.fragment,
        provider: contexte.fournisseur,
        user: { name: personne.nom, color: personne.couleur },
      },
    }),
    [contexte, langueDocument],
  )
  return (
    <BlockNoteView editor={editeur} editable={modifiable} formattingToolbar={false}>
      <FormattingToolbarController formattingToolbar={Palette} />
    </BlockNoteView>
  )
}
