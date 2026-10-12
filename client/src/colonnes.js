// Les deux colonnes latérales d'un document (point 23 de la feuille de route,
// 13/10/2026 : sorties de `mountEditor`) : le plan à gauche, et à droite les
// panneaux de relecture (corrections IA, modifications, commentaires) sous
// l'interrupteur du suivi. Ce sont des conteneurs vides : les panneaux
// viennent s'y monter, et la disposition vient de style.css.

/** La colonne de droite. L'en-tête ne défile pas : l'interrupteur du suivi
 * doit être là quoi qu'on ait fait défiler en dessous. */
export function creerColonneDroite(trackToggleLabel) {
  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'
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
  return { sidebar, suiviEntete, aiSection, changesSection, commentsSection }
}

/** La colonne du plan, à gauche. */
export function creerColonnePlan() {
  const outlineSidebar = document.createElement('div')
  outlineSidebar.className = 'outline-sidebar'
  const outlineSection = document.createElement('div')
  outlineSection.className = 'sidebar-section outline-section'
  outlineSidebar.appendChild(outlineSection)
  return { outlineSidebar, outlineSection }
}
