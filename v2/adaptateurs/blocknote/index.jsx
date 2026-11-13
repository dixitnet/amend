// Adaptateur BlockNote (couche 2) : l'éditeur collaboratif, lié au document
// ouvert par l'adaptateur Yjs, avec le schéma du livre et nos extensions. Il
// reçoit la langue de l'interface (menus de l'éditeur), la langue du document
// (typographie), la personne, et ce qu'elle fait du texte. Les trois modes
// d'un éditeur sont ceux de l'exemple de BlockNote
// (`07-collaboration/12-multi-doc-versioning`), un seul éditeur et un seul
// afficheur des suggestions, le mode changeant par l'extension des
// suggestions, sans rien recréer :
//  - `ecrire` (« Éditer ») : elle écrit le texte en voyant les corrections
//    (`viewSuggestions`, éditeur modifiable ; Sylvain, 12/11/2026). Écrire
//    contre une correction affichée la prolongeait (y-prosemirror#245) : le
//    correctif temporaire `correctif-245.js` replace la frappe dans le texte ;
//  - `suggerer` (« Corriger ») : tout ce qu'elle tape est une correction
//    (`enableSuggestions` ; pour un correcteur, y/hub le garantit, la branche
//    principale lui est fermée) ; elle voit aussi celles des autres ;
//  - `ecrireSeul` : elle écrit sans voir les corrections (`disableSuggestions`),
//    le repli quand leur affichage plante sur un document ;
//  - `lire` : lecture seule, sans les corrections.
// Aucune apparence ici : feuilles de style et thème relèvent de la couche
// design, dont le fournisseur Mantine entoure l'application.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useCreateBlockNote,
  FormattingToolbar,
  FormattingToolbarController,
  LinkToolbar,
  LinkToolbarController,
  OpenLinkButton,
  getFormattingToolbarItems,
  blockTypeSelectItems,
  useBlockNoteEditor,
  useComponentsContext,
  useSelectedBlocks,
  useEditorState,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  getPageBreakReactSlashMenuItems,
  RenderInPortalElement,
  ThreadsSidebar,
  FloatingComposerController,
} from '@blocknote/react'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
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
import { boutonsGardes, boutonsGardesEnSuggestion, boutonsDuFormatS } from './palette.js'
import { MagasinFils } from './commentaires.js'
import {
  creerAfficheur,
  suivreAuteurs,
  listeDesSuggestions,
  compterSuggestions,
  curseurApresFrappe,
} from './suggestions.js'
import { extensionHistorique } from './historique.js'
import { titresDe, titreCourant, allerAuTitre } from './plan.js'
import { blocsDuTexte, versMarkdown, versTypst, compilerPdf, compterBlocs } from './export.js'
import { TYPE_TABLE } from '../../extensions/tableDesMatieres/index.js'
import { TYPE_TITRE, TYPE_SOUS_TITRE } from '../../extensions/titres/index.js'
import { dateDuJour, typographier, nfc, compter as compterTextes } from '../../domaine/index.js'
import { TYPE_NOTE, EVENEMENT_NOTE } from '../../extensions/note/index.js'
import { extensionTypographie } from '../../extensions/typographie/index.js'
import { extensionLimitesDuSuivi } from '../../extensions/limites-du-suivi/index.js'

// Le compte des suggestions hors relecture : chaque minute, ou 30 s après le
// dernier changement (Sylvain, 12/11/2026 : « plus rustique »).
const COMPTE_CHAQUE = 60_000
const COMPTE_AU_REPOS = 30_000

/** Fait défiler le texte jusqu'à une position, au centre, comme BlockNote
 * pour un commentaire (`selectThread`). */
function montrerPosition(editeur, position) {
  try {
    const { node } = editeur.prosemirrorView.domAtPos(position)
    const element = node.nodeType === 1 ? node : node.parentElement
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } catch {
    // Une position qui n'existe plus (suggestion traitée entre-temps) : rien.
  }
}
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

/** Le bouton de l'exposant (11/11/2026), sur le modèle des boutons de style
 * de BlockNote (`BasicTextStyleButton`) : seulement quand le texte se modifie
 * et qu'un bloc à texte est sélectionné. Libellé et picto donnés par l'application. */
