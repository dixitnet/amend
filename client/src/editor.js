import * as Y from 'yjs'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands'
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
  selectionHighlightPlugin,
} from './trackChanges.js'
import { mountChangesPanel } from './changesPanel.js'
import { mountAIPanel } from './aiPanel.js'
import { commentsPlugin, mountCommentsPanel } from './comments.js'
import { mountOutlinePanel } from './outline.js'
import { mountWordCount } from './wordcount.js'
import { docToMarkdown, markdownFilename, downloadText } from './mdExport.js'
import { mountTkMarker } from './tkMarker.js'
import { mountPresenceBar } from './presence.js'
import { loadStyle, buildStyleCss } from './styleConfig.js'
import { printDocument } from './pdfExport.js'

function buildCursor(user) {
  const cursor = document.createElement('span')
  cursor.classList.add('remote-cursor')
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

  const backLink = document.createElement('a')
  backLink.href = '#/'
  backLink.className = 'back-link'
  backLink.textContent = '← Documents'
  topBanner.appendChild(backLink)

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
  topBanner.appendChild(starBtn)

  const titleInput = document.createElement('input')
  titleInput.className = 'doc-title'
  titleInput.value = docMeta.title
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
  topBanner.appendChild(titleInput)

  // "Qui est connecté" — filled in once `provider` exists, below.
  const presenceContainer = document.createElement('div')
  topBanner.appendChild(presenceContainer)

  const wordCount = document.createElement('span')
  wordCount.className = 'word-count'
  topBanner.appendChild(wordCount)

  const tkCount = document.createElement('span')
  tkCount.className = 'tk-count'
  topBanner.appendChild(tkCount)

  const exportBtn = document.createElement('button')
  exportBtn.type = 'button'
  exportBtn.className = 'btn-preset export-btn'
  exportBtn.textContent = 'Exporter (.md)'
  topBanner.appendChild(exportBtn)

  const exportPdfBtn = document.createElement('button')
  exportPdfBtn.type = 'button'
  exportPdfBtn.className = 'btn-preset export-btn'
  exportPdfBtn.textContent = 'Exporter (.pdf)'
  topBanner.appendChild(exportPdfBtn)

  const status = document.createElement('span')
  status.className = 'connection-status'
  topBanner.appendChild(status)

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
    ['Titre 4', '4'],
    ['Titre 5', '5'],
  ]) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    headingSelect.appendChild(opt)
  }
  toolbar.appendChild(headingSelect)

  const boldBtn = mkButton('B', 'gras (Ctrl-B)')
  const italicBtn = mkButton('I', 'italique (Ctrl-I)')
  const underlineBtn = mkButton('U', 'souligné (Ctrl-U)')
  underlineBtn.style.textDecoration = 'underline'
  const strikeBtn = mkButton('S', 'barré')
  strikeBtn.style.textDecoration = 'line-through'
  const listBtn = mkButton('–', 'liste à tirets')
  const quoteBtn = mkButton('”', 'citation')
  const hrBtn = mkButton('—', 'Insérer une ligne (devient un saut de page à l’export PDF)')
  toolbar.append(boldBtn, italicBtn, underlineBtn, strikeBtn, listBtn, quoteBtn, hrBtn)

  main.appendChild(toolbar)

  const editorContainer = document.createElement('div')
  editorContainer.className = 'editor-container'
  main.appendChild(editorContainer)

  // Facteur d'agrandissement (50/100/150%) : un confort de lecture propre à
  // chaque personne/navigateur, donc mémorisé dans le localStorage (même
  // principe que le nom/couleur dans user.js) plutôt que synchronisé via
  // Yjs — ça n'a rien d'un réglage du document. `zoom` plutôt que
  // `transform: scale()` : ça reste pleinement pris en compte dans la mise
  // en page (défilement, `coordsAtPos`, clics) exactement comme un zoom de
  // navigateur, alors qu'un `transform` demanderait de compenser la taille
  // et casserait le calcul de défilement centré déjà fait pour le panneau
  // des modifications/commentaires (changesPanel.js/comments.js) et le
  // panneau "Plan du document" (outline.js).
  const zoomSelect = document.createElement('select')
  zoomSelect.className = 'zoom-select'
  zoomSelect.title = "Facteur d'agrandissement du texte"
  for (const pct of ['50', '100', '150']) {
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
  zoomSelect.value = storedZoom
  editorContainer.style.zoom = `${storedZoom}%`
  zoomSelect.addEventListener('change', () => {
    editorContainer.style.zoom = `${zoomSelect.value}%`
    try {
      localStorage.setItem('collabtext:zoom', zoomSelect.value)
    } catch {
      // tant pis, le réglage ne sera pas mémorisé la prochaine fois.
    }
  })
  topBanner.insertBefore(zoomSelect, exportBtn)

  // Track-changes toggle lives with the assistance/changes column now — it
  // governs how edits in the text get recorded, same family of concerns as
  // the AI suggestions and the changes list right below it.
  const trackToggleSection = document.createElement('div')
  trackToggleSection.className = 'sidebar-section track-toggle-section'
  const trackToggleLabel = document.createElement('label')
  trackToggleLabel.className = 'track-toggle'
  const trackToggle = document.createElement('input')
  trackToggle.type = 'checkbox'
  trackToggle.checked = true
  trackToggleLabel.append(trackToggle, document.createTextNode(' Suivi des modifications'))
  trackToggleSection.appendChild(trackToggleLabel)

  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'
  const aiSection = document.createElement('div')
  aiSection.className = 'sidebar-section ai-section'
  const changesSection = document.createElement('div')
  changesSection.className = 'sidebar-section changes-section'
  const commentsSection = document.createElement('div')
  commentsSection.className = 'sidebar-section comments-section'
  sidebar.append(trackToggleSection, aiSection, changesSection, commentsSection)

  const outlineSidebar = document.createElement('div')
  outlineSidebar.className = 'outline-sidebar'
  const outlineSection = document.createElement('div')
  outlineSection.className = 'sidebar-section outline-section'
  outlineSidebar.appendChild(outlineSection)

  layout.append(outlineSidebar, main, sidebar)
  shell.append(topBanner, layout)
  root.appendChild(shell)

  // Light in-editor preview of the shared feuille de style ("Mise en
  // page", see adminStyle.js/styleConfig.js) — font, size, gras,
  // majuscules, alignement, espacement. Deliberately partial: no souligné
  // (would look identical to a pending tracked insertion) and no page
  // size/margins (meaningless in a scrolling editor) — those only apply at
  // export/PDF time, see exportPdfBtn below.
  const editorStyleTag = document.createElement('style')
  shell.appendChild(editorStyleTag)
  loadStyle().then((style) => {
    editorStyleTag.textContent = buildStyleCss(style, { scope: '.ProseMirror' })
  })

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
  function renderConnectionStatus() {
    status.classList.toggle('online', provider.connected)
    status.classList.toggle('pending', !provider.connected && provider.hasPendingLocalChanges)
    if (!provider.connected) {
      status.textContent = provider.hasPendingLocalChanges
        ? '○ hors connexion — modifications non envoyées'
        : '○ reconnexion…'
    } else if (provider.saving) {
      status.textContent = '● enregistrement…'
    } else {
      status.textContent = '● à jour'
    }
  }
  provider.addEventListener('status', renderConnectionStatus)
  renderConnectionStatus()

  // Live title sync between rédacteurs (correctif 4.1.1) — never overwrite
  // what the local person is actively typing themselves.
  provider.addEventListener('title', (e) => {
    if (document.activeElement !== titleInput) titleInput.value = e.detail.title
  })

  const presence = mountPresenceBar(presenceContainer, provider)

  const state = EditorState.create({
    schema,
    plugins: [
      ySyncPlugin(yXml),
      yCursorPlugin(provider.awareness, { cursorBuilder: buildCursor }),
      yUndoPlugin(),
      trackChangesPlugin(),
      selectionHighlightPlugin(),
      commentsPlugin(ydoc, commentsMap),
      mountChangesPanel(changesSection),
      mountOutlinePanel(outlineSection),
      mountWordCount(wordCount),
      mountTkMarker(tkCount),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Mod-u': toggleMark(schema.marks.underline),
        // Falls through to the plain Enter/baseKeymap handling below
        // whenever the cursor isn't inside a list item.
        Enter: splitListItem(schema.nodes.list_item),
        'Mod-]': sinkListItem(schema.nodes.list_item),
        'Mod-[': liftListItem(schema.nodes.list_item),
      }),
      keymap(baseKeymap),
      dropCursor(),
      gapCursor(),
    ],
  })

  const view = new EditorView(editorContainer, { state })
  // dispatchTransaction needs a reference to `view` itself, so it's wired
  // up right after construction rather than passed in the initial props.
  view.setProps({ dispatchTransaction: makeDispatchTransaction(view, () => user) })

  trackToggle.addEventListener('change', () => {
    setTrackChangesEnabled(view, trackToggle.checked)
  })
  // Keep the checkbox in sync if the plugin state ever changes elsewhere.
  const syncToggle = () => {
    trackToggle.checked = isTrackChangesEnabled(view.state)
  }
  syncToggle()

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
  listBtn.onclick = () => {
    toggleList(schema.nodes.bullet_list, schema.nodes.list_item)(view.state, view.dispatch)
    view.focus()
  }
  quoteBtn.onclick = () => {
    toggleWrap(schema.nodes.blockquote)(view.state, view.dispatch)
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
  exportBtn.onclick = () => {
    const markdown = docToMarkdown(view.state.doc)
    downloadText(markdown, markdownFilename(titleInput.value))
  }
  exportPdfBtn.onclick = async () => {
    // Always re-fetch (never the copy loaded at mount time): the admin may
    // have changed the feuille de style on "Mise en page" since this editor
    // was opened, and an export should reflect what's saved now.
    const style = await loadStyle()
    printDocument(view.state.doc, titleInput.value, style)
  }
  headingSelect.onchange = () => {
    if (headingSelect.value === '') {
      setBlockType(schema.nodes.paragraph)(view.state, view.dispatch)
    } else {
      setBlockType(schema.nodes.heading, { level: Number(headingSelect.value) })(view.state, view.dispatch)
    }
    view.focus()
  }

  mountAIPanel(aiSection, () => view)
  const comments = mountCommentsPanel(commentsSection, ydoc, commentsMap, () => view, user)

  function mkButton(label, title) {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.title = title
    btn.className = 'btn-tool'
    btn.type = 'button'
    return btn
  }

  return {
    destroy() {
      view.destroy()
      provider.destroy()
      presence.destroy()
      comments.destroy()
    },
  }
}
