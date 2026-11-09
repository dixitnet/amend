// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs, avec le schéma du livre et nos extensions. Il
// reçoit la langue de l'interface (menus de l'éditeur), la langue du document
// (typographie), la personne, et ce qu'elle fait du texte :
//  - `ecrire` : elle écrit le texte et voit les suggestions (éditeur) ;
//  - `suggerer` : tout ce qu'elle tape est une suggestion (correcteur ; y/hub
//    le garantit, la branche principale lui est fermée) ;
//  - `lire` : lecture seule (lecteur), sans les suggestions.
// Aucune apparence ici : feuilles de style et thème relèvent de la couche
// design, dont le fournisseur Mantine entoure l'application.
import { useEffect, useMemo, useState } from 'react'
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { VersioningSidebar } from '@blocknote/react/versioning'
import { withCollaboration } from '@blocknote/core/y'
import { CommentsExtension } from '@blocknote/core/comments'
import { dictionnaire } from './dictionnaire.js'
import { schemaLivre } from './schema.js'
import { boutonsGardes } from './palette.js'
import { MagasinFils } from './commentaires.js'
import { creerAfficheur, suivreAuteurs, listeDesSuggestions } from './suggestions.js'
import { extensionHistorique } from './historique.js'
import { extensionTypographie } from '../../extensions/typographie/index.js'

function Palette() {
  return <FormattingToolbar>{boutonsGardes(getFormattingToolbarItems())}</FormattingToolbar>
}

/**
 * @param {object} p
 * @param {'ecrire' | 'suggerer' | 'lire'} p.mode
 * @param {(ids: string[]) => Promise<Array<{ id: string, username: string, avatarUrl: string }>>} p.nomsDe
 * @param {{ service: object, capacites: readonly string[] } | null} [p.commentaires]
 * @param {(etat: { liste: ReturnType<typeof listeDesSuggestions>, accepter: Function, refuser: Function, toutAccepter: Function, toutRefuser: Function } | null) => void} [p.surSuggestions]
 *   rappelé avec les suggestions à chaque changement (pour qui peut arbitrer) ; doit être stable
 * @param {boolean} [p.historique]  le panneau de l'historique est ouvert
 * @param {boolean} [p.peutRestaurer]  nommer une version et y revenir
 * @param {() => void} [p.surFermerHistorique]
 */
export function EditeurCollaboratif({
  contexte,
  personne,
  langue,
  langueDocument,
  nomAccessible,
  mode,
  nomsDe,
  commentaires = null,
  surSuggestions,
  historique = false,
  peutRestaurer = false,
  surFermerHistorique,
}) {
  const suggerer = mode === 'suggerer'
  const avecSuggestions = mode !== 'lire' && contexte.suggestions !== null
  const afficheur = useMemo(
    () => (avecSuggestions ? creerAfficheur(contexte, null, suggerer) : null),
    [contexte, avecSuggestions, suggerer],
  )
  const magasin = useMemo(
    () =>
      commentaires
        ? new MagasinFils(
            commentaires.service,
            commentaires.capacites,
            personne.id,
            !commentaires.capacites.includes('ecrire'),
          )
        : null,
    [commentaires, personne.id],
  )
  const editeur = useCreateBlockNote(
    withCollaboration({
      schema: schemaLivre,
      // Pas de typographie à la frappe en mode suggestion : défaut de BlockNote
      // (veille ; Sylvain, 08/11/2026 : attendre sa correction).
      extensions: [
        ...(suggerer ? [] : [extensionTypographie({ langue: langueDocument })]),
        ...(magasin ? [CommentsExtension({ threadStore: magasin, resolveUsers: nomsDe })] : []),
        extensionHistorique(contexte, peutRestaurer, dictionnaire(langue).versioning.before_restore),
      ],
      dictionary: dictionnaire(langue),
      // La zone d'édition doit avoir un nom pour les lecteurs d'écran (axe-core).
      domAttributes: { editor: { 'aria-label': nomAccessible } },
      collaboration: {
        fragment: contexte.fragment,
        provider: contexte.fournisseur,
        user: { name: personne.nom, color: personne.couleur },
        resolveUsers: nomsDe,
        ...(afficheur ? { suggestionDoc: contexte.suggestions.doc, renderer: afficheur } : null),
      },
    }),
    [contexte, langue, langueDocument, suggerer, afficheur, magasin, peutRestaurer],
  )

  // Le mode des suggestions, puis les auteurs tenus à jour. Pendant
  // l'historique, l'éditeur montre le texte seul : l'historique de BlockNote
  // demande une liaison sans affichage des suggestions.
  // L'afficheur reste branché sur les deux documents tant qu'on ne le détruit pas.
  useEffect(() => () => afficheur?.destroy(), [afficheur])

  // Le panneau ne s'affiche qu'une fois l'historique ouvert (les effets d'un
  // composant enfant passent avant ceux de l'éditeur).
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false)
  useEffect(() => {
    const versions = editeur.getExtension('versioning')
    if (historique) {
      afficheur && editeur.getExtension('suggestions').disableSuggestions()
      versions.open()
      setHistoriqueOuvert(true)
      return () => {
        setHistoriqueOuvert(false)
        versions.close()
      }
    }
    if (!afficheur) return
    const ext = editeur.getExtension('suggestions')
    if (suggerer) ext.enableSuggestions()
    else ext.viewSuggestions()
    return suivreAuteurs(editeur, contexte, afficheur, suggerer)
  }, [editeur, contexte, afficheur, suggerer, historique])

  // La liste des suggestions, pour qui peut les accepter ou les refuser.
  useEffect(() => {
    if (!afficheur || !surSuggestions || suggerer) return
    const ext = editeur.getExtension('suggestions')
    const actions = {
      accepter: (s) => ext.applySuggestion(s.debut, s.fin),
      refuser: (s) => ext.revertSuggestion(s.debut, s.fin),
      toutAccepter: () => ext.applyAllSuggestions(),
      toutRefuser: () => ext.revertAllSuggestions(),
    }
    const signaler = () => surSuggestions({ liste: listeDesSuggestions(editeur), ...actions })
    signaler()
    const arreter = editeur.onChange(signaler)
    return () => {
      arreter()
      surSuggestions(null)
    }
  }, [editeur, afficheur, suggerer, surSuggestions])

  return (
    <BlockNoteView editor={editeur} editable={mode !== 'lire' && !historique} formattingToolbar={false}>
      <FormattingToolbarController formattingToolbar={Palette} />
      {historique && historiqueOuvert ? <VersioningSidebar onClose={surFermerHistorique} /> : null}
    </BlockNoteView>
  )
}