/** Le bouton « Note de bas de page » de la palette : la note se pose à la fin de la sélection. */
function BoutonNote({ note, surNouvelleNote }) {
  const editeur = useBlockNoteEditor()
  const Components = useComponentsContext()
  const visible = useEditorState({
    editor: editeur,
    selector: ({ editor }) => {
      const blocs = editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]
      return editor.isEditable && blocs.some((b) => Array.isArray(b.content))
    },
  })
  if (!visible || !Components) return null
  return (
    <Components.FormattingToolbar.Button
      label={note.libelle}
      mainTooltip={note.libelle}
      icon={note.pictoPalette ?? note.picto}
      onClick={surNouvelleNote}
    />
  )
}

function BoutonExposant({ exposant }) {
  const editeur = useBlockNoteEditor()
  const Components = useComponentsContext()
  const etat = useEditorState({
    editor: editeur,
    selector: ({ editor }) => {
      const blocs = editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]
      if (!editor.isEditable || !blocs.some((b) => b.content !== undefined)) return undefined
      return { actif: 'exposant' in editor.getActiveStyles() }
    },
  })
  if (etat === undefined || !Components) return null
  const basculer = () => {
    editeur.focus()
    editeur.toggleStyles({ exposant: true })
  }
  return (
    <Components.FormattingToolbar.Button
      label={exposant.libelle}
      mainTooltip={exposant.libelle}
      isSelected={etat.actif}
      icon={exposant.picto}
      onClick={basculer}
    />
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

/** Les types de bloc du menu de la palette : ceux de BlockNote, puis Titre et
 * Sous-titre, comme Docs y ajoute ses blocs (`BlockNoteToolbar.tsx`). */
function typesDeBloc(editeur, textes) {
  const nos = [
    ['titre', TYPE_TITRE],
    ['sousTitre', TYPE_SOUS_TITRE],
  ]
    // `titre` et `sousTitre` sont facultatifs dans les textes de l'éditeur.
    .filter(([cle]) => textes?.[cle])
    .map(([cle, type]) => ({ name: textes[cle].titre, type, icon: () => textes[cle].picto }))
  return [...blockTypeSelectItems(editeur), ...nos]
}

function Palette({ corriger, suggerer, exposant, formatS, note, surNouvelleNote, titres }) {
  const editeur = useBlockNoteEditor()
  const tous = getFormattingToolbarItems(typesDeBloc(editeur, titres))
  const boutons = suggerer
    ? boutonsGardesEnSuggestion(tous)
    : boutonsGardes(tous, exposant ? <BoutonExposant key="exposantStyleButton" exposant={exposant} /> : null)
  return (
    <FormattingToolbar>
      {formatS ? boutonsDuFormatS(boutons) : boutons}
      {note && surNouvelleNote ? <BoutonNote note={note} surNouvelleNote={surNouvelleNote} /> : null}
      {corriger ? <BoutonCorriger corriger={corriger} /> : null}
    </FormattingToolbar>
  )
}

/** La barre d'un lien en mode Suggérer : seulement l'ouvrir. Le modifier ou
 * le retirer serait une mise en forme suggérée, que le panneau ne sait pas
 * arbitrer (contournement, veille ; Sylvain, 11/11/2026). */
function BarreDuLienEnSuggestion(props) {
  return (
    <LinkToolbar {...props}>
      <OpenLinkButton url={props.url} />
    </LinkToolbar>
  )
}

/** Le menu « / » : celui de BlockNote, plus le saut de page (comme Docs,
 * `BlockNoteSuggestionMenu.tsx`) et la table des matières (11/11/2026), sans
 * les émoticônes (Sylvain, 12/11/2026 ; Docs les garde). */
function itemsDuMenu(editeur, table, textesTitres) {
  const items = [
    ...getDefaultReactSlashMenuItems(editeur).filter((x) => x.key !== 'emoji'),
    ...getPageBreakReactSlashMenuItems(editeur),
  ]
  if (table)
    items.push({
      key: 'table_des_matieres',
      title: table.titre,
      subtext: table.description,
      aliases: [],
      group: editeur.dictionary.slash_menu.page_break.group,
      icon: table.picto,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editeur, { type: TYPE_TABLE }),
    })
  const groupe = items.at(-1)?.group
  // « /date » : la date du jour dans le texte, AAAA-MM-JJ (Sylvain, 12/11/2026).
  if (textesTitres?.date)
    items.push({
      key: 'amend_date',
      title: textesTitres.date.titre,
      subtext: textesTitres.date.description,
      aliases: ['date'],
      group: groupe,
      icon: textesTitres.date.picto,
      onItemClick: () => editeur.insertInlineContent(dateDuJour()),
    })
  // La note de bas de page (12/11/2026) : la fenêtre s'ouvre pour l'écrire.
  if (textesTitres?.note && textesTitres.surNouvelleNote)
    items.push({
      key: 'amend_note',
      title: textesTitres.note.titre,
      subtext: textesTitres.note.description,
      aliases: ['note'],
      group: groupe,
      icon: textesTitres.note.picto,
      onItemClick: textesTitres.surNouvelleNote,
    })
  // Titre et sous-titre, en bas du menu (Sylvain, 12/11/2026), dans son
  // dernier groupe.
  for (const [cle, type] of [
    ['titre', TYPE_TITRE],
    ['sousTitre', TYPE_SOUS_TITRE],
  ])
    if (textesTitres?.[cle])
      items.push({
        key: `amend_${type}`,
        title: textesTitres[cle].titre,
        subtext: textesTitres[cle].description,
        aliases: [],
        group: groupe,
        icon: textesTitres[cle].picto,
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editeur, { type }),
      })
  return items
}

