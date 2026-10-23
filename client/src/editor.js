import { monterMasqueChargement } from './masqueChargement.js'
import { monterReglagesAffichage } from './reglagesAffichage.js'
import * as Y from 'yjs'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'

import { schema } from './schema.js'
import { SimpleProvider } from './provider.js'
import {
  trackChangesPlugin,
  isTrackChangesEnabled,
  setTrackChangesEnabled,
  makeDispatchTransaction,
  selectionHighlightPlugin,
  richPastePlugin,
  pendingBreakPlugin,
} from './trackChanges.js'
import { mountChangesPanel } from './changesPanel.js'
import { mountAIPanel } from './aiPanel.js'
import { monterDialogue } from './dialogue.js'
import { monterVolet } from './interface/volets.js'
import { monterCarteModification } from './carteModification.js'
import { mountBulleSelection } from './bulleSelection.js'
import { svgIcone } from './interface/icones.js'
import { calculerDisposition, decalageBarre } from './interface/disposition.js'
import { commentsPlugin, mountCommentsPanel, commentaireAuPoint, commentairesAncres } from './comments.js'
import { mountCommentsGutter, mountGutterComposer } from './commentsGutter.js'
import { mountOutlinePanel } from './outline.js'
import { mountWordCount } from './wordcount.js'
import { mountCompteursRelecture } from './compteursRelecture.js'
import { markdownShortcutsPlugin } from './markdownShortcuts.js'
import { typographiePlugin } from './typographie.js'
import { taskListPlugin } from './taskList.js'
import {
  tableEditing,
  isInTable,
  fixTables,
  addRowAfter,
  deleteRow,
  addColumnAfter,
  deleteColumn,
  deleteTable,
} from 'prosemirror-tables'
import { mountPresenceBar } from './presence.js'
import { monterMenuCompte } from './compteMenu.js'
import { imagesPlugin, deposerImages, ouvrirSelecteurImages, messageFugace } from './images.js'
import { tableOfContentsPlugin, insererTable } from './tableOfContents.js'
import { footnotesPlugin, insererNote, monterListeDesNotes } from './footnotes.js'
import { liensPlugin, commandeLien } from './liens.js'
import { monterInterfaceTelephone } from './iphone.js'
import { ouvrirFilCommentaire, monterBarreRelecture, monterBoutonCommenter } from './relectureTactile.js'
import { media, petitEcran, REQUETE_PETIT_ECRAN } from './feuille.js'
import { suivreLeFormat } from './interface/format.js'
import { couleurSure } from '../../shared/securite.js'
import { NOM_TEXTE, NOM_COMMENTAIRES } from '../../shared/protocole.js'
import { poserRoleDeLaPage, oublierRoleDeLaPage } from './contextePage.js'
import { creerBarreOutils, mkButton } from './barreOutils.js'
import { ouvrirComposeurTactile, tactilePlugin } from './composeurTactile.js'
import { raccourcisClavier } from './raccourcis.js'
import { creerColonneDroite, creerColonnePlan } from './colonnes.js'
import { creerFabriqueMenus, monterMenusPartageExport } from './menusPartageExport.js'
import {
  monterZoneGauche,
  creerInterrupteurSuivi,
  monterCompteursBandeau,
  monterGroupeHistorique,
  creerVoyantConnexion,
} from './bandeauDocument.js'
import {
  basculerMarque,
  basculerListeAPuces,
  basculerListeNumerotee,
  basculerListeACocher,
  basculerCitation,
  hasAncestorOfType,
  styleDeBlocCommun,
  appliquerStyleDeBloc,
  insererTableau,
  commandeTableau,
  insererLigne,
  insererSautDePage,
} from './commandesBarre.js'

function buildCursor(user) {
  const cursor = document.createElement('span')
  cursor.classList.add('remote-cursor')
  // Sert à retrouver le curseur d'une personne précise quand on clique sur
  // sa pastille dans le bandeau (presence.js).
  cursor.dataset.user = user.name
  cursor.style.setProperty('--user-color', couleurSure(user.color))
  // L'étiquette du nom n'est PAS du texte : elle est dessinée par le CSS
  // (`::after`, depuis `data-user`). Dans le DOM elle faisait partie de la
  // sélection — un double-clic sur le mot où se tenait le curseur d'un autre
  // onglet donnait « phraseSyg », et taper par-dessus brouillait le texte
  // (constaté en prod le 09/10/2026).
  cursor.contentEditable = 'false'
  return cursor
}

