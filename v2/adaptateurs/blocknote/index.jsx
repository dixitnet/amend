// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs, avec le schéma du livre et nos extensions. Il
// reçoit la langue de l'interface (menus de l'éditeur), la langue du document
// (typographie), la personne, et ce qu'elle fait du texte. Les trois modes
// d'un éditeur sont ceux de l'exemple de BlockNote
// (`07-collaboration/12-multi-doc-versioning`), un seul éditeur et un seul
// afficheur des suggestions, le mode changeant par l'extension des
// suggestions, sans rien recréer :
//  - `ecrire` : elle écrit le texte, sans voir les suggestions
//    (`disableSuggestions`) ;
//  - `suggerer` : tout ce qu'elle tape est une suggestion (`enableSuggestions` ;
//    pour un correcteur, y/hub le garantit, la branche principale lui est fermée) ;
//  - `relire` : elle voit les suggestions et les accepte ou les refuse, sans
//    écrire (`viewSuggestions`) : écrire par-dessus des suggestions affichées
//    les prolonge (y-prosemirror#245) ;
//  - `lire` : lecture seule (lecteur), sans les suggestions.
// Aucune apparence ici : feuilles de style et thème relèvent de la couche
// design, dont le fournisseur Mantine entoure l'application.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useSelectedBlocks,
  RenderInPortalElement,
  ThreadsSidebar,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import {
  VersioningSidebar,
  VersionMenu,
  VersionMenuItem,
  NameVersionItem,
  CompareWithVersionItem,
  CompareSinceBeginningItem,
  DeleteVersionItem,
  useRestoreVersionAction,
} from '@blocknote/react/versioning'
import { withCollaboration } from '@blocknote/core/y'
import { CommentsExtension } from '@blocknote/core/comments'
import { dictionnaire } from './dictionnaire.js'
import { schemaLivre } from './schema.js'
import { boutonsGardes, boutonsGardesEnSuggestion } from './palette.js'
import { MagasinFils } from './commentaires.js'
import { creerAfficheur, suivreAuteurs, listeDesSuggestions } from './suggestions.js'
import { extensionHistorique } from './historique.js'
import { titresDe, titreCourant, allerAuTitre } from './plan.js'
import { blocsDuTexte, versMarkdown, versTypst, compilerPdf } from './export.js'
import { extensionTypographie } from '../../extensions/typographie/index.js'
import { extensionLimitesDuSuivi } from '../../extensions/limites-du-suivi/index.js'

/** La sélection, en blocs : le premier et le dernier bloc à texte touchés
 * (`null` sans sélection étendue). Pour Margo (étape 8). */
function selectionEnBlocs(editeur) {
  const blocs = (editeur.getSelection()?.blocks ?? []).filter((b) => Array.isArray(b.content))
  return blocs.length ? { de: blocs[0].id, a: blocs[blocs.length - 1].id } : null
}

/** Le bouton « Corriger » de la palette, à la fin, comme le bouton IA de Docs
 * (`AIToolbarButton`) : seulement quand le texte se modifie et qu'un bloc à
 * texte est sélectionné. Il envoie la sélection, en blocs, à l'application. */
function BoutonCorriger({ corriger }) {
  const editeur = useBlockNoteEditor()
  const Components = useComponentsContext()
  const choisis = useSelectedBlocks(editeur)
  if (!editeur.isEditable || !Components || !choisis.some((b) => Array.isArray(b.content))) return null
  const surClic = () => {
    const selection = selectionEnBlocs(editeur)
    if (selection) corriger.surClic(selection)
  }
  return (
    <Components.FormattingToolbar.Button mainTooltip={corriger.libelle} onClick={surClic}>
      {corriger.libelle}
    </Components.FormattingToolbar.Button>
  )
}

/** « Restaurer », après confirmation (l'API de BlockNote le prévoit :
 * `useRestoreVersionAction`, « custom items can request confirmation ») ;
 * comme Docs, qui demande avant de restaurer. */
function RestaurerApresConfirmation({ libelle, confirmer }) {
  const action = useRestoreVersionAction()
  if (!action.available) return null
  return (
    <VersionMenuItem onClick={() => void confirmer().then((oui) => oui && action.execute())}>{libelle}</VersionMenuItem>
  )
}

function Palette({ corriger, suggerer }) {
  return (
    <FormattingToolbar>
      {(suggerer ? boutonsGardesEnSuggestion : boutonsGardes)(getFormattingToolbarItems())}
      {corriger ? <BoutonCorriger corriger={corriger} /> : null}
    </FormattingToolbar>
  )
}

