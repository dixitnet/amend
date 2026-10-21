// Les deux réglages d'affichage de la colonne du texte, sortis d'editor.js
// (point 46 de la feuille de route, 11/10/2026) : le zoom et les numéros de
// bloc. Des conforts de lecture, propres à cette personne et à ce navigateur
// (localStorage) : ils ne touchent ni au document ni à ce qui en sortira.

/** Crée le sélecteur de zoom et le bouton « # » (numéros de bloc), les
 * applique à `editorContainer` et renvoie les deux éléments, à placer par
 * l'appelant. `mkButton(libelle, titre)` fabrique un bouton de barre
 * d'outils. */
export function monterReglagesAffichage(editorContainer, mkButton) {
  const zoomSelect = document.createElement('select')
  zoomSelect.className = 'zoom-select'
  zoomSelect.title = "Facteur d'agrandissement du texte"
  zoomSelect.setAttribute('aria-label', "Facteur d'agrandissement du texte")
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
  // Les numéros de bloc (02/10/2026). Le numéro que Claude donne à un bloc
  // quand il relit le document (`plan`, `lire`) — pour dire « relis le
  // bloc 42 » ou comprendre « bloc 17 » dans un de ses commentaires. Un
  // confort d'affichage, comme le zoom : propre à cette personne et à ce
  // navigateur (localStorage), éteint par défaut, absent du document comme
  // de tout export. Le comptage lui-même est fait par la feuille de style
  // (compteur CSS, voir `.numeros-blocs` dans style.css) : rien à recalculer
  // à la frappe.
  const numerosBtn = mkButton('#', '')
  numerosBtn.classList.add('btn-numeros')
  let numerosActifs = false
  try {
    numerosActifs = localStorage.getItem('collabtext:numeros-blocs') === '1'
  } catch {
    // localStorage indisponible : éteint, comme au départ.
  }
  const poserLesNumeros = (actif) => {
    numerosActifs = actif
    editorContainer.classList.toggle('numeros-blocs', actif)
    numerosBtn.setAttribute('aria-pressed', String(actif))
    numerosBtn.title = actif
      ? 'Masquer les numéros de bloc'
      : 'Afficher les numéros de bloc (ceux que Claude voit en relisant le document)'
  }
  poserLesNumeros(numerosActifs)
  numerosBtn.addEventListener('click', () => {
    poserLesNumeros(!numerosActifs)
    try {
      localStorage.setItem('collabtext:numeros-blocs', numerosActifs ? '1' : '0')
    } catch {
      // tant pis, le réglage ne sera pas mémorisé la prochaine fois.
    }
  })

  return { zoomSelect, numerosBtn }
}
