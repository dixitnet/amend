// La barre de mise en forme : ses boutons, ses trois groupes et ses onglets
// (point 23 de la feuille de route, 13/10/2026 : sortie de `mountEditor`).
//
// Ce module **construit** la barre, il ne la câble pas : les gestes sont dans
// commandesBarre.js, et `editor.js` assigne les `onclick` une fois la vue
// construite. La relecture au doigt et le bouton « Commentaire » (qui ont
// besoin de la vue et des commentaires) viennent s'ajouter dans le groupe
// « Relire » de l'appelant.

export function mkButton(label, title) {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.title = title
  btn.className = 'btn-tool'
  btn.type = 'button'
  return btn
}

/**
 * @param {object} options
 * @param {object} options.cap  les capacités de la personne sur ce document
 */
export function creerBarreOutils({ cap }) {
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
  // Une note (28/09/2026) : ouverte à qui peut écrire, correcteur compris —
  // en suivi, elle naît proposée.
  const noteBtn = mkButton('Note', 'Insérer une note ici (Ctrl/⌘+Alt+F)')
  noteBtn.classList.add('btn-texte')
  groupeTexte2.append(boldBtn, italicBtn, underlineBtn, strikeBtn, listBtn, orderedListBtn, taskListBtn)
  // Un lien (30/09/2026) : réservé à qui écrit librement, voir liens.js.
  const lienBtn = mkButton('Lien', 'Ajouter ou modifier un lien (Ctrl/⌘+K)')
  lienBtn.classList.add('btn-texte')
  if (!cap.canEditFreely) lienBtn.hidden = true
  groupeInserer.append(quoteBtn, hrBtn, lienBtn, noteBtn, tocBtn)

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

  return {
    toolbar,
    headingSelect,
    groupeTexte2,
    groupeInserer,
    groupeRelire,
    onglets,
    boutons: {
      boldBtn,
      italicBtn,
      underlineBtn,
      strikeBtn,
      listBtn,
      orderedListBtn,
      taskListBtn,
      quoteBtn,
      hrBtn,
      tocBtn,
      noteBtn,
      lienBtn,
      tableBtn,
      rowAddBtn,
      rowDelBtn,
      colAddBtn,
      colDelBtn,
      tableDelBtn,
    },
    tableGroup,
  }
}
