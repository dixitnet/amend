// Les deux colonnes latérales d'un document (point 23 de la feuille de route,
// 13/10/2026 : sorties de `mountEditor`) : le plan à gauche, et à droite les
// panneaux de relecture. Ce sont des conteneurs vides : les panneaux viennent
// s'y monter, et la disposition vient de style.css.

/** La colonne de droite (14/10/2026, demande de Sylvain). **Une partie fixe,
 * qui ne défile jamais** : « Corrections IA », puis l'interrupteur du suivi
 * des modifications, puis le parcours des modifications (‹ n / N › Accepter
 * Rejeter) — le suivi est l'état le plus important de l'éditeur, et le
 * parcours le geste qu'on répète : ni l'un ni l'autre ne doivent sortir de
 * l'écran. **Une partie qui défile** : la liste des modifications, puis les
 * commentaires. `zoneRelecture` reçoit la barre de relecture (c'est
 * `editor.js` qui la place, ou la déménage sur téléphone). */
export function creerColonneDroite(trackToggleLabel) {
  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'
  const sidebarFixe = document.createElement('div')
  sidebarFixe.className = 'sidebar-fixe'
  const aiSection = document.createElement('div')
  aiSection.className = 'sidebar-section ai-section'
  const suiviEntete = document.createElement('div')
  suiviEntete.className = 'suivi-entete'
  suiviEntete.appendChild(trackToggleLabel)
  const zoneRelecture = document.createElement('div')
  zoneRelecture.className = 'zone-relecture'
  sidebarFixe.append(aiSection, suiviEntete, zoneRelecture)
  const sidebarCorps = document.createElement('div')
  sidebarCorps.className = 'sidebar-corps'
  const changesSection = document.createElement('div')
  changesSection.className = 'sidebar-section changes-section'
  const commentsSection = document.createElement('div')
  commentsSection.className = 'sidebar-section comments-section'
  sidebarCorps.append(changesSection, commentsSection)
  sidebar.append(sidebarFixe, sidebarCorps)
  return { sidebar, suiviEntete, zoneRelecture, aiSection, changesSection, commentsSection }
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
