// Les deux colonnes latérales d'un document (point 23 de la feuille de route,
// 13/10/2026 : sorties de `mountEditor`) : le plan à gauche, et à droite les
// panneaux de relecture. Ce sont des conteneurs vides : les panneaux viennent
// s'y monter, et la disposition vient de style.css.

/** La colonne de droite. Depuis le 21/10/2026 (lot L1, claude/vues-reference-formats.md),
 * un **volet à deux onglets**, coiffé de sa rangée d'onglets (interface/volets.js) :
 *
 *   Modifications — une partie fixe, qui ne défile jamais (le parcours des
 *                   modifications ‹ n / N › Accepter Rejeter), et une partie
 *                   qui défile (la liste des modifications, puis les
 *                   commentaires) ;
 *   Margo         — le dialogue, qui n'est plus une palette flottante.
 *
 * Corrections IA n'a plus de panneau (21/10/2026, décision de Sylvain) : ses
 * consignes se lancent depuis la bulle de sélection. `aiSection` reste un
 * conteneur, jamais affiché, où le module garde son état (limites, messages).
 *
 * L'interrupteur du suivi n'est plus ici : il est revenu dans la barre
 * d'édition (décision D1 du 21/10/2026). `suiviEntete` reste son conteneur,
 * que `editor.js` pose au bout de la barre. `zoneRelecture` reçoit la barre de
 * relecture (c'est `editor.js` qui la place, ou la déménage sur téléphone). */
export function creerColonneDroite(trackToggleLabel) {
  const sidebar = document.createElement('div')
  sidebar.className = 'sidebar'
  sidebar.setAttribute('role', 'complementary')
  sidebar.setAttribute('aria-label', 'Modifications, commentaires et Margo')
  const panneauModifications = document.createElement('div')
  panneauModifications.className = 'panneau-modifications'
  const sidebarFixe = document.createElement('div')
  sidebarFixe.className = 'sidebar-fixe'
  const aiSection = document.createElement('div')
  aiSection.className = 'sidebar-section ai-section'
  const suiviEntete = document.createElement('div')
  suiviEntete.className = 'suivi-entete'
  suiviEntete.appendChild(trackToggleLabel)
  const zoneRelecture = document.createElement('div')
  zoneRelecture.className = 'zone-relecture'
  sidebarFixe.append(zoneRelecture)
  const sidebarCorps = document.createElement('div')
  sidebarCorps.className = 'sidebar-corps'
  // Une zone qui défile doit se laisser atteindre au clavier (passage axe, lot L4).
  sidebarCorps.tabIndex = 0
  const changesSection = document.createElement('div')
  changesSection.className = 'sidebar-section changes-section'
  const commentsSection = document.createElement('div')
  commentsSection.className = 'sidebar-section comments-section'
  sidebarCorps.append(changesSection, commentsSection)
  panneauModifications.append(sidebarFixe, sidebarCorps)
  const panneauMargo = document.createElement('div')
  panneauMargo.className = 'panneau-margo'
  return {
    sidebar,
    suiviEntete,
    zoneRelecture,
    aiSection,
    changesSection,
    commentsSection,
    panneauModifications,
    panneauMargo,
  }
}

/** La colonne du plan, à gauche — coiffée de ses onglets « Plan · Fichiers »
 * (lot L1, 21/10/2026 ; Fichiers est réservé, désactivé). */
export function creerColonnePlan() {
  const outlineSidebar = document.createElement('div')
  outlineSidebar.className = 'outline-sidebar'
  outlineSidebar.setAttribute('role', 'navigation')
  outlineSidebar.setAttribute('aria-label', 'Plan du document')
  const outlineSection = document.createElement('div')
  outlineSection.className = 'sidebar-section outline-section'
  return { outlineSidebar, outlineSection }
}
