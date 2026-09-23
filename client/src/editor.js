import * as Y from 'yjs'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror'
import { EditorState, TextSelection, Plugin} from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift, chainCommands } from 'prosemirror-commands'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list'

import { schema } from './schema.js'
import { SimpleProvider } from './provider.js'
import {
  trackChangesPlugin,
  isTrackChangesEnabled,
  setTrackChangesEnabled,
  makeDispatchTransaction,
  effacementSuivi,
  selectionHighlightPlugin,
  richPastePlugin,
  pendingBreakPlugin,
  listChanges,
  acceptChange,
  rejectChange,
} from './trackChanges.js'
import { mountChangesPanel } from './changesPanel.js'
import { openAccessPanel } from './accessPanel.js'
import { mountAIPanel } from './aiPanel.js'
import {
  commentsPlugin,
  mountCommentsPanel,
  commentaireAuPoint,
  commentairesAncres,
  addComment,
} from './comments.js'
import { mountCommentsGutter, mountGutterComposer } from './commentsGutter.js'
import { mountOutlinePanel } from './outline.js'
import { mountWordCount } from './wordcount.js'
import { docToMarkdown, markdownFilename, downloadText } from './mdExport.js'
import { runCompactionIfNeeded } from './historySnapshot.js'
import { mountTkMarker } from './tkMarker.js'
import { markdownShortcutsPlugin } from './markdownShortcuts.js'
import { taskListPlugin } from './taskList.js'
import {
  tableEditing,
  goToNextCell,
  isInTable,
  fixTables,
  addRowAfter,
  deleteRow,
  addColumnAfter,
  deleteColumn,
  deleteTable,
} from 'prosemirror-tables'
import { imagesPlugin } from './images.js'
import { mountPresenceBar } from './presence.js'
import { monterMenuCompte } from './compteMenu.js'
import { loadDocStyle } from './styleConfig.js'
import { ouvrirPanneauStyle } from './stylePanel.js'
import { ouvrirPanneauPublication } from './publicationPanel.js'
import { messageFugace } from './images.js'
import { documentPourExport, VARIANTES, FINAL } from './exportVariante.js'
import { tableOfContentsPlugin, insererTable } from './tableOfContents.js'
import { ouvrirPlan } from './planFeuille.js'
import { monterInterfaceTelephone } from './iphone.js'
import {
  ouvrirFilCommentaire,
  monterBarreRelecture,
  monterBoutonCommenter,
} from './relectureTactile.js'
import { fermerFeuille, media, ouvrirFeuille, petitEcran, REQUETE_PETIT_ECRAN } from './feuille.js'

function buildCursor(user) {
  const cursor = document.createElement('span')
  cursor.classList.add('remote-cursor')
  // Sert à retrouver le curseur d'une personne précise quand on clique sur
  // sa pastille dans le bandeau (presence.js).
  cursor.dataset.user = user.name
  cursor.style.setProperty('--user-color', user.color)
  const label = document.createElement('span')
  label.classList.add('remote-cursor-label')
  label.textContent = user.name
  cursor.appendChild(label)
  return cursor
}

/** True if some ancestor of the selection's start (or the node it's in) is
 * of the given node type — used to make the list/quote toolbar buttons act
 * as toggles (wrap in / lift out) rather than one-directional actions. */
function hasAncestorOfType(state, type) {
  const { $from } = state.selection
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type === type) return true
  }
  return false
}

function toggleWrap(type) {
  return (state, dispatch) => {
    if (hasAncestorOfType(state, type)) return lift(state, dispatch)
    return wrapIn(type)(state, dispatch)
  }
}

function toggleList(listType, itemType) {
  return (state, dispatch) => {
    if (hasAncestorOfType(state, listType)) return liftListItem(itemType)(state, dispatch)
    return wrapInList(listType)(state, dispatch)
  }
}

