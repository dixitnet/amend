// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs, avec le schéma du livre et nos extensions. Il
// reçoit la langue de l'interface (menus de l'éditeur), la langue du document
// (typographie), la personne et les libellés de nos ajouts aux menus. Aucune
// apparence ici : feuilles de style et thème relèvent de la couche design,
// dont le fournisseur Mantine entoure l'application. `modifiable` règle la
// seule interface : ce qu'une personne peut écrire, c'est y/hub qui le garantit.
import { useEffect } from 'react'
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { filterSuggestionItems } from '@blocknote/core'
import { withCollaboration } from '@blocknote/core/y'
import { dictionnaire } from './dictionnaire.js'
import { schemaLivre } from './schema.js'
import { extensionTypographie } from '../../extensions/typographie/index.js'
import { insererNote, notesDuDocument, extensionNote } from '../../extensions/note/index.js'

/**
 * @param {object} p
 * @param {{ note: { titre: string, aide: string, groupe: string } }} p.libelles
 * @param {(notes: ReturnType<typeof notesDuDocument>) => void} [p.surNotes]
 *   rappelé avec les notes du document, à chaque changement
 */
export function EditeurCollaboratif({
  contexte,
  personne,
  langue,
  langueDocument,
  nomAccessible,
  libelles,
  surNotes,
  modifiable = true,
}) {
  const editeur = useCreateBlockNote(
    withCollaboration({
      schema: schemaLivre,
      extensions: [extensionTypographie({ langue: langueDocument }), extensionNote],
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
  useEffect(() => {
    if (!surNotes) return
    const signaler = () => surNotes(notesDuDocument(editeur.document))
    signaler()
    return editeur.onChange(signaler)
  }, [editeur, surNotes])

  // Le menu « / » : celui de BlockNote, plus la note de bas de page.
  const elementsDuMenu = async (requete) =>
    filterSuggestionItems(
      [
        ...getDefaultReactSlashMenuItems(editeur),
        {
          title: libelles.note.titre,
          subtext: libelles.note.aide,
          group: libelles.note.groupe,
          aliases: ['note', 'footnote'],
          onItemClick: () => insererNote(editeur),
        },
      ],
      requete,
    )
  return (
    <BlockNoteView editor={editeur} editable={modifiable} slashMenu={false}>
      <SuggestionMenuController triggerCharacter="/" getItems={elementsDuMenu} />
    </BlockNoteView>
  )
}