/**
 * @param {object} p
 * @param {'ecrire' | 'suggerer' | 'relire' | 'lire'} p.mode
 * @param {(ids: string[]) => Promise<Array<{ id: string, username: string, avatarUrl: string }>>} p.nomsDe
 * @param {{ service: object, capacites: readonly string[] } | null} [p.commentaires]
 * @param {(etat: { liste: ReturnType<typeof listeDesSuggestions>, enAttente: boolean, accepter: Function, refuser: Function, toutAccepter: Function, toutRefuser: Function } | null) => void} [p.surSuggestions]
 *   rappelé avec les suggestions à chaque changement (pour qui peut arbitrer) ; la liste
 *   n'est remplie qu'en relecture, `enAttente` dit dans tous les modes s'il y en a ; doit être stable
 * @param {boolean} [p.historique]  le panneau de l'historique est ouvert
 * @param {boolean} [p.peutRestaurer]  nommer une version et y revenir
 * @param {() => void} [p.surFermerHistorique]
 * @param {{ element: HTMLElement | null, filtre: 'open' | 'resolved' | 'all' } | null} [p.fils]
 *   où placer la liste des fils de commentaires (onglet « Commentaires »), et son filtre
 * @param {(code: string) => void} [p.surRefus]  un geste refusé en mode Suggérer (contournements, veille)
 * @param {() => Promise<boolean>} [p.confirmerRestauration]  demandée avant de revenir à une version
 * @param {boolean} [p.lectureAuDepart]  format S : s'ouvre en lecture ; un appui
 *   sur le texte passe en modification (curseur à l'endroit touché)
 * @param {{ current: { terminer: () => void, exporter: Function } | null }} [p.controle]  reçoit
 *   `terminer()` (bouton « Terminer » du bandeau) et `exporter(format, options)` :
 *   le texte de base (sans les suggestions en cours) en `'markdown'` (une
 *   chaîne) ou en `'pdf'` (des octets), options `{ modele, polices, titre, langue }`
 * @param {(enModification: boolean) => void} [p.surModification]
 * @param {(plan: { titres: Array<{ id: string, niveau: number, texte: string }>, courant: string | null, allerA: (id: string) => void }) => void} [p.surPlan]
 *   rappelé avec les titres du document (enfants compris) et le titre courant
 *   (le premier visible sous le bandeau, comme Docs), à chaque changement et
 *   au défilement ; doit être stable
 * @param {{ libelle: string, surClic: (selection: { de: string, a: string }) => void } | null} [p.corriger]
 *   le bouton « Corriger » de la palette (Margo, étape 8), ou rien
 * @param {(selection: { de: string, a: string } | null) => void} [p.surSelection]
 *   rappelé quand la sélection change, en blocs (Margo, étape 8) ; doit être stable
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
  confirmerRestauration,
  surRefus,
  fils = null,
  lectureAuDepart = false,
  controle,
  surModification,
  surPlan,
  corriger = null,
  surSelection,
}) {
  const avecSuggestions = mode !== 'lire' && contexte.suggestions !== null
  // Le mode du moment, lu par la typographie sans recréer l'éditeur.
  const modeMaintenant = useRef(mode)
  modeMaintenant.current = mode
  const surRefusDuSuivi = useRef(surRefus)
  surRefusDuSuivi.current = surRefus
  // Un afficheur, créé une fois (le mode du départ seulement) ; le mode passe
  // ensuite par l'extension (effet plus bas), sans le recréer.
  const afficheur = useMemo(
    () => (avecSuggestions ? creerAfficheur(contexte, mode === 'suggerer') : null),
    [contexte, avecSuggestions],
  )
  const magasin = useMemo(
    () =>
      commentaires
        ? new MagasinFils(
            commentaires.service,
            commentaires.capacites,
            personne.id,
            !commentaires.capacites.includes('ecrire'),
            langueDocument,
          )
        : null,
    [commentaires, personne.id, langueDocument],
  )
  const editeur = useCreateBlockNote(
    withCollaboration({
      schema: schemaLivre,
      // La typographie à la frappe en mode Modifier seulement : en suggestion,
      // les règles de saisie échouent (défaut de BlockNote, veille ; Sylvain,
      // 08/11/2026 : attendre sa correction).
      extensions: [
        extensionTypographie({ langue: langueDocument, actif: () => modeMaintenant.current === 'ecrire' }),
        // Contournements temporaires du mode Suggérer (veille).
        extensionLimitesDuSuivi({
          actif: () => modeMaintenant.current === 'suggerer',
          refuser: (code) => surRefusDuSuivi.current?.(code),
        }),
        ...(magasin ? [CommentsExtension({ threadStore: magasin, resolveUsers: nomsDe })] : []),
        extensionHistorique(contexte, peutRestaurer, dictionnaire(langue).versioning.before_restore),
      ],
      dictionary: dictionnaire(langue),
      // La zone d'édition doit avoir un nom pour les lecteurs d'écran (axe-core).
      domAttributes: { editor: { 'aria-label': nomAccessible } },
      collaboration: {
        fragment: contexte.fragment,
        provider: contexte.fournisseur,
        // L'identifiant de la personne : la présence compte les personnes, pas les noms.
        user: { name: personne.nom, color: personne.couleur, id: personne.id },
        resolveUsers: nomsDe,
        ...(afficheur ? { suggestionDoc: contexte.suggestions.doc, renderer: afficheur } : null),
      },
    }),
    [contexte, langue, langueDocument, afficheur, magasin, peutRestaurer],
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
    if (mode === 'suggerer') ext.enableSuggestions()
    else if (mode === 'relire') ext.viewSuggestions()
    else ext.disableSuggestions()
  }, [editeur, afficheur, mode, historique])

  // Les auteurs des suggestions, lus à côté de l'afficheur, pour le panneau.
  const [auteurs, setAuteurs] = useState(null)
  useEffect(() => (afficheur ? suivreAuteurs(contexte, setAuteurs) : undefined), [contexte, afficheur])

  // La liste des suggestions, pour qui peut les accepter ou les refuser : en
  // relecture seulement (l'éditeur les montre alors) ; dans les autres modes,
  // seulement s'il y en a, d'après l'afficheur.
  useEffect(() => {
    if (!afficheur || !surSuggestions) return
    const ext = editeur.getExtension('suggestions')
    const actions = {
      accepter: (s) => ext.applySuggestion(s.plage.debut, s.plage.fin),
      refuser: (s) => ext.revertSuggestion(s.plage.debut, s.plage.fin),
      toutAccepter: () => ext.applyAllSuggestions(),
      toutRefuser: () => ext.revertAllSuggestions(),
    }
    const relire = mode === 'relire'
    const signaler = () =>
      surSuggestions({
        liste: relire ? listeDesSuggestions(editeur, auteurs) : [],
        enAttente: !afficheur.attributed.isEmpty(),
        ...actions,
      })
    signaler()
    const arreter = editeur.onChange(signaler)
    // Hors relecture, l'éditeur ne montre pas les suggestions : leurs changements
    // arrivent par le document des suggestions.
    let minuterie = null
    const surChangement = () => {
      clearTimeout(minuterie)
      minuterie = setTimeout(signaler, 300)
    }
    contexte.suggestions.doc.on('update', surChangement)
    return () => {
      arreter()
      clearTimeout(minuterie)
      contexte.suggestions.doc.off('update', surChangement)
      surSuggestions(null)
    }
  }, [editeur, contexte, afficheur, mode, surSuggestions, auteurs])

  // Le plan : les titres du document, tenus à jour (volet « Plan » des trois
  // formats), et le titre courant au défilement. Aller à un titre y met le
  // curseur ; le focus seulement hors lecture à l'ouverture (le clavier d'un
  // écran tactile s'ouvrirait).
  useEffect(() => {
    if (!surPlan) return
    let precedent = ''
    let attente
    const allerA = (id) => allerAuTitre(editeur, id, { focaliser: !lectureAuDepart })
    const signaler = () => {
      const titres = titresDe(editeur.document).map((x) => ({ id: x.cle, niveau: x.niveau, texte: x.libelle }))
      const courant = titreCourant(
        editeur.domElement,
        titres.map((x) => ({ cle: x.id })),
      )
      const empreinte = JSON.stringify([titres, courant])
      if (empreinte === precedent) return
      precedent = empreinte
      surPlan({ titres, courant, allerA })
    }
    const auDefilement = () => {
      clearTimeout(attente)
      attente = setTimeout(signaler, 200)
    }
    signaler()
    const arreter = editeur.onChange(signaler)
    window.addEventListener('scroll', auDefilement, { passive: true })
    return () => {
      arreter()
      clearTimeout(attente)
      window.removeEventListener('scroll', auDefilement)
    }
  }, [editeur, surPlan, lectureAuDepart])

  // Format S : lecture à l'ouverture, modification d'un appui sur le texte.
  // Tout se fait dans le geste même (sinon le téléphone n'ouvre pas le
  // clavier) ; la propriété `editable` de BlockNoteView reste à `false` et l'on
  // bascule l'éditeur directement (maquette validée, docs/v2-format-S.md).
  const ecrit = mode !== 'lire' && mode !== 'relire'
  const appui = lectureAuDepart && ecrit && !historique
  const [enModification, setEnModification] = useState(false)
  useEffect(() => surModification?.(enModification), [enModification, surModification])
  const terminer = () => {
    if (!editeur.isEditable) return
    editeur.isEditable = false
    editeur.prosemirrorView?.dom.blur()
    setEnModification(false)
  }
  const exporter = async (format, { modele, polices, titre, langue } = {}) => {
    const blocs = blocsDuTexte(editeur, contexte.fragment)
    if (format === 'markdown') return versMarkdown(editeur, blocs)
    const { source, fichiers } = await versTypst(editeur, blocs, modele, { titre, langue })
    return compilerPdf(source, { fichiers, polices })
  }
  // Aller à un bloc cité par Margo : le curseur, et le bloc sous le bandeau.
  const allerAuBloc = (id) => allerAuTitre(editeur, id, { focaliser: !lectureAuDepart })
  useEffect(() => {
    if (controle) controle.current = { terminer, exporter, allerAuBloc }
  })
  // La sélection, en blocs, pour l'onglet Margo (« Sur la sélection »).
  useEffect(() => {
    if (!surSelection) return
    let precedente = null
    const signaler = () => {
      const s = selectionEnBlocs(editeur)
      const cle = s ? `${s.de} ${s.a}` : null
      if (cle === precedente) return
      precedente = cle
      surSelection(s)
    }
    signaler()
    return editeur.onSelectionChange(signaler)
  }, [editeur, surSelection])
  const palette = useCallback(
    (props) => <Palette {...props} corriger={corriger} suggerer={mode === 'suggerer'} />,
    [corriger, mode],
  )
  const commencer = (evenement) => {
    if (!appui || editeur.isEditable) return
    editeur.isEditable = true
    editeur.prosemirrorView?.focus()
    // Le curseur à l'endroit touché : par la sélection du navigateur, que
    // l'éditeur relit (sans importer ProseMirror hors de ses points
    // d'extension, règle 1 ; audit du 09/11/2026).
    const plage = document.caretPositionFromPoint
      ? (() => {
          const p = document.caretPositionFromPoint(evenement.clientX, evenement.clientY)
          if (!p) return null
          const r = document.createRange()
          r.setStart(p.offsetNode, p.offset)
          return r
        })()
      : document.caretRangeFromPoint?.(evenement.clientX, evenement.clientY)
    if (plage && editeur.domElement?.contains(plage.startContainer)) {
      plage.collapse(true)
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(plage)
    }
    setEnModification(true)
  }
  // Retour en lecture quand le clavier se ferme : la zone visible
  // (visualViewport) retrouve sa hauteur après avoir rétréci.
  useEffect(() => {
    const zone = window.visualViewport
    if (!zone || !enModification) return
    let clavierOuvert = false
    const surRedimension = () => {
      if (zone.height < window.innerHeight * 0.8) clavierOuvert = true
      else if (clavierOuvert) terminer()
    }
    zone.addEventListener('resize', surRedimension)
    return () => zone.removeEventListener('resize', surRedimension)
  }, [enModification])

  const vue = (
    <BlockNoteView
      editor={editeur}
      editable={appui ? false : ecrit && !historique}
      formattingToolbar={false}
      // Pas d'émojis par « : » dans le texte d'un livre (« deux:points » ouvrait
      // le sélecteur ; Sylvain, 11/11/2026, écart avec Docs) ; les réactions
      // aux commentaires gardent le leur.
      emojiPicker={false}
      // Pas de changement de type de bloc en Suggérer (contournement, veille).
      slashMenu={mode !== 'suggerer'}
    >
      <FormattingToolbarController formattingToolbar={palette} />
      {/* La liste des fils (exemple 06-comments-with-sidebar de BlockNote, et
          Docs) : rendue dans l'éditeur (elle en a besoin), placée dans l'onglet. */}
      {magasin && fils?.element ? (
        <RenderInPortalElement target={fils.element}>
          <ThreadsSidebar filter={fils.filtre} sort="position" />
        </RenderInPortalElement>
      ) : null}
      {historique && historiqueOuvert ? (
        <VersioningSidebar
          onClose={surFermerHistorique}
          snapshotMenu={
            confirmerRestauration ? (
              <VersionMenu>
                <NameVersionItem />
                <CompareWithVersionItem />
                <CompareSinceBeginningItem />
                <RestaurerApresConfirmation
                  libelle={dictionnaire(langue).versioning.restore_menuitem}
                  confirmer={confirmerRestauration}
                />
                <DeleteVersionItem />
              </VersionMenu>
            ) : undefined
          }
        />
      ) : null}
    </BlockNoteView>
  )
  return appui ? <div onClick={commencer}>{vue}</div> : vue
}