export function mountEditor(root, docId, user, docMeta) {
  root.innerHTML = ''

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

  /** Un menu déroulant : un bouton, une liste flottante, fermée au clic
   * ailleurs. Deux usages ici (Partager, et le compte dans compteMenu.js) —
   * d'où la fabrique plutôt que deux copies du même mécanisme. */
  function menuDeroulant(libelle, { classe = '', titre = '' } = {}) {
    const menu = document.createElement('div')
    menu.className = `menu-flottant ${classe}`.trim()
    const bouton = document.createElement('button')
    bouton.type = 'button'
    bouton.className = 'btn-preset menu-flottant-bouton'
    bouton.textContent = libelle
    if (titre) bouton.title = titre
    const liste = document.createElement('div')
    liste.className = 'menu-flottant-liste menu-flottant-droite'
    liste.hidden = true
    menu.append(bouton, liste)
    bouton.onclick = (e) => {
      e.stopPropagation()
      liste.hidden = !liste.hidden
    }
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) liste.hidden = true
    })
    return { el: menu, liste, fermer: () => { liste.hidden = true } }
  }

  // --- Zone gauche : où je suis --------------------------------------------

  const backLink = document.createElement('a')
  backLink.href = '#/'
  backLink.className = 'back-link'
  backLink.textContent = '← Mes documents'
  zoneGauche.appendChild(backLink)

  // Le plan n'a plus de colonne sous 1100 px (20/09/2026) : ce bouton est
  // la seule porte vers lui sur tablette et téléphone, et c'est l'exigence
  // la plus explicite du chantier — naviguer simplement dans un document
  // long. Caché au-dessus de ce seuil, où la colonne est là.
  const planBtn = document.createElement('button')
  planBtn.type = 'button'
  planBtn.className = 'btn-preset btn-plan'
  planBtn.textContent = 'Plan'
  planBtn.title = 'Naviguer dans le document par ses titres'
  planBtn.onclick = () => ouvrirPlan(outlineSidebar)
  zoneGauche.appendChild(planBtn)

  // « + Nouveau » partout, y compris dans un document qu'on ne fait que
  // relire : créer un document ne demande qu'une session, jamais un rôle sur
  // celui qu'on a sous les yeux. Sans ce bouton, quelqu'un arrivé par une
  // invitation devait repasser par la liste pour commencer quelque chose —
  // et un correcteur pouvait croire qu'il n'en avait pas le droit.
  const nouveauBtn = document.createElement('button')
  nouveauBtn.type = 'button'
  nouveauBtn.className = 'btn-nouveau'
  nouveauBtn.textContent = '+ Nouveau'
  nouveauBtn.title = 'Créer un document'
  nouveauBtn.onclick = async () => {
    nouveauBtn.disabled = true
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '' }),
      })
      if (res.status === 401) {
        location.hash = '#/login'
        return
      }
      if (!res.ok) throw new Error('création refusée')
      const doc = await res.json()
      location.hash = `#/doc/${doc.id}`
    } catch (err) {
      messageFugace("Le document n'a pas pu être créé.", { erreur: true })
    } finally {
      nouveauBtn.disabled = false
    }
  }
  zoneGauche.appendChild(nouveauBtn)

  // L'étoile précède le titre (18/09) : elle qualifie le document, elle
  // n'agit pas dessus — sa place est du côté du nom, pas du côté des
  // outils.
  const starBtn = document.createElement('button')
  starBtn.type = 'button'
  starBtn.className = 'star-btn'
  let starred = !!docMeta.starred
  function renderStar() {
    starBtn.textContent = starred ? '★' : '☆'
    starBtn.classList.toggle('starred', starred)
    starBtn.title = starred ? 'Retirer des favoris' : 'Mettre en favori'
  }
  renderStar()
  starBtn.onclick = async () => {
    const next = !starred
    starBtn.disabled = true
    try {
      const res = await fetch(`/api/docs/${docId}/star`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ starred: next }),
      })
      if (res.ok) {
        starred = next
        renderStar()
      }
    } finally {
      starBtn.disabled = false
    }
  }
  zoneGauche.appendChild(starBtn)

  // Le titre reste éditable en place (confirmé le 17/09) : c'est le nom du
  // lieu où l'on est, pas une fonction — d'où sa place dans la zone de
  // navigation, et non parmi les outils.
  const titleInput = document.createElement('input')
  titleInput.className = 'doc-title'
  titleInput.value = docMeta.title
  titleInput.title = 'Titre du document — modifiable directement'
  let titleSaveTimer = null
  titleInput.addEventListener('input', () => {
    // Broadcast on every keystroke (cheap — just a relay, see provider.js)
    // so other open tabs update live, same spirit as the document body;
    // the actual persistence below stays debounced.
    provider.sendTitle(titleInput.value)
    clearTimeout(titleSaveTimer)
    titleSaveTimer = setTimeout(() => {
      fetch(`/api/docs/${docId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: titleInput.value }),
      }).catch(() => {})
    }, 500)
  })
  zoneGauche.appendChild(titleInput)



  // --- Zone centre : qui est là --------------------------------------------

  // Rempli une fois que `provider` existe, plus bas. Seule chose du bandeau
  // qui change toute seule, et ce qui distingue Amend d'un éditeur de texte
  // ordinaire : elle a le centre, et de l'air autour.
  const presenceContainer = document.createElement('div')
  zoneCentre.appendChild(presenceContainer)

  // --- Zone droite : ce que je fais au document ----------------------------

  // 1. Travailler le texte.
  const groupeTexte = document.createElement('div')
  groupeTexte.className = 'banniere-groupe'

  // L'interrupteur du suivi ne vit plus dans le bandeau (19/09) : il prend
  // la tête de la colonne de droite, en position fixe, aligné sur la barre
  // de mise en forme du texte. Il y gagne la place d'être **vu** — c'est
  // l'état le plus important de l'éditeur, celui qui décide si ce qu'on
  // tape sera une proposition ou une modification directe, et une case à
  // cocher perdue entre deux compteurs ne le disait pas.
  // Construit ici, posé plus bas dans la colonne (voir `suiviEntete`).
  const trackToggleLabel = document.createElement('label')
  trackToggleLabel.className = 'track-toggle'
  const trackToggle = document.createElement('input')
  trackToggle.type = 'checkbox'
  trackToggle.checked = true
  trackToggleLabel.append(trackToggle, document.createTextNode(' Suivi des modifications'))

  const tkCount = document.createElement('span')
  tkCount.className = 'tk-count'
  groupeTexte.appendChild(tkCount)

  const wordCount = document.createElement('span')
  wordCount.className = 'word-count'
  groupeTexte.appendChild(wordCount)

  // 2. La forme. (Le zoom n'est pas ici : il agrandit le texte à l'écran,
  // il ne change rien au document — sa place est dans la barre de mise en
  // forme, au-dessus du texte, pas dans le bandeau du document.)
  const groupeForme = document.createElement('div')
  groupeForme.className = 'banniere-groupe'

  // Mise en page du document (16/09/2026) — réservée aux éditeurs, comme
  // renommer ou supprimer : c'est `canManageDocument` côté serveur qui
  // décide, ce bouton n'est que la porte.
  const miseEnPageBtn = document.createElement('button')
  miseEnPageBtn.type = 'button'
  miseEnPageBtn.className = 'btn-tool btn-texte'
  miseEnPageBtn.textContent = 'Mise en page'
  miseEnPageBtn.title = "Format, marges, styles des titres et du texte — propres à ce document"
  miseEnPageBtn.onclick = () => ouvrirPanneauStyle(docId)
  groupeForme.appendChild(miseEnPageBtn)

  // L'historique ferme la rangée, seul dans son groupe (19/09/2026) : il ne
  // touche pas au document, il le regarde — c'est le seul geste de la zone
  // droite qui ne change rien.
  const groupeHistorique = document.createElement('div')
  groupeHistorique.className = 'banniere-groupe'
  const historyLink = document.createElement('a')
  historyLink.href = `#/doc/${docId}/versions`
  historyLink.className = 'btn-preset history-link'
  historyLink.textContent = 'Historique'
  groupeHistorique.appendChild(historyLink)

  // 3. Faire sortir. Un seul bouton (17/09/2026) : les accès et les exports
  // répondaient déjà à la même question — *qui d'autre voit ce document, et
  // sous quelle forme* — et occupaient deux places distinctes dans la barre.
  // C'est aussi le logement naturel de la publication de page (§1 de la
  // feuille de route) le jour où elle arrivera.
  const menuPartage = menuDeroulant('Partager ▾', { classe: 'menu-partage' })

  const accesItem = document.createElement('button')
  accesItem.type = 'button'
  accesItem.textContent = 'Gérer les accès…'
  accesItem.onclick = () => {
    menuPartage.fermer()
    openAccessPanel(docId, { jeSuisProprietaire: !!docMeta.jeSuisProprietaire })
  }

  const sepExports = document.createElement('hr')
  sepExports.className = 'menu-flottant-separateur'
  const titreExports = document.createElement('span')
  titreExports.className = 'menu-flottant-entete'
  titreExports.textContent = 'Exporter'

  // Ce que l'export met dans le fichier (19/09/2026) — question restée
  // sans réponse jusque-là, avec pour conséquence des exports où un mot
  // remplacé et son remplaçant se suivaient. Le choix se fait ici, au-dessus
  // des trois formats, parce qu'il vaut pour les trois.
  const varianteSelect = document.createElement('select')
  varianteSelect.className = 'menu-flottant-choix'
  for (const v of VARIANTES) {
    const o = document.createElement('option')
    o.value = v.id
    o.textContent = v.label
    o.title = v.aide
    varianteSelect.appendChild(o)
  }
  varianteSelect.value = FINAL
  varianteSelect.onclick = (e) => e.stopPropagation()
  const varianteAide = document.createElement('span')
  varianteAide.className = 'menu-flottant-aide'
  const majAide = () => {
    varianteAide.textContent = (VARIANTES.find((v) => v.id === varianteSelect.value) || VARIANTES[0]).aide
  }
  majAide()
  varianteSelect.onchange = majAide
  /** Le document à exporter, dans la variante choisie. */
  const docAExporter = () => documentPourExport(view.state.doc, varianteSelect.value)

  const exportMdItem = document.createElement('button')
  exportMdItem.type = 'button'
  exportMdItem.textContent = 'Markdown (.md)'
  const exportDocxItem = document.createElement('button')
  exportDocxItem.type = 'button'
  exportDocxItem.textContent = 'Word (.docx)'
  const exportPdfItem = document.createElement('button')
  exportPdfItem.type = 'button'
  exportPdfItem.textContent = 'PDF (.pdf)'

  // « Publier sur le web » (17/09/2026) — la même question que les accès et
  // les exports, poussée d'un cran : qui d'autre voit ce document, et sous
  // quelle forme. D'où sa place dans ce menu, et non ailleurs. L'entrée
  // n'apparaît que si le serveur dit que cette personne peut publier —
  // administrateurs pendant la phase de test, réglable par PUBLICATION_WEB.
  const sepPublier = document.createElement('hr')
  sepPublier.className = 'menu-flottant-separateur'
  const publierItem = document.createElement('button')
  publierItem.type = 'button'
  publierItem.textContent = 'Publier sur le web…'
  sepPublier.hidden = true
  publierItem.hidden = true
  publierItem.onclick = () => {
    menuPartage.fermer()
    ouvrirPanneauPublication(docId, () => view.state.doc, () => titleInput.value)
  }

  menuPartage.liste.append(accesItem, sepExports, titreExports, varianteSelect, varianteAide, exportMdItem, exportDocxItem, exportPdfItem, sepPublier, publierItem)
  // Mise en page et Partager voisinent : ce sont les deux gestes qui
  // décident de la **forme sous laquelle le document sort** — l'un la
  // compose, l'autre la distribue.
  groupeForme.appendChild(menuPartage.el)

  zoneDroite.append(groupeTexte, groupeForme, groupeHistorique)

  // 4. Moi. À l'extrême droite, séparée des pastilles de présence par toute
  // la largeur du bandeau : les deux sont des ronds colorés, et les
  // confondre serait fâcheux.
  // Le voyant d'état ferme la rangée, juste avant la pastille du compte
  // (18/09) : l'état de l'enregistrement se range avec ce qui parle de la
  // session, pas avec le nom du document.
  const status = document.createElement('span')
  status.className = 'connection-status'
  status.setAttribute('role', 'status')
  zoneDroite.appendChild(status)

  monterMenuCompte(zoneDroite, { couleur: () => user.color })

  // Le serveur seul sait qui peut publier : on le lui demande plutôt que de
  // rejouer la règle ici, où elle finirait par diverger.
  fetch(`/api/docs/${docId}/publication`)
    .then((r) => (r.ok ? r.json() : null))
    .then((etat) => {
      if (!etat || !etat.autorise) return
      sepPublier.hidden = false
      publierItem.hidden = false
      publierItem.textContent = etat.publiee ? 'Page publiée — gérer…' : 'Publier sur le web…'
    })
    .catch(() => {})

  /** Écrire un commentaire sur la sélection, en feuille. Modale, celle-ci :
   * on est en train d'écrire, il n'y a rien d'autre à faire. */
  function ouvrirComposeurTactile() {
    const selection = view.state.selection
    if (selection.empty) return
    const feuille = ouvrirFeuille('Nouveau commentaire', { hauteur: 0.4, modale: true })
    const forme = document.createElement('form')
    forme.className = 'feuille-repondre'
    const zone = document.createElement('textarea')
    zone.rows = 3
    zone.placeholder = 'Votre commentaire…'
    const envoyer = document.createElement('button')
    envoyer.type = 'submit'
    envoyer.className = 'btn-accept'
    envoyer.textContent = 'Commenter'
    forme.append(zone, envoyer)
    forme.onsubmit = (e) => {
      e.preventDefault()
      if (!zone.value.trim()) return
      // La sélection a pu bouger pendant qu'on écrivait (quelqu'un d'autre
      // édite) : on la repose telle qu'elle était au moment du geste.
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selection.from, selection.to)))
      addComment(view, ydoc, commentsMap, user, zone.value.trim())
      feuille.fermer()
    }
    feuille.corps.appendChild(forme)
    zone.focus()
  }

  /** Le greffon du petit écran : il ne décide rien, il relie. */
  function tactilePlugin() {
    return new Plugin({
      props: {
        handleClick(vue, pos) {
          if (!petitEcran()) return false
          const id = commentaireAuPoint(vue.state, ydoc, commentsMap, pos)
          if (!id) return false
          // On n'empêche pas le curseur de se poser : on ouvre **en plus**.
          // Refuser le clic laisserait le doigt sans effet visible dans le
          // texte, ce qui se sent comme un raté.
          setTimeout(() => ouvrirFilCommentaire(view, ydoc, commentsMap, user, id), 0)
          return false
        },
      },
      view() {
        return {
          update() {
            relecture.rendre()
            commenter.placer()
          },
        }
      },
    })
  }

  const layout = document.createElement('div')
  layout.className = 'editor-layout'

  const main = document.createElement('div')
  main.className = 'editor-main'

  // Formatting palette only — stays in the middle (text) column, above the
  // scrolling editor-container (so it never scrolls away), rather than
  // spanning the full page width like the banner above.
  const toolbar = document.createElement('div')
  toolbar.className = 'format-toolbar'

  const headingSelect = document.createElement('select')
  headingSelect.className = 'heading-select'
  headingSelect.title = 'Style de paragraphe'
  for (const [label, value] of [
    ['Normal', ''],
    ['Titre 1', '1'],
    ['Titre 2', '2'],
    ['Titre 3', '3'],
  ]) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    headingSelect.appendChild(opt)
  }
  // Trois groupes (20/09/2026). Sur ordinateur ils se suivent sur une
  // ligne, comme avant ; sur téléphone la barre descend au-dessus du
  // clavier et ils deviennent des onglets, faute de quoi quinze boutons
  // occuperaient trois rangées et la moitié de l'écran.
  const groupeTexte2 = document.createElement('div')
  groupeTexte2.className = 'barre-groupe'
  groupeTexte2.dataset.groupe = 'texte'
  const groupeInserer = document.createElement('div')
  groupeInserer.className = 'barre-groupe'
  groupeInserer.dataset.groupe = 'inserer'
  const groupeRelire = document.createElement('div')
  groupeRelire.className = 'barre-groupe'
  groupeRelire.dataset.groupe = 'relire'

  groupeTexte2.appendChild(headingSelect)

  const boldBtn = mkButton('B', 'gras (Ctrl-B)')
  const italicBtn = mkButton('I', 'italique (Ctrl-I)')
  const underlineBtn = mkButton('U', 'souligné (Ctrl-U)')
  underlineBtn.style.textDecoration = 'underline'
  const strikeBtn = mkButton('S', 'barré')
  strikeBtn.style.textDecoration = 'line-through'
  const listBtn = mkButton('–', 'liste à tirets')
  const orderedListBtn = mkButton('1.', 'liste numérotée')
  const taskListBtn = mkButton('☑', 'liste à cocher')
  const quoteBtn = mkButton('”', 'citation')
  const hrBtn = mkButton('—', 'Insérer une ligne (devient un saut de page à l’export PDF)')
  // La table des matières se pose dans le texte, là où le curseur est :
  // c'est ce qui la distingue d'une option de mise en page (20/09/2026).
  const tocBtn = mkButton('Sommaire', 'Insérer une table des matières ici')
  tocBtn.classList.add('btn-texte')
  groupeTexte2.append(boldBtn, italicBtn, underlineBtn, strikeBtn, listBtn, orderedListBtn, taskListBtn)
  groupeInserer.append(quoteBtn, hrBtn, tocBtn)

  // Groupe tableau : le bouton d'insertion est toujours là, les commandes de
  // structure n'apparaissent que lorsque le curseur est dans un tableau
  // (voir syncTableButtons plus bas). Tout ce groupe est réservé aux
  // éditeurs — voir claude/etude-tableaux-images.md : supprimer une ligne
  // fait disparaître son contenu sans laisser de trace dans le suivi des
  // modifications, ce qu'on ne confie pas à un correcteur.
  const tableBtn = mkButton('Tableau', 'insérer un tableau de 3 lignes sur 3 colonnes')
  const rowAddBtn = mkButton('Ligne +', 'ajouter une ligne sous celle du curseur')
  const rowDelBtn = mkButton('Ligne −', 'supprimer la ligne du curseur')
  const colAddBtn = mkButton('Col. +', 'ajouter une colonne à droite de celle du curseur')
  const colDelBtn = mkButton('Col. −', 'supprimer la colonne du curseur')
  const tableDelBtn = mkButton('Suppr. tableau', 'supprimer tout le tableau')
  // `.btn-tool` est un carré de 30 px, pensé pour B/I/U : les boutons de
  // tableau portent des mots, ils ont donc besoin de la variante texte.
  for (const b of [tableBtn, rowAddBtn, rowDelBtn, colAddBtn, colDelBtn, tableDelBtn]) {
    b.classList.add('btn-texte')
  }
  const tableGroup = document.createElement('span')
  tableGroup.className = 'table-group'
  tableGroup.append(rowAddBtn, rowDelBtn, colAddBtn, colDelBtn, tableDelBtn)
  groupeInserer.append(tableBtn, tableGroup)

  // Les onglets : une rangée d'étiquettes qui n'apparaît qu'en bas d'écran.
  const onglets = document.createElement('div')
  onglets.className = 'barre-onglets'
  const boutonsOnglet = {}
  for (const [cle, libelle] of [
    ['texte', 'Texte'],
    ['inserer', 'Insérer'],
    ['relire', 'Relire'],
  ]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'barre-onglet'
    b.textContent = libelle
    b.onclick = () => choisirOnglet(cle)
    boutonsOnglet[cle] = b
    onglets.appendChild(b)
  }
  function choisirOnglet(cle) {
    toolbar.dataset.onglet = cle
    for (const [k, b] of Object.entries(boutonsOnglet)) b.classList.toggle('actif', k === cle)
  }
  choisirOnglet('texte')

  // La relecture au doigt : un parcours, pas une liste (20/09/2026). La
  // liste des modifications reste dans la colonne de droite, qui n'existe
  // pas sur téléphone ; cette barre la remplace là où il n'y a pas la place.
  const relecture = monterBarreRelecture(() => view, {
    canReview: docMeta.myRole !== 'correcteur',
  })
  groupeRelire.appendChild(relecture.el)

  // Et la porte vers les commentaires : le fil du passage où est le
  // curseur, ou rien à ouvrir si l'on n'est pas dans un passage commenté.
  const filBtn = document.createElement('button')
  filBtn.type = 'button'
  filBtn.className = 'btn-tool btn-texte'
  filBtn.textContent = 'Commentaire'
  filBtn.title = 'Ouvrir le fil du passage où se trouve le curseur'
  filBtn.onclick = () => {
    const id = commentaireAuPoint(view.state, ydoc, commentsMap, view.state.selection.head)
    if (id) ouvrirFilCommentaire(view, ydoc, commentsMap, user, id)
    else messageFugace('Aucun commentaire à cet endroit du texte.')
  }
  groupeRelire.appendChild(filBtn)

  toolbar.append(groupeTexte2, groupeInserer, groupeRelire, onglets)
  main.appendChild(toolbar)

  const editorContainer = document.createElement('div')
  editorContainer.className = 'editor-container'
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
  const zoomSelect = document.createElement('select')
  zoomSelect.className = 'zoom-select'
  zoomSelect.title = "Facteur d'agrandissement du texte"
  // Cinq crans (23/09/2026). 75 et 125 ajoutés parce que c'est ce réglage
  // qui remplace, sur téléphone, le suivi de la taille système : entre 100
  // et 150 il manquait le petit pas, celui qu'on fait le plus souvent.
  for (const pct of ['50', '75', '100', '125', '150']) {
    const opt = document.createElement('option')
    opt.value = pct
    opt.textContent = `${pct}%`
    zoomSelect.appendChild(opt)
  }
  let storedZoom = '100'
  try {
    storedZoom = localStorage.getItem('collabtext:zoom') || '100'
  } catch {
    // localStorage indisponible (navigation privée...) — reste sur 100%.
  }
  const poserLEchelle = (pct) => {
    editorContainer.style.setProperty('--echelle', String(Number(pct) / 100))
  }
  zoomSelect.value = storedZoom
  poserLEchelle(storedZoom)
  zoomSelect.addEventListener('change', () => {
    poserLEchelle(zoomSelect.value)
    try {
      localStorage.setItem('collabtext:zoom', zoomSelect.value)
    } catch {
      // tant pis, le réglage ne sera pas mémorisé la prochaine fois.
    }
  })
  // Le zoom appartient à la colonne du texte, pas au bandeau (17/09/2026) :
  // c'est un réglage de confort de lecture, propre à cet écran et à cette
  // personne — il ne touche ni au document ni à ce qui en sortira.
  groupeTexte2.appendChild(zoomSelect)

  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'
  // L'en-tête ne défile pas : l'interrupteur du suivi doit être là quoi
  // qu'on ait fait défiler en dessous.
  const suiviEntete = document.createElement('div')
  suiviEntete.className = 'suivi-entete'
  suiviEntete.appendChild(trackToggleLabel)
  const sidebarCorps = document.createElement('div')
  sidebarCorps.className = 'sidebar-corps'
  const aiSection = document.createElement('div')
  aiSection.className = 'sidebar-section ai-section'
  const changesSection = document.createElement('div')
  changesSection.className = 'sidebar-section changes-section'
  const commentsSection = document.createElement('div')
  commentsSection.className = 'sidebar-section comments-section'
  sidebarCorps.append(aiSection, changesSection, commentsSection)
  sidebar.append(suiviEntete, sidebarCorps)

  // L'interrupteur du suivi change de place avec la largeur (20/09/2026),
  // et **une seule fois pour toutes** : il est déménagé, jamais dupliqué.
  // Deux cases à cocher pour un même état, ce serait deux états à tenir
  // d'accord, et un jour l'une affichant le contraire de l'autre. Sur
  // téléphone la colonne de droite n'existe plus, et cet interrupteur est
  // précisément ce qu'on ne peut pas se permettre de perdre : c'est lui qui
  // dit si ce qu'on tape est une proposition ou une modification directe.
  const petitEcranMedia = media(REQUETE_PETIT_ECRAN)
  function placerLeSuivi() {
    // Sur téléphone, l'interrupteur vit dans le menu ⋯ (iphone.js) et c'est
    // ce menu qui va le chercher : on ne le place ici que pour l'ordinateur
    // et la tablette, où il tient la tête de la colonne de droite.
    if (!petitEcranMedia.matches) suiviEntete.appendChild(trackToggleLabel)
  }
  placerLeSuivi()

  const outlineSidebar = document.createElement('div')
  outlineSidebar.className = 'outline-sidebar'
  const outlineSection = document.createElement('div')
  outlineSection.className = 'sidebar-section outline-section'
  outlineSidebar.appendChild(outlineSection)

  layout.append(outlineSidebar, main, sidebar)
  shell.append(topBanner, layout)
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
  const yXml = ydoc.getXmlFragment('prosemirror-content')
  // Commentaires ancrés (évolution 4.2.4) : un type Yjs séparé du texte,
  // synchronisé/persisté par la même plomberie sans rien changer au
  // contenu ni aux exports — voir comments.js.
  const commentsMap = ydoc.getMap('comments')

  // "à jour" / "enregistrement…" / "modifications non envoyées" rather than
  // just connecté/reconnexion — see provider.js's saving/hasPendingLocalChanges
  // bookkeeping (correctif 4.2.3, rapport de fiabilité du 12/09/2026).
  // Un voyant, plus une phrase (17/09/2026). Le texte complet occupait
  // 290 px fixes dans le bandeau — la largeur du plus long des messages,
  // réservée en permanence pour un état qui est « à jour » 99 % du temps.
  // Le détail passe en infobulle : il reste disponible quand on en a
  // besoin, c'est-à-dire quand le voyant n'est pas vert.
  function renderConnectionStatus() {
    let etat = 'ok'
    let texte = 'À jour'
    if (!provider.connected) {
      if (provider.hasPendingLocalChanges) {
        etat = 'alerte'
        texte = 'Hors connexion — modifications non envoyées'
      } else if (provider.likelyRejected) {
        etat = 'alerte'
        texte = 'Connexion refusée (accès retiré ?)'
      } else {
        etat = 'attente'
        texte = 'Reconnexion…'
      }
    } else if (provider.saving) {
      etat = 'attente'
      texte = 'Enregistrement…'
    }
    status.classList.toggle('etat-ok', etat === 'ok')
    status.classList.toggle('etat-attente', etat === 'attente')
    status.classList.toggle('etat-alerte', etat === 'alerte')
    status.title = texte
    // Le voyant seul ne dirait rien à un lecteur d'écran.
    status.setAttribute('aria-label', texte)
  }
  provider.addEventListener('status', renderConnectionStatus)
  renderConnectionStatus()

  // Compaction en tâche de fond (voir historySnapshot.js/server/storage.js) :
  // ne fait rien si le journal n'a pas encore dépassé le seuil, et échoue
  // silencieusement sinon (une autre personne connectée s'en chargera) —
  // pas la peine d'attendre ni de bloquer l'ouverture de l'éditeur pour ça.
  // Un léger délai après la première connexion plutôt qu'immédiat, pour ne
  // pas rivaliser avec le chargement initial du document.
  let compactionTried = false
  provider.addEventListener('status', () => {
    if (compactionTried || !provider.connected) return
    compactionTried = true
    setTimeout(() => runCompactionIfNeeded(docId), 3000)
  })

  // Live title sync between rédacteurs (correctif 4.1.1) — never overwrite
  // what the local person is actively typing themselves.
  provider.addEventListener('title', (e) => {
    if (document.activeElement !== titleInput) titleInput.value = e.detail.title
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
      // Un éditeur arrive suivi désactivé (il écrit son document), un
      // correcteur suivi activé — c'est son rôle même (15/09/2026).
      trackChangesPlugin({ enabled: docMeta.myRole === 'correcteur' }),
      selectionHighlightPlugin(),
      tableOfContentsPlugin(),
      // Avant richPastePlugin : une capture d'écran collée est une image,
      // pas un collage de texte (voir images.js).
      imagesPlugin({ docId, peutInserer: docMeta.myRole !== 'correcteur' }),
      richPastePlugin(() => user),
      pendingBreakPlugin(),
      commentsPlugin(ydoc, commentsMap),
      // Le tactile (20/09/2026) : toucher un passage commenté ouvre son fil
      // en feuille, et la barre de relecture se tient à jour. Ce greffon
      // n'existe que pour le petit écran — au-dessus de 700 px, la marge et
      // la colonne de droite font tout cela mieux, et il ne fait rien.
      tactilePlugin(),
      mountCommentsGutter(commentsGutter, ydoc, commentsMap, user),
      mountGutterComposer(commentsGutter, ydoc, commentsMap, user),
      mountChangesPanel(changesSection, { canReview: docMeta.myRole !== 'correcteur' }),
      mountOutlinePanel(outlineSection),
      mountWordCount(wordCount),
      mountTkMarker(tkCount),
      keymap({
        // Retour arrière et Suppr sont pris en charge ici, **avant** le
        // comportement natif du navigateur : le suivi des modifications
        // garde à l'écran du texte que le navigateur croit effacé, et lui
        // laisser la main finissait par lui faire insérer une espace
        // parasite quand on maintenait la touche enfoncée. Hors suivi, ou
        // en début de bloc (où c'est une fusion et non un effacement), ces
        // commandes passent la main à baseKeymap comme avant.
        Backspace: effacementSuivi(() => user, true),
        Delete: effacementSuivi(() => user, false),
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Mod-u': toggleMark(schema.marks.underline),
        // Falls through to the plain Enter/baseKeymap handling below
        // whenever the cursor isn't inside a list item.
        // Les trois familles de liste partagent les mêmes gestes : la
        // première commande qui s'applique gagne, les autres passent la main
        // (et finalement baseKeymap, hors liste).
        Enter: chainCommands(
          splitListItem(schema.nodes.list_item),
          splitListItem(schema.nodes.task_item)
        ),
        'Mod-]': chainCommands(
          sinkListItem(schema.nodes.list_item),
          sinkListItem(schema.nodes.task_item)
        ),
        'Mod-[': chainCommands(
          liftListItem(schema.nodes.list_item),
          liftListItem(schema.nodes.task_item)
        ),
        // Tab circule de cellule en cellule, et ne fait rien ailleurs (le
        // retour `false` laisse le navigateur gérer la tabulation normale).
        Tab: goToNextCell(1),
        'Shift-Tab': goToNextCell(-1),
      }),
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
      taskListPlugin(schema),
      new Plugin({
        view: () => ({ update: () => syncToolbar() }),
      }),
      dropCursor(),
      gapCursor(),
    ],
  })

  const view = new EditorView(editorContainer, { state })
  editorContainer.appendChild(commentsGutter)

  // --- Le masque de chargement (23/09/2026).
  //
  // Le serveur rejoue le journal opération par opération à chaque
  // connexion : sans masque, on voit le document **se recomposer** sous ses
  // yeux en ouvrant la page — paragraphe après paragraphe sur un texte
  // long, et d'autant plus longtemps que le journal est gros. C'était le
  // défaut d'ergonomie le plus voyant de l'application.
  //
  // Le masque se lève sur le message `synced` que le serveur envoie après
  // le rejeu (rooms.js). Deux issues de secours, parce qu'un masque qui ne
  // se lève pas serait bien pire que le défaut qu'il corrige : un serveur
  // plus ancien qui n'enverrait pas ce message, et un rejeu qui n'arrive
  // jamais. Dans les deux cas on découvre le document au bout de huit
  // secondes plutôt que de rester devant un écran bloqué.
  const masque = document.createElement('div')
  masque.className = 'masque-chargement'
  const masqueTexte = document.createElement('p')
  masqueTexte.textContent = 'Chargement du document…'
  masque.appendChild(masqueTexte)
  editorContainer.appendChild(masque)

  let masqueLeve = false
  function leverLeMasque() {
    if (masqueLeve) return
    masqueLeve = true
    clearTimeout(secours)
    masque.classList.add('masque-parti')
    // On retire après la transition : un élément en `opacity: 0` continue
    // de couvrir la zone d'édition et avalerait les clics.
    setTimeout(() => masque.remove(), 220)
  }
  const secours = setTimeout(leverLeMasque, 8000)
  provider.addEventListener('synced', leverLeMasque)
  if (provider.synced) leverLeMasque()

  // Le bouton « Commenter » qui suit la sélection, sur petit écran
  // seulement : il remplace le « + » de la marge, qui n'a plus de marge où
  // vivre. Posé **au-dessus** de la sélection — en dessous, il tomberait
  // sous le pouce qui vient de sélectionner, et sous la barre de
  // suggestions du clavier.
  const commenter = monterBoutonCommenter(editorContainer, () => view, ouvrirComposeurTactile)
  // dispatchTransaction needs a reference to `view` itself, so it's wired
  // up right after construction rather than passed in the initial props.
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => user) })

  // TEMPORAIRE (test de charge du 13/09/2026, a retirer apres) : expose la
  // vue pour piloter des transactions depuis un script externe.
  window.__debugPmView = view
  window.__debugUser = user
  window.__debugSetTrackChanges = (enabled) => setTrackChangesEnabled(view, enabled)
  // Diagnostic du 14/09/2026 (bug de collage signalé) : accès direct à la
  // couche Yjs pour comparer l'état du document ProseMirror à l'état Yjs
  // sous-jacent — à retirer avec le reste de ce bloc temporaire.
  window.__debugProvider = provider
  window.__debugYdoc = ydoc
  window.__debugYXml = yXml

  // Un correcteur reste toujours en suivi de modifications — ne peut ni
  // désactiver le suivi, ni en sortir (voir
  // claude/conception-gestion-utilisateurs.md, projet Amend). Appliqué ici
  // seulement côté interface : le serveur ne vérifie pas encore le contenu
  // des modifications, limite connue et acceptée pour cette première
  // version.
  // Lu par la palette de contact pour joindre le rôle au signalement
  // (contact.js) — une même page ne se comporte pas pareil selon le rôle,
  // et c'est la première chose qu'on demanderait sinon.
  window.__amendRole = docMeta.myRole || null
  const isCorrecteur = docMeta.myRole === 'correcteur'
  // Mise en page et exports réservés aux éditeurs (16/09/2026). Pour la
  // mise en page, le serveur vérifie `canManageDocument` et la restriction
  // est donc réelle. Pour les exports, elle ne l'est pas : les trois sont
  // fabriqués dans le navigateur à partir du document que la personne a
  // déjà sous les yeux — c'est une **convention** qui dit qui produit le
  // livrable, pas une protection. Elle deviendra réelle pour le PDF le jour
  // où il sortira d'une route serveur (chantier Typst).
  if (isCorrecteur) {
    menuPartage.el.hidden = true
    miseEnPageBtn.hidden = true
    // Poser une table des matières, c'est décider de la structure du
    // document — même raisonnement que pour les tableaux.
    tocBtn.hidden = true
  }
  if (isCorrecteur) {
    trackToggle.disabled = true
    trackToggleLabel.title = 'Les correcteurs proposent toujours leurs modifications en suivi de modifications.'
    if (!isTrackChangesEnabled(view.state)) setTrackChangesEnabled(view, true)
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
  }

  /** Style de bloc commun à toute la sélection : '' pour un paragraphe, le
   * niveau pour un titre, `null` si la sélection en mélange plusieurs (on
   * n'affiche alors aucune option plutôt que d'en désigner une à tort). Les
   * paragraphes d'une liste ou d'une citation comptent comme « Normal » :
   * c'est bien ce que le menu changerait s'il était utilisé. */
  function styleDeBlocCommun(state) {
    let commun
    const { from, to } = state.selection
    state.doc.nodesBetween(from, to, (node) => {
      if (!node.isTextblock) return true
      const valeur =
        node.type === schema.nodes.heading
          ? String(node.attrs.level)
          : node.type === schema.nodes.paragraph
            ? ''
            : null
      if (commun === undefined) commun = valeur
      else if (commun !== valeur) commun = null
      return false
    })
    return commun === undefined ? '' : commun
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

  syncToolbar = () => {
    syncToggle()
    syncHeadingSelect()
    syncTableButtons()
  }
  syncToolbar()

  boldBtn.onclick = () => {
    toggleMark(schema.marks.strong)(view.state, view.dispatch)
    view.focus()
  }
  italicBtn.onclick = () => {
    toggleMark(schema.marks.em)(view.state, view.dispatch)
    view.focus()
  }
  underlineBtn.onclick = () => {
    toggleMark(schema.marks.underline)(view.state, view.dispatch)
    view.focus()
  }
  strikeBtn.onclick = () => {
    toggleMark(schema.marks.strike)(view.state, view.dispatch)
    view.focus()
  }
  /** Les opérations de structure d'un tableau ne passent pas par le suivi
   * des modifications : comme les changements de niveau de titre ou de
   * liste, ce sont des changements de nœuds, que l'architecture actuelle ne
   * sait pas marquer. D'où le méta d'échappement — et la réservation aux
   * éditeurs, décidée dans l'étude. */
  function commandeTableau(commande) {
    return () => {
      commande(view.state, (tr) => view.dispatch(tr.setMeta('trackChangesInternal', true)))
      view.focus()
    }
  }

  tableBtn.onclick = () => {
    // `table_cell`, pas `cell` : ce sont les noms que produit tableNodes()
    // (table, table_row, table_cell, table_header). La première version
    // visait `cell`, donc `undefined`, et le clic ne faisait rien du tout.
    const { table_cell, table_row, table } = schema.nodes
    const cellule = () => table_cell.createAndFill()
    const ligne = () => table_row.create({}, [cellule(), cellule(), cellule()])
    view.dispatch(
      view.state.tr
        .replaceSelectionWith(table.create({}, [ligne(), ligne(), ligne()]))
        .setMeta('trackChangesInternal', true)
        .scrollIntoView()
    )
    view.focus()
  }

  rowAddBtn.onclick = commandeTableau(addRowAfter)
  rowDelBtn.onclick = commandeTableau(deleteRow)
  colAddBtn.onclick = commandeTableau(addColumnAfter)
  colDelBtn.onclick = commandeTableau(deleteColumn)
  tableDelBtn.onclick = commandeTableau(deleteTable)

  orderedListBtn.onclick = () => {
    toggleList(schema.nodes.ordered_list, schema.nodes.list_item)(view.state, view.dispatch)
    view.focus()
  }

  taskListBtn.onclick = () => {
    toggleList(schema.nodes.task_list, schema.nodes.task_item)(view.state, view.dispatch)
    view.focus()
  }

  listBtn.onclick = () => {
    toggleList(schema.nodes.bullet_list, schema.nodes.list_item)(view.state, view.dispatch)
    view.focus()
  }
  quoteBtn.onclick = () => {
    toggleWrap(schema.nodes.blockquote)(view.state, view.dispatch)
    view.focus()
  }
  tocBtn.onclick = () => {
    insererTable(view.state, view.dispatch)
    view.focus()
  }
  hrBtn.onclick = () => {
    // replaceSelectionWith se charge de trouver un point d'insertion valide
    // (ex. couper le paragraphe en deux si le curseur est au milieu d'un
    // texte) — même mécanisme que le menu "Horizontal rule" standard de
    // prosemirror-example-setup.
    const tr = view.state.tr.replaceSelectionWith(schema.nodes.horizontal_rule.create())
    const after = tr.selection.to
    if (!tr.doc.resolve(after).nodeAfter) {
      // La ligne se retrouve en toute fin de document : sans paragraphe
      // après elle, la prochaine frappe devrait d'abord créer ce
      // paragraphe elle-même — une édition structurelle, donc non suivie
      // par trackChanges.js (voir la note dans schema.js), ce qui ferait
      // perdre le suivi du tout premier texte tapé après la ligne. On crée
      // ce paragraphe vide tout de suite à la place, pour que la frappe
      // suivante soit une simple insertion de texte, suivie normalement.
      tr.insert(after, schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, after + 1))
    }
    view.dispatch(tr)
    view.focus()
  }
  exportMdItem.onclick = () => {
    menuPartage.fermer()
    const markdown = docToMarkdown(docAExporter())
    downloadText(markdown, markdownFilename(titleInput.value))
  }
  exportDocxItem.onclick = async () => {
    menuPartage.fermer()
    // Toujours re-demander la feuille de style (jamais la copie chargée au
    // montage) : l'admin a pu la changer sur "Mise en page" depuis, un
    // export doit refléter ce qui est enregistré maintenant — même
    // principe que l'export PDF juste en dessous. Import dynamique
    // (Vite en fait un chunk séparé) : la bibliothèque `docx` n'est
    // chargée que si quelqu'un clique vraiment sur "Word (.docx)", pas au
    // chargement initial de l'éditeur.
    const [{ style }, { downloadDocx }] = await Promise.all([loadDocStyle(docId), import('./docxExport.js')])
    await downloadDocx(docAExporter(), style, titleInput.value)
  }
  exportPdfItem.onclick = async () => {
    menuPartage.fermer()
    // Le PDF sort désormais d'un vrai moteur de composition, côté serveur
    // (voir claude/proto-export-pdf-typst-pagedjs.md) : notes de bas de
    // page, césures françaises, table des matières paginée et recto-verso
    // deviennent possibles, et l'export fonctionne enfin depuis un
    // téléphone. On relit toujours la mise en page plutôt que d'utiliser la
    // copie chargée au montage : elle a pu changer depuis.
    exportPdfItem.disabled = true
    const libelle = exportPdfItem.textContent
    exportPdfItem.textContent = 'Composition…'
    try {
      const [{ style }, { downloadTypstPdf }] = await Promise.all([
        loadDocStyle(docId),
        import('./typstExport.js'),
      ])
      await downloadTypstPdf(docAExporter(), style, titleInput.value, docId)
    } catch (err) {
      messageFugace(err.message || "le PDF n'a pas pu être composé", { erreur: true })
    } finally {
      exportPdfItem.disabled = false
      exportPdfItem.textContent = libelle
    }
  }
  headingSelect.onchange = () => {
    if (headingSelect.value === '') {
      setBlockType(schema.nodes.paragraph)(view.state, view.dispatch)
    } else {
      setBlockType(schema.nodes.heading, { level: Number(headingSelect.value) })(view.state, view.dispatch)
    }
    view.focus()
  }

  mountAIPanel(aiSection, () => view, { docId, canUseAI: docMeta.myRole !== 'correcteur' })
  const comments = mountCommentsPanel(commentsSection, ydoc, commentsMap, () => view, user)

  function mkButton(label, title) {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.title = title
    btn.className = 'btn-tool'
    btn.type = 'button'
    return btn
  }

  // --- L'interface téléphone (22/09/2026, voir iphone.js). Montée en
  // dernier : elle ne construit presque rien, elle replace et masque ce qui
  // précède. Rejouée au changement de largeur, parce qu'un téléphone qu'on
  // tourne et un iPad qui sort de Split View changent de largeur sans
  // recharger la page.
  let telephone = null
  function ajusterTelephone() {
    const petit = petitEcranMedia.matches
    if (petit && !telephone) {
      telephone = monterInterfaceTelephone({
        racine: shell,
        topBanner,
        titleInput,
        toolbar,
        outlineSidebar,
        trackToggleLabel,
        getView: () => view,
        estCorrecteur: () => docMeta.myRole === 'correcteur',
        nbCommentaires: () => commentairesAncres(commentsMap).length,
        // Les deux gestes de frappe qui montent dans l'en-tête du
        // téléphone. Ce sont les boutons eux-mêmes : ils y gardent leur
        // état actif et reviennent dans la barre en quittant l'écriture.
        outilsEssentiels: [boldBtn, italicBtn],
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
    // L'interrupteur du suivi vit dans le menu ⋯ sur téléphone, et en tête
    // de la colonne de droite ailleurs : `placerLeSuivi` n'a plus à s'en
    // occuper ici, le menu le prend au moment où il s'ouvre.
    if (!petit) placerLeSuivi()
  }
  ajusterTelephone()
  if (petitEcranMedia.addEventListener) petitEcranMedia.addEventListener('change', ajusterTelephone)

  return {
    destroy() {
      if (telephone) telephone.demonter()
      view.destroy()
      provider.destroy()
      presence.destroy()
      comments.destroy()
    },
    view,
    user,
  }
}

// TEMPORAIRE (campagne de tests de charge, a retirer une fois terminee) :
// expose la fonction de montage elle-meme (pour monter plusieurs
// "utilisateurs" simules dans un seul onglet, sans ouvrir autant de vrais
// onglets) et les fonctions de suivi des modifications necessaires pour
// scripter accepter/rejeter en masse.
window.__debugMountEditor = mountEditor
window.__debugListChanges = listChanges
window.__debugAcceptChange = acceptChange
window.__debugRejectChange = rejectChange
