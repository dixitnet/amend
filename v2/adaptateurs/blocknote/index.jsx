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
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { titresDe, titreCourant, allerAuTitre } from './plan.js'
import { blocsDuTexte, versMarkdown, versTypst, compilerPdf } from './export.js'
import { extensionTypographie } from '../../extensions/typographie/index.js'

function Palette() {
  return <FormattingToolbar>{boutonsGardes(getFormattingToolbarItems())}</FormattingToolbar>
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
  lectureAuDepart = false,
  controle,
  surModification,
  surPlan,
}) {
  const avecSuggestions = mode !== 'lire' && contexte.suggestions !== null
  // Le mode du moment, lu par la typographie sans recréer l'éditeur.
  const modeMaintenant = useRef(mode)
  modeMaintenant.current = mode
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
          )
        : null,
    [commentaires, personne.id],
  )
  const editeur = useCreateBlockNote(
    withCollaboration({
      schema: schemaLivre,
      // La typographie à la frappe en mode Modifier seulement : en suggestion,
      // les règles de saisie échouent (défaut de BlockNote, veille ; Sylvain,
      // 08/11/2026 : attendre sa correction).
      extensions: [
        extensionTypographie({ langue: langueDocument, actif: () => modeMaintenant.current === 'ecrire' }),
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
  useEffect(() => {
    if (controle) controle.current = { terminer, exporter }
  })
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
    <BlockNoteView editor={editeur} editable={appui ? false : ecrit && !historique} formattingToolbar={false}>
      <FormattingToolbarController formattingToolbar={Palette} />
      {historique && historiqueOuvert ? <VersioningSidebar onClose={surFermerHistorique} /> : null}
    </BlockNoteView>
  )
  return appui ? <div onClick={commencer}>{vue}</div> : vue
}