export function mountEditor(root, docId, user, docMeta) {
  root.innerHTML = ''
  // Ce que cette personne peut faire ici (28/09/2026, phase 0 de
  // claude/etude-roles-serveur.md) : des capacités envoyées par le
  // serveur avec les métadonnées, jamais un nom de rôle testé en dur —
  // c'est ce qui permet d'ouvrir l'IA aux correcteurs, ou d'inventer un
  // rôle, en ne touchant qu'à server/roles.js. À défaut (ne devrait pas
  // arriver), rien n'est permis.
  const cap = docMeta.myCapabilities || {}
  // Écrire dans le texte, librement ou en suivi. Un lecteur ne le peut pas.
  const peutProposer = !!(cap.canEditFreely || cap.canProposeChanges)
  // Poser un lien (30/09/2026) : les éditeurs. Une mise en forme qui change
  // où mène un texte lu par d'autres ne passe pas par le suivi ; un
  // correcteur, dont tout le travail doit rester visible et rejetable, n'en
  // pose donc pas (voir liens.js).
  const peutPoserLien = () => !!cap.canEditFreely
  const refuserLien = () =>
    messageFugace('Un correcteur ne pose pas de lien : proposez le texte, et mettez l’adresse en commentaire.', {
      erreur: true,
    })

  // Full-width banner: document identity/status, spans the whole page above
  // the three-column layout (plan / text / assistance) — deliberately kept
  // separate from the formatting toolbar below, which only belongs to the
  // middle (text) column.
  const shell = document.createElement('div')
  shell.className = 'app-shell'

  const topBanner = document.createElement('div')
  topBanner.className = 'top-banner'

  // Le bandeau en quatre zones (17/09/2026). Avant, c'était une file
  // d'attente historique : chaque fonction nouvelle se posait à droite de
  // la précédente, si bien qu'on trouvait côte à côte des gestes sans
  // rapport — naviguer, savoir qui est là, travailler le texte, changer la
  // forme, faire sortir le document. Les zones séparent par **nature du
  // geste**, pas par fréquence d'usage :
  //
  //   gauche — où je suis  : retour, nouveau, favori, titre (éditable)
  //   centre — qui est là  : les pastilles de présence, seules
  //   droite — ce que je fais au document : texte / forme / sortie,
  //            puis l'état de la connexion et moi
  //
  // L'intérêt n'est pas cosmétique. Chaque chantier à venir a déjà sa place
  // sans nouveau bouton (aperçu PDF → panneau de mise en page ; publication
  // → menu Partager ; émoticônes → barre de mise en forme du texte ; aide →
  // menu du compte), et un correcteur voit un bandeau cohérent — la zone
  // « forme » disparaît entièrement — plutôt qu'une rangée trouée.
  const zoneGauche = document.createElement('div')
  zoneGauche.className = 'banniere-zone banniere-gauche'
  const zoneCentre = document.createElement('div')
  zoneCentre.className = 'banniere-zone banniere-centre'
  const zoneDroite = document.createElement('div')
  zoneDroite.className = 'banniere-zone banniere-droite'
  topBanner.append(zoneGauche, zoneCentre, zoneDroite)

  // Les écouteurs posés hors de l'éditeur (document, matchMedia) : `destroy` les retire.
  const ecouteursGlobaux = []
  const menuDeroulant = creerFabriqueMenus(ecouteursGlobaux)
  // Le format de la fenêtre (S, M ou L) sur la racine : `data-format`.
  ecouteursGlobaux.push(suivreLeFormat(shell))

  // --- Zone gauche : où je suis --------------------------------------------

  const { titleInput, nouveauBtn } = monterZoneGauche(zoneGauche, {
    docId,
    docMeta,
    envoyerTitre: (titre) => provider.sendTitle(titre),
    cibleDuPlan: () => outlineSidebar,
  })

  // --- Zone centre : qui est là --------------------------------------------

  // Rempli une fois que `provider` existe, plus bas. Depuis le 21/10/2026
  // (esthétique de la vue V1), les pastilles de présence sont à droite, avant
  // Partager : on voit qui est là au moment de partager.
  const presenceContainer = document.createElement('div')
  presenceContainer.className = 'banniere-groupe banniere-presence'

  // --- Zone droite : ce que je fais au document ----------------------------

  // 1. Travailler le texte : les compteurs. L'interrupteur du suivi, lui, prend
  // la tête de la zone « Révision » de la barre d'outils (`placerLeSuivi`).
  const { trackToggleLabel, trackToggle } = creerInterrupteurSuivi()
  const { groupeTexte, modifsCount, commentsCount, wordCount } = monterCompteursBandeau({
    avecModifications: !!(peutProposer || cap.canReviewChanges),
  })

  // 2. La forme et 3. Faire sortir : les menus Exporter et Partager.
  const { groupeForme, menuPartage, menuExport, chargerPublication } = monterMenusPartageExport({
    menuDeroulant,
    docId,
    docMeta,
    getDoc: () => view.state.doc,
    getTitre: () => titleInput.value,
  })

  // Le menu ⋯ (21/10/2026, esthétique de la vue V1) : ce qu'on fait rarement
  // depuis un document — en créer un autre, ouvrir ses
  // versions — quitte la rangée du bandeau.
  const lienVersions = monterGroupeHistorique(docId).querySelector('a')
  lienVersions.className = 'menu-item history-link'
  const menuPlus = menuDeroulant('', { classe: 'menu-plus', titre: 'Plus d’actions' })
  const boutonPlus = menuPlus.el.querySelector('.menu-flottant-bouton')
  boutonPlus.innerHTML = svgIcone('plus', 20)
  boutonPlus.setAttribute('aria-label', 'Plus d’actions')
  boutonPlus.classList.add('btn-icone')
  menuPlus.liste.append(nouveauBtn, lienVersions)
  menuPlus.liste.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) menuPlus.fermer()
  })

  zoneDroite.append(groupeTexte, presenceContainer, groupeForme, menuPlus.el)

  // 4. Moi. À l'extrême droite, séparée des pastilles de présence par toute
  // la largeur du bandeau : les deux sont des ronds colorés, et les
  // confondre serait fâcheux.
  // Le voyant d'état ferme la rangée, juste avant la pastille du compte
  // (18/09) : l'état de l'enregistrement se range avec ce qui parle de la
  // session, pas avec le nom du document.
  const voyant = creerVoyantConnexion()
  // L'état de l'enregistrement, en un mot à côté du titre (vue V1).
  zoneGauche.appendChild(voyant.el)

  const menuCompte = monterMenuCompte(zoneDroite, {
    couleur: () => user.color,
    // Un nom changé en cours de route : les autres le voient tout de suite
    // (présence, curseur), et les modifications à venir le portent. L'état
    // de présence reçoit un **nouvel objet** — muter l'ancien ne dirait rien
    // aux autres, y-protocols compare les valeurs.
    surNom: (nom) => {
      provider.awareness.setLocalStateField('user', { ...user, name: nom })
      user.name = nom
    },
    // Même geste pour la couleur (13/10/2026) : présence et curseur tout de
    // suite, modifications à venir dans la nouvelle couleur.
    surCouleur: (couleur) => {
      provider.awareness.setLocalStateField('user', { ...user, color: couleur })
      user.color = couleur
    },
  })

  chargerPublication()

  /** Écrire un commentaire sur la sélection, en feuille (composeurTactile.js). */
  const ouvrirComposeur = () => ouvrirComposeurTactile({ view, ydoc, commentsMap, user })

  const layout = document.createElement('div')
  layout.className = 'editor-layout'

  const main = document.createElement('div')
  main.className = 'editor-main'
  // Le repère « contenu principal » des lecteurs d'écran (passage axe, lot L4).
  main.setAttribute('role', 'main')
  main.setAttribute('aria-label', 'Document')

  // Formatting palette only — stays in the middle (text) column, above the
  // scrolling editor-container (so it never scrolls away), rather than
  // spanning the full page width like the banner above.
  const {
    toolbar,
    headingSelect,
    groupeTexte2,
    groupeInserer,
    groupeRelire,
    onglets,
    tableGroup,
    boutons: {
      undoBtn,
      redoBtn,
      boldBtn,
      italicBtn,
      underlineBtn,
      strikeBtn,
      listBtn,
      orderedListBtn,
      taskListBtn,
      quoteBtn,
      ligneBtn,
      sautBtn,
      tocBtn,
      noteBtn,
      lienBtn,
      tableBtn,
      imageBtn,
      rowAddBtn,
      rowDelBtn,
      colAddBtn,
      colDelBtn,
      tableDelBtn,
    },
  } = creerBarreOutils({ cap, menuDeroulant })

  // La relecture au doigt : un parcours, pas une liste (20/09/2026). La
  // liste des modifications reste dans la colonne de droite, qui n'existe
  // pas sur téléphone ; cette barre la remplace là où il n'y a pas la place.
  const relecture = monterBarreRelecture(() => view, {
    canReview: !!cap.canReviewChanges,
  })
  // La carte de la modification courante, dans la gouttière (lot L2) : elle
  // reçoit la barre de relecture quand la gouttière est là (format L).
  const carteModif = monterCarteModification({ getView: () => view, relecture })
  // Sur ordinateur la barre de relecture vit dans la colonne de droite,
  // sous le suivi (`placerLeSuivi`) ; sur téléphone elle est ici, dans
  // l'onglet « Relire ».
  groupeRelire.appendChild(relecture.el)

  // Et la porte vers les commentaires : le fil du passage où est le
  // curseur, ou rien à ouvrir si l'on n'est pas dans un passage commenté.
  let composeurMarge = null // le plugin de la marge, posé avec les greffons
  const filBtn = document.createElement('button')
  filBtn.type = 'button'
  filBtn.className = 'btn-tool btn-texte btn-commenter'
  filBtn.innerHTML = `${svgIcone('bulle', 16)}<span>Commenter</span>`
  filBtn.title = 'Commenter le passage sélectionné — ou ouvrir le fil du passage où se trouve le curseur'
  filBtn.onclick = () => {
    // Un passage sélectionné : on le commente, comme avec le « ＋ » de la
    // marge (le bouton s'appelle « Commenter », il doit en créer un).
    // Sinon, le curseur dans un passage déjà commenté : on ouvre son fil.
    if (!view.state.selection.empty && cap.canComment !== false) {
      if (petitEcran()) ouvrirComposeur()
      else if (composeurMarge && composeurMarge.ouvrirSurLaSelection()) return
      else messageFugace('Impossible de commenter ce passage.')
      return
    }
    const id = commentaireAuPoint(view.state, ydoc, commentsMap, view.state.selection.head)
    if (id) ouvrirFilCommentaire(view, ydoc, commentsMap, user, id)
    else messageFugace('Sélectionnez un passage pour le commenter, ou placez le curseur dans un passage déjà commenté.')
  }
  groupeRelire.appendChild(filBtn)

  toolbar.append(groupeTexte2, groupeInserer, groupeRelire, onglets)
  main.appendChild(toolbar)

  const editorContainer = document.createElement('div')
  editorContainer.className = 'editor-container'
  // Zone de défilement : atteignable au clavier (flèches, Page ↓), y compris en lecture seule.
  editorContainer.tabIndex = 0
  main.appendChild(editorContainer)

  // Gouttière des commentaires : créée ici pour que les greffons la
  // reçoivent, mais attachée seulement après la construction de la vue —
  // ProseMirror ajoute son propre élément au conteneur, et l'ordre décide
  // de quel côté se trouve la gouttière.
  const commentsGutter = document.createElement('div')
  commentsGutter.className = 'marge-commentaires'

  // Facteur d'agrandissement (50/100/150%) : un confort de lecture propre à
  // chaque personne/navigateur, donc mémorisé dans le localStorage (même
  // principe que le nom/couleur dans user.js) plutôt que synchronisé via
  // Yjs — ça n'a rien d'un réglage du document. Ni `zoom` ni
  // `transform: scale()` (23/09/2026) : une **échelle de corps**, posée en
  // variable CSS et appliquée à la taille du texte. Les deux autres créent
  // un second système de coordonnées, et ProseMirror mêle des pixels
  // visuels (`getBoundingClientRect`) et des pixels de défilement
  // (`scrollTop`) — à 150 % l'écart d'un facteur et demi faisait passer la
  // ligne en cours de frappe sous le clavier. Une échelle de corps suffit
  // à tout agrandir : la colonne se mesure en `ch` et les images en
  // pourcentage de la colonne, elles suivent donc le corps.
  const { zoomSelect, numerosBtn } = monterReglagesAffichage(editorContainer, mkButton)
  // L'affichage (13/10/2026) : une zone à part, tout à droite de la barre.
  // Elle vit dans le groupe « Relire » : sur téléphone le zoom part dans le
  // menu ⋯ (iphone.js) et les numéros de bloc — le repère pour dire « relis
  // le bloc 42 » — restent dans l'onglet de la relecture.
  const zoneAffichage = document.createElement('span')
  zoneAffichage.className = 'zone-affichage'
  zoneAffichage.append(numerosBtn, zoomSelect)
  groupeRelire.appendChild(zoneAffichage)

  const {
    sidebar,
    suiviEntete,
    zoneRelecture,
    aiSection,
    changesSection,
    commentsSection,
    panneauModifications,
    panneauMargo,
  } = creerColonneDroite(trackToggleLabel)

  // L'interrupteur du suivi change de place avec la largeur (20/09/2026),
  // et **une seule fois pour toutes** : il est déménagé, jamais dupliqué.
  // Deux cases à cocher pour un même état, ce serait deux états à tenir
  // d'accord, et un jour l'une affichant le contraire de l'autre. Sur
  // téléphone la colonne de droite n'existe plus, et cet interrupteur est
  // précisément ce qu'on ne peut pas se permettre de perdre : c'est lui qui
  // dit si ce qu'on tape est une proposition ou une modification directe.
  const petitEcranMedia = media(REQUETE_PETIT_ECRAN)
  // La gouttière n'existe qu'à partir de 1 280 px (style.css) : en dessous, le
  // parcours des modifications reste en tête du volet Modifications.
  const gouttiereMedia = media('(min-width: 1280px)')
  // Elle peut aussi se replier plus haut, quand les volets ouverts ne laissent
  // plus assez de place au texte (`disposer`, lot L4) : le repli est écrit dans
  // `layout.dataset.gouttiere`.
  const gouttiereActive = () => gouttiereMedia.matches && layout.dataset.gouttiere !== 'non'
  function placerLeSuivi() {
    // Sur téléphone, l'interrupteur vit dans le menu ⋯ (iphone.js) et c'est
    // ce menu qui va le chercher ; la barre de relecture, elle, rejoint
    // l'onglet « Relire ». Sur ordinateur et tablette, l'interrupteur est au
    // **bout de la barre d'édition** (décision D1 du 21/10/2026 ; il était
    // fixe dans la colonne de droite depuis le 14/10), et le parcours des
    // modifications reste fixe en tête de l'onglet Modifications.
    if (petitEcranMedia.matches) {
      // Le parcours rejoint le bandeau de relecture, sous la rangée d'outils
      // (iphone.js, vue V4) : le téléphone prend le nœud au montage.
    } else {
      toolbar.appendChild(suiviEntete)
      suiviEntete.appendChild(trackToggleLabel)
      // Format L : le parcours vit dans la carte de la modification courante,
      // contre le texte (lot L2) ; sinon en tête du volet Modifications.
      if (gouttiereActive()) carteModif.pied.appendChild(relecture.el)
      else zoneRelecture.appendChild(relecture.el)
    }
  }
  placerLeSuivi()

  const { outlineSidebar, outlineSection } = creerColonnePlan()

  // La rangée fixe sous le bandeau (lot L1, 21/10/2026, revu le jour même) :
  // au bord gauche le bouton du plan, un trait, la barre d'édition — alignée
  // sur le bord gauche du texte —, un trait, et au bord droit les boutons
  // Modifications et Margo. Ouvrir ou fermer un volet n'y change rien.
  // Sur téléphone, la barre reste au bas de la colonne (voir placerLaBarre).
  const rangee = document.createElement('div')
  rangee.className = 'rangee-edition'
  // Les repères de la page pour les lecteurs d'écran (passage axe, lot L4).
  rangee.setAttribute('role', 'region')
  rangee.setAttribute('aria-label', 'Plan, édition et panneaux')
  topBanner.setAttribute('role', 'banner')
  const boutonsGauche = document.createElement('div')
  boutonsGauche.className = 'rangee-boutons rangee-gauche'
  const boutonsDroite = document.createElement('div')
  boutonsDroite.className = 'rangee-boutons rangee-droite'
  rangee.append(boutonsGauche, boutonsDroite)

  /** La barre d'édition change de place avec la largeur, comme l'interrupteur
   * du suivi : déménagée, jamais dupliquée. Dans la rangée fixe sur ordinateur
   * et tablette ; en tête de la colonne du texte sur téléphone, où iphone.js
   * la prend en charge. */
  function placerLaBarre() {
    if (petitEcranMedia.matches) {
      if (toolbar.parentNode === rangee) main.prepend(toolbar)
      toolbar.style.paddingLeft = ''
      // Sur téléphone, l'affichage (numéros de bloc, zoom) reste dans l'onglet Relire.
      if (zoneAffichage.parentNode !== groupeRelire) groupeRelire.appendChild(zoneAffichage)
    } else {
      if (toolbar.parentNode !== rangee) rangee.insertBefore(toolbar, boutonsDroite)
      // Ailleurs, il rejoint le menu ⋯ du bandeau : la barre d'édition ne garde
      // que ce qui sert à écrire (vue V1).
      if (zoneAffichage.parentNode !== menuPlus.liste) menuPlus.liste.appendChild(zoneAffichage)
    }
  }
  placerLaBarre()

  let disposer = () => {} // défini plus bas, une fois la vue construite
  // Format M, sous 1 100 px (lot M2) : les volets sont des tiroirs, par-dessus
  // le texte, un seul à la fois ; ils démarrent fermés et ne sont pas retenus
  // d'une visite à l'autre (une habitude d'écran large ne s'applique pas ici).
  const tiroirMedia = media('(min-width: 701px) and (max-width: 1100px)')
  let fermerLeDroit = () => {}
  const voletGauche = monterVolet({
    colonne: outlineSidebar,
    hoteBoutons: boutonsGauche,
    panneaux: [{ id: 'plan', libelle: 'Plan du document', court: 'Plan', icone: 'plan', panneau: outlineSection }],
    cleMemoire: 'amend.volet.gauche',
    defaut: 'plan',
    fermerAuDepart: () => tiroirMedia.matches,
    memoriser: () => !tiroirMedia.matches,
    surChangement: (etat) => {
      if (etat !== 'ferme' && tiroirMedia.matches) fermerLeDroit()
      disposer()
    },
  })
  const voletPlan = { ouvert: () => !outlineSidebar.classList.contains('volet-ferme') }
  let dialogue = null
  // Ce que la personne peut demander à l'IA (connu quand le serveur a répondu,
  // plus bas) : la bulle de sélection n'offre que ce qui marchera.
  let iaOuverte = false
  let margoOuvert = false
  // Le nombre de modifications en attente, à côté du mot « Modifications »
  // quand le volet est ouvert : le même que celui du bandeau, recopié.
  const compteOnglet = document.createElement('span')
  compteOnglet.className = 'volet-compte'
  const recopierCompte = () => {
    compteOnglet.textContent = (modifsCount.textContent.match(/\d+/) || [''])[0]
  }
  if (typeof MutationObserver !== 'undefined') {
    const veille = new MutationObserver(recopierCompte)
    veille.observe(modifsCount, { childList: true, characterData: true, subtree: true })
    ecouteursGlobaux.push(() => veille.disconnect())
  }
  const voletDroit = monterVolet({
    colonne: sidebar,
    hoteBoutons: boutonsDroite,
    panneaux: [
      {
        id: 'modifications',
        libelle: 'Modifications',
        icone: 'coche',
        panneau: panneauModifications,
        compte: compteOnglet,
      },
      { id: 'margo', libelle: 'Margo (IA)', court: 'Margo', icone: 'etincelle', panneau: panneauMargo },
    ],
    cleMemoire: 'amend.volet.droit',
    defaut: 'modifications',
    fermerAuDepart: () => tiroirMedia.matches,
    memoriser: () => !tiroirMedia.matches,
    // Ouvrir Margo, c'est vouloir lui écrire : le curseur va dans la saisie.
    // (Au chargement, `dialogue` n'existe pas encore : rien ne prend le focus
    // à l'éditeur.)
    surChangement: (etat) => {
      if (etat !== 'ferme' && tiroirMedia.matches) voletGauche.fermer()
      if (etat === 'margo' && dialogue) dialogue.ouvrir()
      disposer()
    },
  })
  fermerLeDroit = () => voletDroit.fermer()

  // Volets ouverts (vue V1) : au-dessus de chaque volet, ses onglets, puis le
  // bouton qui le replie ; « Fichiers » est annoncé, pas encore actif. Ces
  // éléments n'existent que volet ouvert (style.css, `.ouvert`).
  const extra = (el) => {
    el.classList.add('volet-extra')
    return el
  }
  const espace = () => {
    const e = extra(document.createElement('span'))
    e.classList.add('volet-espace')
    return e
  }
  const boutonReplier = (nomIcone, titre, action) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'volet-replier'
    b.title = titre
    b.setAttribute('aria-label', titre)
    b.innerHTML = svgIcone(nomIcone, 16)
    b.addEventListener('click', action)
    return extra(b)
  }
  const fichiers = document.createElement('button')
  fichiers.type = 'button'
  fichiers.className = 'volet-bouton'
  fichiers.disabled = true
  fichiers.title = 'Fichiers — bientôt'
  fichiers.innerHTML = `${svgIcone('dossier', 18)}<span class="volet-libelle">Fichiers</span>`
  boutonsGauche.append(
    extra(fichiers),
    espace(),
    boutonReplier('gauche', 'Replier le plan', () => voletGauche.fermer())
  )
  boutonsDroite.append(
    espace(),
    boutonReplier('droite', 'Replier le volet', () => voletDroit.fermer())
  )

  layout.append(outlineSidebar, main, sidebar)
  shell.append(topBanner, rangee, layout)
  // Le lien d'évitement (21/10/2026) : premier arrêt de tabulation, invisible
  // tant qu'il n'a pas le focus. Avec les volets ouverts, le plan seul compte
  // des dizaines d'arrêts avant le texte ; celui-ci y mène en une touche.
  const evitement = document.createElement('button')
  evitement.type = 'button'
  evitement.className = 'lien-evitement'
  evitement.textContent = 'Aller au texte'
  evitement.onclick = () => {
    if (view && view.editable) view.focus()
    else editorContainer.focus()
  }
  shell.prepend(evitement)
  root.appendChild(shell)

  // La feuille de style ("Mise en page", voir stylePanel.js/styleConfig.js)
  // ne se reflète plus du tout dans l'éditeur (retiré le 13/09/2026, sur
  // demande) : l'éditeur garde sa propre typographie fixe (police système,
  // voir style.css), pensée pour rester aussi lisible que possible quels
  // que soient les réglages choisis — seul l'export PDF applique
  // vraiment la feuille de style (voir exportPdfBtn plus bas).

  // --- Yjs + collaboration wiring ---
  const ydoc = new Y.Doc()
  const provider = new SimpleProvider(ydoc, docId, user)
  const yXml = ydoc.getXmlFragment(NOM_TEXTE)
  // Commentaires ancrés (évolution 4.2.4) : un type Yjs séparé du texte,
  // synchronisé/persisté par la même plomberie sans rien changer au
  // contenu ni aux exports — voir comments.js.
  const commentsMap = ydoc.getMap(NOM_COMMENTAIRES)

  voyant.lier(provider)

  // Le serveur compacte lui-même depuis sa réplique (29/09/2026) : plus
  // rien à faire ici. Ce qu'il peut nous dire, en revanche, c'est qu'il a
  // **refusé** une opération — l'état local diverge, on recharge.
  provider.addEventListener('refuse', (e) => {
    messageFugace(`Modification refusée par le serveur : ${e.detail.raison}. Rechargement…`, { erreur: true })
    setTimeout(() => location.reload(), 1500)
  })

  // Live title sync between rédacteurs (correctif 4.1.1) — never overwrite
  // what the local person is actively typing themselves.
  provider.addEventListener('title', (e) => {
    if (document.activeElement !== titleInput) {
      titleInput.value = e.detail.title
      titleInput.dispatchEvent(new Event('change'))
    }
  })

  const presence = mountPresenceBar(presenceContainer, provider, {
    // `view` n'existe pas encore ici : la barre la demandera au moment du
    // clic, pas avant.
    getView: () => view,
    ydoc,
    type: yXml,
    surAbsence: (message) => messageFugace(message),
  })

  // Rempli plus bas, une fois la vue et les contrôles construits : ce
  // greffon n'existe que pour donner à la barre d'outils un point
  // d'accroche sur chaque changement d'état (sélection comprise).
  let syncToolbar = () => {}

  const state = EditorState.create({
    schema,
    plugins: [
      ySyncPlugin(yXml),
      yCursorPlugin(provider.awareness, { cursorBuilder: buildCursor }),
      yUndoPlugin(),
      // Tout le monde arrive suivi **activé** (Sylvain, 29/09/2026) : un
      // éditeur qui veut écrire sans trace le coupe lui-même, ce qui vaut
      // mieux qu'une modification directe faite par mégarde sur le texte
      // d'un autre. Du 15 au 29/09, l'éditeur arrivait suivi désactivé. Le
      // correcteur, lui, ne peut pas le couper (voir plus bas).
      trackChangesPlugin({ enabled: true }),
      selectionHighlightPlugin(),
      tableOfContentsPlugin(),
      // Avant richPastePlugin : une capture d'écran collée est une image,
      // pas un collage de texte (voir images.js).
      // `peutInserer` suit le serveur, qui réserve le dépôt du fichier à
      // canManageDocument ; supprimer une image, elle, est suivi (29/09).
      imagesPlugin({ docId, peutInserer: !!cap.canManageDocument, getUser: () => user }),
      liensPlugin({ peutPoser: peutPoserLien, surRefus: refuserLien }),
      richPastePlugin(() => user),
      pendingBreakPlugin(),
      // Un lecteur dessine les commentaires mais n’écrit rien : le serveur
      // refuserait ses marques d’orphelins et ses réancrages.
      commentsPlugin(ydoc, commentsMap, { peutEcrire: () => peutProposer }),
      // Le tactile (20/09/2026) : toucher un passage commenté ouvre son fil
      // en feuille, et la barre de relecture se tient à jour. Ce greffon
      // n'existe que pour le petit écran — au-dessus de 700 px, la marge et
      // la colonne de droite font tout cela mieux, et il ne fait rien.
      tactilePlugin({
        ydoc,
        commentsMap,
        user,
        surMiseAJour: () => {
          relecture.rendre()
          commenter.placer()
        },
      }),
      footnotesPlugin(() => user, { surChangement: (v) => listeNotes && listeNotes.rafraichir(v) }),
      // La bulle de sélection (lot L3) : Corriger, Réduire, Clarifier,
      // Demander à Margo, Commenter. Hors téléphone, qui a son propre bouton.
      mountBulleSelection(editorContainer, {
        active: () => !petitEcranMedia.matches,
        auDoigt: () => media('(pointer: coarse)').matches,
        actions: [
          ...[
            ['corriger', 'Corriger', 'corriger'],
            ['raccourcir', 'Réduire', 'reduire'],
            ['clarifier', 'Clarifier', 'clarifier'],
          ].map(([cle, libelle, id]) => ({
            cle: id,
            libelle,
            ia: true,
            visible: () => iaOuverte,
            executer: async () => {
              const message = await correctionsIA.lancer(cle)
              if (message) messageFugace(message, { erreur: !/^Suggestion ajoutée/.test(message) })
            },
          })),
          {
            cle: 'margo',
            libelle: 'Demander à Margo',
            icone: 'etincelle',
            ia: true,
            visible: () => margoOuvert,
            executer: () => voletDroit.ouvrir('margo'),
          },
          {
            cle: 'commenter',
            libelle: 'Commenter',
            icone: 'bulle',
            visible: () => cap.canComment !== false,
            executer: () => {
              if (!petitEcran() && composeurMarge && composeurMarge.ouvrirSurLaSelection()) return
              ouvrirComposeur()
            },
          },
        ],
      }),
      mountCommentsGutter(commentsGutter, ydoc, commentsMap, user, {
        carteCourante: {
          el: carteModif.carte,
          ancre: () => (gouttiereActive() && !petitEcranMedia.matches ? carteModif.remplir() : null),
        },
      }),
      (composeurMarge = mountGutterComposer(commentsGutter, ydoc, commentsMap, user)),
      mountChangesPanel(changesSection, { canReview: !!cap.canReviewChanges }),
      mountOutlinePanel(outlineSection),
      mountWordCount(wordCount),
      mountCompteursRelecture(
        {
          modifications: peutProposer || cap.canReviewChanges ? modifsCount : null,
          commentaires: commentsCount,
        },
        { ydoc, commentsMap }
      ),
      raccourcisClavier({ user, peutPoserLien, surRefusLien: refuserLien }),
      keymap(baseKeymap),
      tableEditing(),
      // Deux personnes qui modifient la structure d'un même tableau en même
      // temps peuvent produire, après fusion CRDT, un tableau bancal (lignes
      // de largeurs différentes). fixTables le répare dès qu'il apparaît —
      // c'est le remède prévu par prosemirror-tables, et il est ici hors
      // suivi des modifications : c'est une réparation, pas une édition.
      new Plugin({
        appendTransaction(_trs, _ancien, nouveau) {
          const correction = fixTables(nouveau)
          return correction ? correction.setMeta('trackChangesInternal', true) : undefined
        },
      }),
      markdownShortcutsPlugin(schema),
      // Apostrophes, guillemets, points de suspension et espaces insécables,
      // à la frappe et au collage (shared/typographie.js). Sans interface.
      typographiePlugin({ suiviActif: isTrackChangesEnabled }),
      taskListPlugin(schema),
      new Plugin({
        view: () => ({ update: () => syncToolbar() }),
      }),
      dropCursor(),
      gapCursor(),
    ],
  })

  const view = new EditorView(editorContainer, {
    state,
    // Un lecteur (28/09/2026) ne touche pas au texte : la vue n'est pas
    // modifiable. Il sélectionne, et commente — la gouttière ne passe pas
    // par l'édition. Tenu par l'interface, comme le suivi du correcteur.
    editable: () => peutProposer,
  })
  editorContainer.appendChild(commentsGutter)

  // La disposition des volets (interface/disposition.js) : un volet ouvert se
  // pose dans la marge, sans bouger le texte, quand il y tient ; sinon il
  // pousse le texte plutôt que de le cacher. Puis la barre d'édition s'aligne
  // sur le bord gauche du texte. Rejoué quand la fenêtre, la colonne ou la
  // gouttière changent de taille (zoom, commentaires qui apparaissent).
  const LARGEUR_PLAN = 220
  const LARGEUR_DROITE = 320
  const BANDE_BARRE_FLOTTANTE = 14
  // La gouttière peuplée : 260 px de cartes + 20 de marge ; vide, elle ne garde
  // que la place du ＋ (36 + 8). Les mêmes valeurs que style.css.
  const GOUTTIERE_PEUPLEE = 280
  const GOUTTIERE_VIDE = 44
  const LARGEUR_TIROIR_PLAN = 260
  const aligner = () => {
    if (petitEcranMedia.matches || toolbar.parentNode !== rangee) return
    const bord = view.dom.getBoundingClientRect().left + (parseFloat(getComputedStyle(view.dom).paddingLeft) || 0)
    toolbar.style.paddingLeft = `${decalageBarre({ gaucheBarre: toolbar.getBoundingClientRect().left, bordTexte: bord })}px`
  }
  disposer = () => {
    if (petitEcranMedia.matches) {
      delete outlineSidebar.dataset.mode
      delete sidebar.dataset.mode
      delete outlineSidebar.dataset.tiroir
      delete sidebar.dataset.tiroir
      delete layout.dataset.gouttiere
      outlineSidebar.style.width = ''
      sidebar.style.width = ''
      sidebar.style.right = ''
      boutonsGauche.style.width = ''
      boutonsDroite.style.width = ''
      boutonsDroite.style.marginRight = ''
      editorContainer.style.paddingLeft = ''
      editorContainer.style.paddingRight = ''
      return
    }
    // La place, déduction faite d'une barre de défilement classique : les
    // volets de droite se posent à sa gauche, jamais par-dessus.
    const barre = editorContainer.offsetWidth - editorContainer.clientWidth
    const largeur = layout.clientWidth - barre
    // Barre de défilement « flottante » (macOS par défaut, tablettes) : elle ne
    // prend pas de place, donc le volet de droite la recouvrait. On lui garde
    // une bande à droite du volet, pour qu'elle reste visible et saisissable.
    const bande = barre === 0 && voletDroit.ouvert() ? BANDE_BARRE_FLOTTANTE : 0
    const tiroir = tiroirMedia.matches
    if (largeur <= 0) return
    const st = getComputedStyle(view.dom)
    // La colonne à sa largeur naturelle (78 ch), marges intérieures comprises.
    const pleine = parseFloat(st.maxWidth)
    const interieur =
      st.boxSizing === 'border-box' ? 0 : (parseFloat(st.paddingLeft) || 0) + (parseFloat(st.paddingRight) || 0)
    const texte = Number.isFinite(pleine) ? pleine + interieur : view.dom.offsetWidth
    const affichee = getComputedStyle(commentsGutter).display !== 'none'
    const peuplee = commentsGutter.classList.contains('peuplee')
    const modes = calculerDisposition({
      largeur,
      texte,
      gouttiere: affichee
        ? commentsGutter.offsetWidth + (parseFloat(getComputedStyle(commentsGutter).marginLeft) || 0)
        : peuplee
          ? GOUTTIERE_PEUPLEE
          : GOUTTIERE_VIDE,
      gouttiereMax: gouttiereMedia.matches ? GOUTTIERE_PEUPLEE : 0,
      gauche: { ouvert: voletPlan.ouvert(), largeur: tiroir ? LARGEUR_TIROIR_PLAN : LARGEUR_PLAN, minimum: 200 },
      droite: { ouvert: voletDroit.ouvert(), largeur: LARGEUR_DROITE + bande, minimum: 280 + bande },
      tiroirs: tiroir,
    })
    // La gouttière se replie quand la colonne de texte n'aurait plus la
    // place : ses commentaires passent dans le volet Modifications, et le
    // parcours des modifications dans sa tête (placerLeSuivi).
    const gouttiereAvant = layout.dataset.gouttiere
    layout.dataset.gouttiere = modes.gouttiere ? 'oui' : 'non'
    if (gouttiereAvant !== layout.dataset.gouttiere) {
      placerLeSuivi()
      // La gouttière qui reparaît a perdu ses mesures : elle se remet en page
      // sur l'événement qu'elle écoute déjà (celui d'un changement de taille).
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    }
    outlineSidebar.dataset.mode = modes.gauche
    sidebar.dataset.mode = modes.droite
    // Un tiroir a son ombre (style.css) et ne change pas la rangée du dessus.
    outlineSidebar.dataset.tiroir = tiroir ? 'oui' : 'non'
    sidebar.dataset.tiroir = tiroir ? 'oui' : 'non'
    outlineSidebar.style.width = modes.gauche === 'superpose' ? `${modes.largeurGauche}px` : ''
    sidebar.style.width = modes.droite === 'superpose' ? `${modes.largeurDroite - bande}px` : ''
    sidebar.style.right = barre || bande ? `${barre || bande}px` : ''
    editorContainer.style.paddingLeft = modes.margeGauche ? `${modes.margeGauche}px` : ''
    editorContainer.style.paddingRight = modes.margeDroite ? `${modes.margeDroite}px` : ''
    // Volet ouvert : le segment de la rangée prend exactement sa largeur, pour
    // que le trait de la rangée prolonge celui du volet (vue V1).
    const gOuvert = !tiroir && modes.gauche !== 'ferme'
    const dOuvert = !tiroir && modes.droite !== 'ferme'
    boutonsGauche.classList.toggle('ouvert', gOuvert)
    boutonsDroite.classList.toggle('ouvert', dOuvert)
    boutonsGauche.style.width = gOuvert ? `${outlineSidebar.offsetWidth}px` : ''
    boutonsDroite.style.width = dOuvert ? `${sidebar.offsetWidth}px` : ''
    boutonsDroite.style.marginRight = dOuvert && (barre || bande) ? `${barre || bande}px` : ''
    aligner()
  }
  let dispositionPrevue = 0
  const prevoirDisposition = () => {
    if (dispositionPrevue) return
    dispositionPrevue = requestAnimationFrame(() => {
      dispositionPrevue = 0
      disposer()
    })
  }
  if (typeof ResizeObserver !== 'undefined') {
    const observateur = new ResizeObserver(prevoirDisposition)
    for (const el of [layout, view.dom, commentsGutter, boutonsGauche, editorContainer]) observateur.observe(el)
    ecouteursGlobaux.push(() => observateur.disconnect())
  }
  disposer()

  // Les tiroirs du format M (lot M2) : on les ferme en touchant le texte, avec
  // Échap, ou en choisissant un titre du plan ; jamais deux à la fois.
  // Lecteur : le texte n'est pas éditable, le focus revient alors à la zone de défilement.
  const rendreLeFocusAuTexte = () => {
    if (!view || view.isDestroyed) return
    if (view.dom.isContentEditable) view.focus()
    else editorContainer.focus()
  }
  const fermerLesTiroirs = () => {
    if (!tiroirMedia.matches) return false
    const avait = voletGauche.ouvert() || voletDroit.ouvert()
    voletGauche.fermer()
    voletDroit.fermer()
    return avait
  }
  editorContainer.addEventListener('pointerdown', fermerLesTiroirs)
  ecouteursGlobaux.push(() => editorContainer.removeEventListener('pointerdown', fermerLesTiroirs))
  const echapTiroir = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (fermerLesTiroirs()) {
      e.preventDefault()
      rendreLeFocusAuTexte()
    }
  }
  document.addEventListener('keydown', echapTiroir)
  ecouteursGlobaux.push(() => document.removeEventListener('keydown', echapTiroir))
  const titreChoisi = (e) => {
    if (e.target.closest('.outline-link') && tiroirMedia.matches) voletGauche.fermer()
  }
  outlineSidebar.addEventListener('click', titreChoisi)
  ecouteursGlobaux.push(() => outlineSidebar.removeEventListener('click', titreChoisi))
  // Le format M n'a pas de gouttière (lot M3, D4) : toucher un passage commenté
  // en ouvre le fil dans une feuille, sans quitter le passage des yeux.
  const toucherCommentaire = (e) => {
    if (petitEcranMedia.matches || gouttiereActive()) return
    if (!(e.target instanceof Element) || !e.target.closest('.comment-highlight')) return
    // Le clic arrive avant que la sélection ne soit relue : on interroge le point touché.
    if (!window.getSelection().isCollapsed) return
    const point = view.posAtCoords({ left: e.clientX, top: e.clientY })
    if (!point) return
    const id = commentaireAuPoint(view.state, ydoc, commentsMap, point.pos)
    if (id) ouvrirFilCommentaire(view, ydoc, commentsMap, user, id)
  }
  view.dom.addEventListener('click', toucherCommentaire)
  ecouteursGlobaux.push(() => view.dom.removeEventListener('click', toucherCommentaire))
  // Un écran qui devient assez étroit pour des tiroirs : s'il y en a deux
  // ouverts, le plan s'efface devant le panneau de droite.
  const surTiroir = () => {
    if (tiroirMedia.matches && voletGauche.ouvert() && voletDroit.ouvert()) voletGauche.fermer()
    disposer()
  }
  if (tiroirMedia.addEventListener) {
    tiroirMedia.addEventListener('change', surTiroir)
    ecouteursGlobaux.push(() => tiroirMedia.removeEventListener('change', surTiroir))
  }
  // La liste des notes (28/09/2026) : une barre repliée au pied de la
  // colonne de texte, rafraîchie par footnotesPlugin.
  const listeNotes = monterListeDesNotes(main, () => view)
  listeNotes.rafraichir(view)

  // Le masque de chargement (23/09/2026) : voir masqueChargement.js.
  monterMasqueChargement(editorContainer, provider)

  // Le bouton « Commenter » qui suit la sélection, sur petit écran
  // seulement : il remplace le « + » de la marge, qui n'a plus de marge où
  // vivre. Posé **au-dessus** de la sélection — en dessous, il tomberait
  // sous le pouce qui vient de sélectionner, et sous la barre de
  // suggestions du clavier.
  const commenter = monterBoutonCommenter(editorContainer, () => view, ouvrirComposeur)
  // dispatchTransaction needs a reference to `view` itself, so it's wired
  // up right after construction rather than passed in the initial props.
  view.setProps({
    dispatchTransaction: makeDispatchTransaction(view, () => user, {
      peutModifierLibrement: () => !!cap.canEditFreely,
      surRefus: () =>
        messageFugace('Cette modification ne peut pas être suivie : elle est réservée aux éditeurs.', { erreur: true }),
    }),
  })

  // Un correcteur reste toujours en suivi de modifications — ne peut ni
  // désactiver le suivi, ni en sortir (voir
  // claude/conception-gestion-utilisateurs.md, projet Amend). Appliqué ici
  // seulement côté interface : le serveur ne vérifie pas encore le contenu
  // des modifications, limite connue et acceptée pour cette première
  // version.
  // Lu par la palette de contact pour joindre le rôle au signalement
  // (contact.js) — une même page ne se comporte pas pareil selon le rôle,
  // et c'est la première chose qu'on demanderait sinon.
  const roleCourant = docMeta.myRole || null
  poserRoleDeLaPage(roleCourant)
  // « Correcteur » ici veut dire : ne modifie qu'en suivi, ou pas du tout.
  const isCorrecteur = !cap.canEditFreely
  // Mise en page et exports réservés aux éditeurs (16/09/2026). Pour la
  // mise en page, le serveur vérifie `canManageDocument` et la restriction
  // est donc réelle. Pour les exports, elle ne l'est pas : les trois sont
  // fabriqués dans le navigateur à partir du document que la personne a
  // déjà sous les yeux — c'est une **convention** qui dit qui produit le
  // livrable, pas une protection. Elle deviendra réelle pour le PDF le jour
  // où il sortira d'une route serveur (chantier Typst).
  if (isCorrecteur) {
    menuPartage.el.hidden = true
    menuExport.el.hidden = true
    // Poser une table des matières, c'est décider de la structure du
    // document — même raisonnement que pour les tableaux.
    tocBtn.hidden = true
  }
  if (isCorrecteur) {
    trackToggle.disabled = true
    trackToggleLabel.title = 'Les correcteurs proposent toujours leurs modifications en suivi de modifications.'
    if (!isTrackChangesEnabled(view.state)) setTrackChangesEnabled(view, true)
  }
  if (!peutProposer) {
    // Lecteur : ni suivi (rien à suivre), ni barre de mise en forme.
    trackToggleLabel.hidden = true
    suiviEntete.hidden = true
    toolbar.hidden = true
  }

  trackToggle.addEventListener('change', () => {
    if (isCorrecteur) {
      trackToggle.checked = true
      return
    }
    setTrackChangesEnabled(view, trackToggle.checked)
  })
  // Keep the checkbox in sync if the plugin state ever changes elsewhere.
  // La classe porte l'état jusqu'à l'en-tête, qui change franchement de
  // couleur : on doit savoir dans quel mode on écrit sans avoir à chercher
  // une coche.
  const syncToggle = () => {
    const actif = isCorrecteur ? true : isTrackChangesEnabled(view.state)
    trackToggle.checked = actif
    suiviEntete.classList.toggle('actif', actif)
    trackToggleLabel.classList.toggle('actif', actif)
  }

  // Le menu de style reflète ce qui est sous le curseur (15/09/2026) — il
  // affichait jusqu'ici la dernière valeur choisie, ce qui mentait dès qu'on
  // déplaçait le curseur dans un titre.
  const syncHeadingSelect = () => {
    const valeur = styleDeBlocCommun(view.state)
    if (valeur === null) headingSelect.selectedIndex = -1
    else headingSelect.value = valeur
  }

  // Un correcteur ne touche pas à la structure d'un tableau (étude du
  // 15/09) : les boutons disparaissent au lieu d'être présents et refusés.
  const syncTableButtons = () => {
    if (isCorrecteur) {
      tableBtn.hidden = true
      tableGroup.hidden = true
      return
    }
    tableGroup.hidden = !isInTable(view.state)
  }

  // La citation est un style : le bouton reste enfoncé tant que le curseur est dedans.
  const syncCitation = () => {
    const dedans = hasAncestorOfType(view.state, schema.nodes.blockquote)
    quoteBtn.classList.toggle('actif', dedans)
    quoteBtn.setAttribute('aria-pressed', String(dedans))
  }

  syncToolbar = () => {
    syncCitation()
    syncToggle()
    syncHeadingSelect()
    syncTableButtons()
  }
  syncToolbar()

  // Annuler / rétablir : l'historique propre à cette personne (y-prosemirror
  // ne défait que ses gestes), le même que Ctrl-Z / Ctrl-Y.
  undoBtn.onclick = () => {
    undo(view.state)
    view.focus()
  }
  redoBtn.onclick = () => {
    redo(view.state)
    view.focus()
  }
  boldBtn.onclick = () => basculerMarque(view, 'strong')
  italicBtn.onclick = () => basculerMarque(view, 'em')
  underlineBtn.onclick = () => basculerMarque(view, 'underline')
  strikeBtn.onclick = () => basculerMarque(view, 'strike')
  tableBtn.onclick = () => insererTableau(view)
  // « Image… » : le sélecteur de fichiers, puis le même dépôt que le collage.
  // Le curseur est là où il était : la sélection de l'éditeur survit à la
  // perte du focus.
  imageBtn.hidden = !cap.canManageDocument
  imageBtn.onclick = () =>
    ouvrirSelecteurImages((fichiers) =>
      deposerImages(view, docId, fichiers, () => user, view.state.selection.$from.pos)
    )
  rowAddBtn.onclick = commandeTableau(() => view, addRowAfter)
  rowDelBtn.onclick = commandeTableau(() => view, deleteRow)
  colAddBtn.onclick = commandeTableau(() => view, addColumnAfter)
  colDelBtn.onclick = commandeTableau(() => view, deleteColumn)
  tableDelBtn.onclick = commandeTableau(() => view, deleteTable)
  orderedListBtn.onclick = () => basculerListeNumerotee(view)
  taskListBtn.onclick = () => basculerListeACocher(view)
  listBtn.onclick = () => basculerListeAPuces(view)
  quoteBtn.onclick = () => basculerCitation(view)
  tocBtn.onclick = () => {
    insererTable(view.state, view.dispatch)
    view.focus()
  }
  ligneBtn.onclick = () => insererLigne(view)
  sautBtn.onclick = () => insererSautDePage(view)
  headingSelect.onchange = () => {
    if (appliquerStyleDeBloc(view, headingSelect.value) === 'note') {
      // Un titre ne porte pas de note (schema.js) : on le dit plutôt que
      // de laisser ProseMirror refuser en silence.
      messageFugace('Un titre ne peut pas contenir de note.', { erreur: true })
      syncHeadingSelect()
    }
    view.focus()
  }
  lienBtn.onclick = () => {
    commandeLien({ peutPoser: peutPoserLien, surRefus: refuserLien })(view.state, view.dispatch, view)
  }
  noteBtn.onclick = () => {
    if (!insererNote(view, user))
      messageFugace('Une note se pose dans un paragraphe, pas dans un titre.', { erreur: true })
  }

  // Corrections IA (la barre latérale) et Margo (le dialogue flottant), 13/10/2026 :
  // le serveur dit à chacune si la personne y a droit (niveau d'accès réglé
  // dans le back-office) et quelles sont ses limites, en signes.
  const correctionsIA = mountAIPanel(aiSection, () => view, { docId })
  let demonte = false
  // Margo vit dans l'onglet du volet de droite (lot L1, 21/10/2026). Pas de
  // droit au dialogue : pas d'onglet.
  const dialoguePret = monterDialogue({
    docId,
    getView: () => view,
    hote: panneauMargo,
    enVolet: true,
    surReplier: () => {
      voletDroit.fermer()
      // Le focus ne doit pas tomber dans le vide avec le volet : il retourne au texte.
      rendreLeFocusAuTexte()
    },
  }).then((d) => {
    if (d && demonte) d.destroy()
    else if (d) dialogue = d
    return !!d
  })
  // Le volet Margo ne porte que le dialogue : pas de droit au dialogue, pas de
  // bouton. Corrections IA n'a plus de panneau (21/10/2026) : la bulle de
  // sélection lance ses consignes.
  Promise.all([correctionsIA.prete, dialoguePret]).then(([ia, margo]) => {
    iaOuverte = !!ia
    margoOuvert = !!margo
    if (!demonte && !margo) voletDroit.afficherPanneau('margo', false)
  })
  const comments = mountCommentsPanel(commentsSection, ydoc, commentsMap, () => view, user)

  // --- L'interface téléphone (22/09/2026, voir iphone.js). Montée en
  // dernier : elle ne construit presque rien, elle replace et masque ce qui
  // précède. Rejouée au changement de largeur, parce qu'un téléphone qu'on
  // tourne et un iPad qui sort de Split View changent de largeur sans
  // recharger la page.
  let telephone = null
  function ajusterTelephone() {
    const petit = petitEcranMedia.matches
    if (petit && !telephone) {
      placerLaBarre()
      telephone = monterInterfaceTelephone({
        racine: shell,
        topBanner,
        titleInput,
        toolbar,
        outlineSidebar,
        trackToggleLabel,
        getView: () => view,
        estCorrecteur: () => !cap.canEditFreely,
        peutEcrire: () => peutProposer,
        nbCommentaires: () => commentairesAncres(commentsMap).length,
        // Les deux gestes de frappe qui montent dans l'en-tête du
        // téléphone. Ce sont les boutons eux-mêmes : ils y gardent leur
        // état actif et reviennent dans la barre en quittant l'écriture.
        outilsEssentiels: [boldBtn, italicBtn],
        relecture,
        // Le zoom quitte la barre d'outils pour le menu ⋯ : sur téléphone
        // c'est lui qui règle la taille du texte, ce n'est plus un
        // agrandissement passager (voir style.css).
        zoomSelect,
        ouvrirCommentaire: () => {
          const id =
            commentaireAuPoint(view.state, ydoc, commentsMap, view.state.selection.head) ||
            (commentairesAncres(commentsMap)[0] || [])[0]
          if (id) ouvrirFilCommentaire(view, ydoc, commentsMap, user, id)
          else messageFugace('Aucun commentaire dans ce document.')
        },
      })
    } else if (!petit && telephone) {
      telephone.demonter()
      telephone = null
    }
    if (!petit) placerLaBarre()
    disposer()
    // L'interrupteur du suivi vit dans le menu ⋯ sur téléphone (le menu le
    // prend au moment où il s'ouvre), et dans la colonne de droite ailleurs.
    placerLeSuivi()
  }
  ajusterTelephone()
  if (petitEcranMedia.addEventListener) {
    petitEcranMedia.addEventListener('change', ajusterTelephone)
    ecouteursGlobaux.push(() => petitEcranMedia.removeEventListener('change', ajusterTelephone))
  }
  if (gouttiereMedia.addEventListener) {
    gouttiereMedia.addEventListener('change', placerLeSuivi)
    ecouteursGlobaux.push(() => gouttiereMedia.removeEventListener('change', placerLeSuivi))
  }

  return {
    destroy() {
      demonte = true
      for (const retirer of ecouteursGlobaux.splice(0)) retirer()
      menuCompte.destroy()
      // Le rôle de la page qu'on quitte ne doit pas partir avec le
      // signalement fait depuis la suivante (contact.js).
      oublierRoleDeLaPage(roleCourant)
      if (dialogue) dialogue.destroy()
      correctionsIA.destroy()
      if (telephone) telephone.demonter()
      view.destroy()
      provider.destroy()
      presence.destroy()
      comments.destroy()
      ydoc.destroy()
    },
    view,
    user,
  }
}
