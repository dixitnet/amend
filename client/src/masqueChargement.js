// Le masque de chargement d'un document (23/09/2026), sorti d'editor.js
// (point 46 de la feuille de route, 11/10/2026).
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

export function monterMasqueChargement(editorContainer, provider) {
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
}
