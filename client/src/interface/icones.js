// Le jeu d'icônes de l'interface (21/10/2026, couche 0 de
// claude/architecture-interface-trois-plateformes.md, §8.2).
//
// Des SVG en ligne, sur une grille de 24 px, trait de 1,8 px, couleur
// `currentColor` : ils se dessinent de la même façon sur macOS, iPadOS,
// Windows et Android, ce que ne font ni les émojis (✏️ 💬, remplacés ici) ni
// les glyphes Unicode. Une icône est toujours décorative (`aria-hidden`) :
// c'est le bouton qui la porte qui dit ce qu'il fait.

const TRACES = {
  plan: '<path d="M4 6h16M8 12h12M8 18h12"/>',
  dossier: '<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  etincelle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  crayon: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  bulle: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  gauche: '<path d="M15 6l-6 6 6 6"/>',
  droite: '<path d="M9 6l6 6-6 6"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  annuler: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  retablir: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  liste:
    '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9"/><circle cx="4.5" cy="12" r=".9"/><circle cx="4.5" cy="18" r=".9"/>',
  listeNumerotee:
    '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1v5M3.5 14.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2-3 3.5h3"/>',
  listeCoches:
    '<path d="M11 6h9M11 12h9M11 18h9"/><path d="M3.5 6l1.5 1.5L8 4.5M3.5 12l1.5 1.5L8 10.5M3.5 18l1.5 1.5L8 16.5"/>',
  lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  plus: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  descendre: '<path d="M6 9l6 6 6-6"/>',
  // Pages d'accueil (21/10/2026)
  etoile: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>',
  recherche: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>',
  corbeille: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5"/>',
  aide: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.8M12 16.8v.2"/>',
  ajouter: '<path d="M12 5v14M5 12h14"/>',
  dossierPlus:
    '<path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
  modeles: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
}

/** Les noms disponibles. */
export const NOMS_ICONES = Object.keys(TRACES)

/** Le balisage SVG d'une icône, prêt à poser par `innerHTML`. */
export function svgIcone(nom, taille = 18) {
  const trace = TRACES[nom]
  if (!trace) throw new Error(`Icône inconnue : ${nom}`)
  return (
    `<svg class="icone icone-${nom}" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${trace}</svg>`
  )
}

/** Un élément SVG, pour l'ajouter avec `append`. */
export function icone(nom, taille = 18) {
  const gabarit = document.createElement('template')
  gabarit.innerHTML = svgIcone(nom, taille)
  return gabarit.content.firstElementChild
}
