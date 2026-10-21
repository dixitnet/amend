// La barre de mise en forme : ses boutons, ses trois groupes et ses onglets
// (point 23 de la feuille de route, 13/10/2026 : sortie de `mountEditor`).
//
// Réorganisée le 13/10/2026 sur le modèle de Google Docs et de Word, en trois
// zones que des filets séparent : **la mise en forme** (annuler, style,
// B I U S, listes), **l'insertion** (le lien, et un menu « Insérer ▾ » qui
// porte tout le reste), **la révision** (le suivi, le commentaire, le
// parcours des modifications) avec, tout à droite, **l'affichage** (numéros
// de bloc, zoom). Les boutons d'un tableau ne vivent plus en permanence dans
// la barre : ils forment une rangée qui n'apparaît que dans un tableau.
// Sur téléphone, rien de cela n'existe : les mêmes boutons sont aplatis dans
// les trois onglets (Format, Insérer, Relire), voir style.css.
//
// Ce module **construit** la barre, il ne la câble pas : les gestes sont dans
// commandesBarre.js, et `editor.js` assigne les `onclick` une fois la vue
// construite. La relecture au doigt et le bouton « Commentaire » (qui ont
// besoin de la vue et des commentaires) viennent s'ajouter dans le groupe
// « Relire » de l'appelant.

import { svgIcone } from './interface/icones.js'

export function mkButton(label, title) {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.title = title
  btn.className = 'btn-tool'
  btn.type = 'button'
  return btn
}

/** Un bouton dessiné par une icône (21/10/2026, esthétique de la vue V1) :
 * le titre reste l'infobulle et devient le nom du bouton pour les lecteurs
 * d'écran. */
export function boutonIcone(nom, title) {
  const btn = mkButton('', title)
  btn.innerHTML = svgIcone(nom, 18)
  btn.setAttribute('aria-label', title)
  btn.classList.add('btn-icone')
  return btn
}

/**
 * @param {object} options
 * @param {object} options.cap  les capacités de la personne sur ce document
 * @param {Function} options.menuDeroulant  la fabrique de menus du bandeau (`creerFabriqueMenus`)
 */