/**
 * @param {object} p
 * @param {'ecrire' | 'suggerer' | 'ecrireSeul' | 'lire'} p.mode
 * @param {(ids: string[]) => Promise<Array<{ id: string, username: string, avatarUrl: string }>>} p.nomsDe
 * @param {{ service: object, capacites: readonly string[] } | null} [p.commentaires]
 * @param {(etat: { liste: ReturnType<typeof listeDesSuggestions>, nombre: number, enAttente: boolean, accepter: Function, refuser: Function, montrer: Function, toutAccepter: Function, toutRefuser: Function } | null) => void} [p.surSuggestions]
 *   `nombre` : en relecture, la longueur de la liste ; ailleurs, un compte refait
 *   à l'ouverture, puis chaque minute ou après 30 s de repos ; `montrer(s)` fait
 *   défiler le texte jusqu'à la suggestion, comme BlockNote pour un commentaire
 * @param {(n: number) => void} [p.surNombreFils] rappelé avec le nombre de fils
 *   de commentaires ouverts (non résolus) ; doit être stable
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
 *   `terminer()` (bouton « Terminer » du bandeau), `compter()` ({ signes, mots }
 *   du texte de base) et `exporter(format, options)` :
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
 * @param {{ exposant?: { libelle: string, picto: any }, table?: { titre: string, description: string, profondeur: string, niveaux?: Record<number, string>, picto: any }, titre?: { titre: string, description: string, picto: any }, sousTitre?: { titre: string, description: string, picto: any } }} [p.textes]
 *   libellés et pictos de nos ajouts (exposant, table des matières), donnés par l'application
 * @param {(note: { texte: string, nouvelle: boolean, lectureSeule: boolean,
 *   enregistrer: (texte: string) => void, retirer: (() => void) | null, fermer: () => void } | null) => void} [p.surNote]
 *   une note de bas de page à lire, écrire ou retirer (12/11/2026) : l'application
 *   ouvre sa fenêtre ; doit être stable
 * @param {(compte: { total: { signes: number, mots: number }, selection: { signes: number, mots: number } | null }) => void} [p.surCompte]
 *   les signes (espaces compris) et les mots du texte de base, et de la
 *   sélection quand il y en a une (bandeau, 12/11/2026) ; doit être stable
 * @param {boolean} [p.formatS] format S (téléphone) : barre de mise en forme
 *   sans le choix du type de bloc (Sylvain, 12/11/2026)
 * @param {(fichier: File) => Promise<string>} [p.televerser] envoie une image et rend son
 *   adresse (\`uploadFile\` de BlockNote, comme Docs) ; absent : pas d'envoi de fichier
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
  surNombreFils,
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
  textes = {},
  televerser,
  formatS = false,
  surNote,
  surCompte,
}) {
  const avecSuggestions = mode !== 'lire' && contexte.suggestions !== null
  // Le mode du moment, lu par la typographie sans recréer l'éditeur.
  const modeMaintenant = useRef(mode)
  modeMaintenant.current = mode
  const surRefusDuSuivi = useRef(surRefus)
  surRefusDuSuivi.current = surRefus
  // Un afficheur, créé une fois (le mode du départ seulement) ; le mode passe
  // ensuite par l'extension (effet plus bas), sans le recréer.
  // Correctif temporaire (y-prosemirror#245) : le curseur suit une frappe replacée.
  const replacerCurseur = useRef(null)
  const afficheur = useMemo(
    () =>
      avecSuggestions
        ? creerAfficheur(contexte, mode === 'suggerer', (apres) => replacerCurseur.current?.(apres))
        : null,
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
      // Envoyer une image (choisie, collée ou déposée), comme Docs.
      ...(televerser ? { uploadFile: televerser } : {}),
      // La typographie à la frappe en mode Modifier seulement : en suggestion,
      // les règles de saisie échouent (défaut de BlockNote, veille ; Sylvain,
      // 08/11/2026 : attendre sa correction).
      extensions: [
        extensionTypographie({
          langue: langueDocument,
          actif: () => ['ecrire', 'ecrireSeul'].includes(modeMaintenant.current),
        }),
        // Contournements temporaires du mode Suggérer (veille).
        extensionLimitesDuSuivi({
          actif: () => modeMaintenant.current === 'suggerer',
          refuser: (code) => surRefusDuSuivi.current?.(code),
        }),
        ...(magasin ? [CommentsExtension({ threadStore: magasin, resolveUsers: nomsDe })] : []),
        extensionHistorique(contexte, peutRestaurer, dictionnaire(langue).versioning.before_restore),
      ],
      // Les textes de nos extensions (table des matières) voyagent avec le
      // dictionnaire de BlockNote, que l'éditeur leur donne.
      dictionary: {
        ...dictionnaire(langue),
        amend: { table: textes.table ?? {}, note: { appel: textes.note?.libelle } },
      },
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
    // Les textes de la table suivent la langue, déjà dans la liste : les
    // ajouter recréerait l'éditeur à chaque nouvel objet.
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
  replacerCurseur.current = (apres) => curseurApresFrappe(editeur, apres)
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
    else if (mode === 'ecrire') ext.viewSuggestions()
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
      montrer: (s) => montrerPosition(editeur, s.debut),
      toutAccepter: () => ext.applyAllSuggestions(),
      toutRefuser: () => ext.revertAllSuggestions(),
    }
    // La liste, dans les modes où le texte montre les corrections.
    const relire = mode === 'ecrire' || mode === 'suggerer'
    // Hors relecture, le nombre est compté à part, rarement (compterSuggestions).
    let compte = relire ? 0 : compterSuggestions(contexte, afficheur)
    const signaler = () => {
      const enAttente = !afficheur.attributed.isEmpty()
      const liste = relire ? listeDesSuggestions(editeur, auteurs) : []
      surSuggestions({ liste, nombre: !enAttente ? 0 : relire ? liste.length : compte, enAttente, ...actions })
    }
    signaler()
    let repos = null
    const recompter = () => {
      compte = compterSuggestions(contexte, afficheur)
      signaler()
    }
    const intervalle = relire ? null : setInterval(recompter, COMPTE_CHAQUE)
    const changement = () => {
      if (relire) return signaler()
      clearTimeout(repos)
      repos = setTimeout(recompter, COMPTE_AU_REPOS)
      signaler()
    }
    const arreter = editeur.onChange(changement)
    // Hors relecture, l'éditeur ne montre pas les suggestions : leurs changements
    // arrivent par le document des suggestions.
    let minuterie = null
    const surChangement = () => {
      clearTimeout(minuterie)
      minuterie = setTimeout(changement, 300)
    }
    contexte.suggestions.doc.on('update', surChangement)
    return () => {
      arreter()
      clearTimeout(minuterie)
      clearTimeout(repos)
      clearInterval(intervalle)
      contexte.suggestions.doc.off('update', surChangement)
      surSuggestions(null)
    }
  }, [editeur, contexte, afficheur, mode, surSuggestions, auteurs])

  // Le compteur du bandeau (Sylvain, 12/11/2026) : le texte de base, recompté
  // au repos (500 ms après la frappe), et la sélection, à chaque changement.
  useEffect(() => {
    if (!surCompte) return undefined
    let total = null
    let minuterie = null
    const signaler = () => {
      const choisi = editeur.getSelectedText()
      surCompte({ total, selection: choisi.trim() ? compterTextes([choisi]) : null })
    }
    const recompter = () => {
      total = compterBlocs(blocsDuTexte(editeur, contexte.fragment))
      signaler()
    }
    recompter()
    const arreter = editeur.onChange(() => {
      clearTimeout(minuterie)
      minuterie = setTimeout(recompter, 500)
    })
    const arreterSelection = editeur.onSelectionChange(signaler)
    return () => {
      arreter()
      arreterSelection()
      clearTimeout(minuterie)
    }
  }, [editeur, contexte, surCompte])

  // Le nombre de fils ouverts, pour le compteur des tâches (Sylvain, 12/11/2026).
  useEffect(() => {
    if (!magasin || !surNombreFils) return
    const compter = (fils) => surNombreFils([...fils.values()].filter((f) => !f.resolved).length)
    compter(magasin.getThreads())
    const arreter = magasin.subscribe(compter)
    return () => {
      arreter()
      surNombreFils(0)
    }
  }, [magasin, surNombreFils])

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
    // En capture : le texte défile dans sa zone (formats M et L) ou dans l'écran.
    document.addEventListener('scroll', auDefilement, { passive: true, capture: true })
    return () => {
      arreter()
      clearTimeout(attente)
      document.removeEventListener('scroll', auDefilement, { capture: true })
    }
  }, [editeur, surPlan, lectureAuDepart])

  // Format S : lecture à l'ouverture, modification d'un appui sur le texte.
  // Tout se fait dans le geste même (sinon le téléphone n'ouvre pas le
  // clavier) ; la propriété `editable` de BlockNoteView reste à `false` et l'on
  // bascule l'éditeur directement (maquette validée, docs/v2-format-S.md).
  const ecrit = mode !== 'lire'
  const appui = lectureAuDepart && ecrit && !historique
  const [enModification, setEnModification] = useState(false)
  useEffect(() => surModification?.(enModification), [enModification, surModification])
  const terminer = () => {
    if (!editeur.isEditable) return
    editeur.isEditable = false
    editeur.prosemirrorView?.dom.blur()
    setEnModification(false)
  }
  const exporter = async (format, { modele, polices, titre, langue, auteur } = {}) => {
    const blocs = blocsDuTexte(editeur, contexte.fragment)
    if (format === 'markdown') return versMarkdown(editeur, blocs, { titreTable: textes.table?.titre })
    const { source, fichiers } = await versTypst(editeur, blocs, modele, { titre, langue, auteur })
    return compilerPdf(source, { fichiers, polices })
  }
  // Aller à un bloc cité par Margo : le curseur, et le bloc sous le bandeau.
  const allerAuBloc = (id) => allerAuTitre(editeur, id, { focaliser: !lectureAuDepart })
  // Signes (espaces compris) et mots du texte de base, comme le menu de Docs.
  const compter = () => compterBlocs(blocsDuTexte(editeur, contexte.fragment))
  useEffect(() => {
    if (controle) controle.current = { terminer, exporter, allerAuBloc, compter }
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
  // Les notes de bas de page (12/11/2026) : le texte est typographié et
  // composé (NFC) à l'enregistrement ; vide, la note est retirée.
  // Une note tient sur une ligne : les sauts de ligne deviennent des espaces.
  const typo = useCallback(
    (t) =>
      typographier(
        nfc(
          String(t ?? '')
            .replace(/\s*\n\s*/g, ' ')
            .trim(),
        ),
        { langue: langueDocument },
      ),
    [langueDocument],
  )
  // La fenêtre fermée, le curseur revient dans le texte (sinon la frappe se perd).
  const rendreLaMain = useCallback(() => setTimeout(() => editeur.isEditable && editeur.focus(), 0), [editeur])
  const surNoteActuel = useRef(surNote)
  surNoteActuel.current = surNote
  useEffect(() => {
    const dom = editeur.domElement
    if (!dom) return undefined
    const ouvrir = (e) => {
      const { texte, modifier, retirer } = e.detail
      surNoteActuel.current?.({
        texte,
        nouvelle: false,
        // En Suggérer, le texte d'une note ne se modifie pas : Yjs 14 ne sait
        // pas accepter une seule proposition d'attribut (veille, 12/11/2026) ;
        // on commente l'appel. Ajouter ou supprimer une note reste possible.
        lectureSeule: !editeur.isEditable || modeMaintenant.current === 'suggerer',
        enregistrer: (t) => (typo(t) ? modifier(typo(t)) : retirer()),
        retirer,
        fermer: rendreLaMain,
      })
    }
    dom.addEventListener(EVENEMENT_NOTE, ouvrir)
    return () => dom.removeEventListener(EVENEMENT_NOTE, ouvrir)
  }, [editeur, editeur.domElement, typo, rendreLaMain])
  /** Une nouvelle note, posée à la fin de la sélection du moment. */
  const nouvelleNote = useCallback(() => {
    surNoteActuel.current?.({
      texte: '',
      nouvelle: true,
      lectureSeule: false,
      enregistrer: (t) => {
        const texte = typo(t)
        if (!texte) return
        // La sélection est relue à l'enregistrement : ProseMirror l'a suivie
        // pendant la saisie, même si d'autres ont écrit entre-temps.
        const position = editeur.prosemirrorState.selection.to
        editeur.transact((tr) => tr.insert(position, editeur.pmSchema.nodes[TYPE_NOTE].create({ texte })))
        editeur.focus()
      },
      retirer: null,
      fermer: rendreLaMain,
    })
  }, [editeur, typo, rendreLaMain])
  const palette = useCallback(
    (props) => (
      <Palette
        {...props}
        corriger={corriger}
        suggerer={mode === 'suggerer'}
        exposant={textes.exposant}
        formatS={formatS}
        note={textes.note}
        surNouvelleNote={surNote ? nouvelleNote : null}
        titres={textes}
      />
    ),
    [corriger, mode, textes, formatS, surNote, nouvelleNote],
  )
  const menu = useCallback(
    async (requete) =>
      filterSuggestionItems(
        itemsDuMenu(editeur, textes.table, { ...textes, surNouvelleNote: surNote ? nouvelleNote : null }),
        requete,
      ),
    [editeur, textes, surNote, nouvelleNote],
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
      // Notre menu « / » (saut de page, table des matières) ; aucun en
      // Suggérer : pas de changement de type de bloc (contournement, veille).
      slashMenu={false}
      linkToolbar={mode !== 'suggerer'}
      // Les fils ne s'ouvrent que dans la colonne de droite : pas de bulle au
      // clic sur un passage commenté (Sylvain, 12/11/2026, écart avec Docs, qui
      // n'a que les bulles). La saisie d'un nouveau commentaire reste flottante.
      comments={false}
    >
      {magasin ? <FloatingComposerController /> : null}
      <FormattingToolbarController formattingToolbar={palette} />
      {mode === 'suggerer' ? <LinkToolbarController linkToolbar={BarreDuLienEnSuggestion} /> : null}
      {mode !== 'suggerer' ? <SuggestionMenuController triggerCharacter="/" getItems={menu} /> : null}
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
