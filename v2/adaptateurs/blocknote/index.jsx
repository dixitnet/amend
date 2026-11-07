// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs. Il reçoit sa langue, la personne et un thème
// (fourni par la couche design) ; il n'en décide aucun.
import '@blocknote/mantine/style.css'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { withCollaboration } from '@blocknote/core/y'
import { dictionnaire } from './dictionnaire.js'

export function EditeurCollaboratif({ contexte, personne, langue, theme }) {
  const editeur = useCreateBlockNote(
    withCollaboration({
      dictionary: dictionnaire(langue),
      collaboration: {
        fragment: contexte.fragment,
        provider: contexte.fournisseur,
        user: { name: personne.nom, color: personne.couleur },
      },
    }),
    [contexte],
  )
  return <BlockNoteView editor={editeur} theme={theme} />
}