export function creerBarreOutils({ cap, menuDeroulant }) {
  // Formatting palette only — stays in the middle (text) column, above the
  // scrolling editor-container (so it never scrolls away), rather than
  // spanning the full page width like the banner above.
  const toolbar = document.createElement('div')
  toolbar.className = 'format-toolbar'

  const headingSelect = document.createElement('select')
  headingSelect.className = 'heading-select'
  headingSelect.title = 'Style de paragraphe'
  headingSelect.setAttribute('aria-label', 'Style de paragraphe')
  for (const [label, value] of [
    ['Paragraphe', ''],
    ['Titre 1', '1'],
    ['Titre 2', '2'],
    ['Titre 3', '3'],
    // Après les trois niveaux (14/10/2026) : deux styles de paragraphe, hors
    // plan et table des matières. Mêmes noms que dans la feuille de style.
    ['Titre', 'titre'],
    ['Sous-titre', 'sous-titre'],
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

  // Un filet entre deux ensembles de boutons d'une même zone. Absent du
  // téléphone, où chaque groupe est un onglet à lui seul.
  const filet = () => {
    const f = document.createElement('span')
    f.className = 'barre-filet'
    f.setAttribute('aria-hidden', 'true')
    return f
  }

  // --- Mise en forme -------------------------------------------------------
  // Annuler et rétablir (13/10/2026) : les raccourcis existaient, pas les
  // boutons — c'est le premier geste qu'on cherche dans Docs ou Word.
  // Les lettres françaises (21/10/2026) : G gras, I italique, S souligné ; le
  // barré est dessiné « abc », comme dans Docs en français.
  const undoBtn = boutonIcone('annuler', 'Annuler (Ctrl/⌘+Z)')
  const redoBtn = boutonIcone('retablir', 'Rétablir (Ctrl/⌘+Y)')
  const boldBtn = mkButton('G', 'gras (Ctrl-B)')
  boldBtn.classList.add('btn-gras')
  const italicBtn = mkButton('I', 'italique (Ctrl-I)')
  italicBtn.classList.add('btn-italique')
  const underlineBtn = mkButton('S', 'souligné (Ctrl-U)')
  underlineBtn.style.textDecoration = 'underline'
  const strikeBtn = mkButton('abc', 'barré')
  strikeBtn.style.textDecoration = 'line-through'
  strikeBtn.classList.add('btn-barre')
  // La citation est un **style de paragraphe**, pas un objet qu'on insère
  // (13/10/2026, demande de Sylvain) : elle se range avec le gras, l'italique,
  // le souligné et le barré, et s'allume quand le curseur est dans une citation.
  const quoteBtn = mkButton('“', 'Citation : met le paragraphe en citation, ou l’en sort')
  quoteBtn.classList.add('btn-citation')
  quoteBtn.setAttribute('aria-pressed', 'false')
  const listBtn = boutonIcone('liste', 'liste à tirets')
  const orderedListBtn = boutonIcone('listeNumerotee', 'liste numérotée')
  const taskListBtn = boutonIcone('listeCoches', 'liste à cocher')
  groupeTexte2.append(
    undoBtn,
    redoBtn,
    filet(),
    headingSelect,
    filet(),
    boldBtn,
    italicBtn,
    underlineBtn,
    strikeBtn,
    quoteBtn,
    filet(),
    listBtn,
    orderedListBtn,
    taskListBtn
  )

  // --- Insertion -----------------------------------------------------------
  // Le lien reste un bouton à part (30/09/2026, réservé à qui écrit
  // librement, voir liens.js) : c'est le plus fréquent. Tout le reste est dans
  // « Insérer ▾ », où chaque entrée dit ce qu'elle fait en toutes lettres.
  const lienBtn = boutonIcone('lien', 'Ajouter ou modifier un lien (Ctrl/⌘+K)')
  if (!cap.canEditFreely) lienBtn.hidden = true
  const noteBtn = mkButton('Note de bas de page', 'Insérer une note ici (Ctrl/⌘+Alt+F)')
  const ligneBtn = mkButton('Ligne de séparation', 'Insérer un trait horizontal')
  const sautBtn = mkButton('Saut de page', 'Insérer un saut de page (PDF et Word)')
  // La table des matières se pose dans le texte, là où le curseur est :
  // c'est ce qui la distingue d'une option de mise en page (20/09/2026).
  const tocBtn = mkButton('Table des matières', 'Insérer une table des matières ici')
  const tableBtn = mkButton('Tableau 3 × 3', 'insérer un tableau de 3 lignes sur 3 colonnes')
  for (const b of [noteBtn, ligneBtn, sautBtn, tocBtn, tableBtn]) b.classList.add('btn-texte', 'btn-insertion')
  const menuInsertion = menuDeroulant('Insérer ▾', {
    classe: 'menu-insertion',
    titre: 'Insérer une note, un tableau, une ligne…',
  })
  // Une liste qui s'ouvre vers la droite : le menu est dans la barre, pas
  // au bord du bandeau.
  menuInsertion.liste.classList.remove('menu-flottant-droite')
  menuInsertion.liste.classList.add('menu-insertion-liste')
  menuInsertion.liste.append(noteBtn, ligneBtn, sautBtn, tocBtn, tableBtn)
  // Choisir une entrée referme le menu.
  menuInsertion.liste.addEventListener('click', (e) => {
    if (e.target.closest('button')) menuInsertion.fermer()
  })
  groupeInserer.append(lienBtn, menuInsertion.el)

  // --- Tableau (rangée contextuelle) ---------------------------------------
  // Les commandes de structure n'apparaissent que lorsque le curseur est dans
  // un tableau (voir syncTableButtons dans editor.js). Tout ce groupe est
  // réservé aux éditeurs — voir claude/etude-tableaux-images.md : supprimer
  // une ligne fait disparaître son contenu sans laisser de trace dans le
  // suivi des modifications, ce qu'on ne confie pas à un correcteur.
  const rowAddBtn = mkButton('Ligne +', 'ajouter une ligne sous celle du curseur')
  const rowDelBtn = mkButton('Ligne −', 'supprimer la ligne du curseur')
  const colAddBtn = mkButton('Col. +', 'ajouter une colonne à droite de celle du curseur')
  const colDelBtn = mkButton('Col. −', 'supprimer la colonne du curseur')
  const tableDelBtn = mkButton('Suppr. tableau', 'supprimer tout le tableau')
  // `.btn-tool` est un carré de 30 px, pensé pour B/I/U : les boutons de
  // tableau portent des mots, ils ont donc besoin de la variante texte.
  for (const b of [rowAddBtn, rowDelBtn, colAddBtn, colDelBtn, tableDelBtn]) {
    b.classList.add('btn-texte')
  }
  const tableGroup = document.createElement('span')
  tableGroup.className = 'table-group'
  const tableEtiquette = document.createElement('span')
  tableEtiquette.className = 'table-group-etiquette'
  tableEtiquette.textContent = 'Tableau'
  tableGroup.append(tableEtiquette, rowAddBtn, rowDelBtn, colAddBtn, colDelBtn, tableDelBtn)
  groupeInserer.append(tableGroup)

  // Les onglets : une rangée d'étiquettes qui n'apparaît qu'en bas d'écran.
  const onglets = document.createElement('div')
  onglets.className = 'barre-onglets'
  const boutonsOnglet = {}
  for (const [cle, libelle] of [
    ['texte', 'Format'],
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
    menuInsertion,
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
      rowAddBtn,
      rowDelBtn,
      colAddBtn,
      colDelBtn,
      tableDelBtn,
    },
    tableGroup,
  }
}
