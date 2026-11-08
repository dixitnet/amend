// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs. Il reçoit sa langue et la personne. Aucune
// apparence ici : feuilles de style et thème relèvent de la couche design,
// dont le fournisseur Mantine entoure l'application. `modifiable` règle la
// seule interface : ce qu'une personne peut écrire, c'est y/hub qui le garantit.
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { withCollaboration } from '@blocknote/core/y'
import { dictionnaire } from './dictionnaire.js'

export function EditeurCollaboratif({ contexte, personne, langue, nomAccessible, modifiable = true }) {
  const editeur = useCreateBlockNote(
    withCollaboration({
      dictionary: dictionnaire(langue),
      // La zone d'édition doit avoir un nom pour les lecteurs d'écran (axe-core).
      domAttributes: { editor: { 'aria-label': nomAccessible } },
      collaboration: {
        fragment: contexte.fragment,
        provider: contexte.fournisseur,
        user: { name: personne.nom, color: personne.couleur },
      },
    }),
    [contexte],
  )
  return <BlockNoteView editor={editeur} editable={modifiable} />
}
