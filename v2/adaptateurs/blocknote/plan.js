// Adaptateur BlockNote (couche 2) : le plan du document (volet « Plan » des
// formats S, M et L).
//
// Plan, comme le sommaire de Docs (`useHeadingStore.tsx`, `Heading.tsx`,
// `TableContentSideBar.tsx`) : les titres du document, tenus à jour à chaque
// modification ; aller à un titre place le curseur à sa fin et le fait
// défiler jusqu'à lui, sans donner le focus sur écran tactile (le clavier
// s'ouvrirait) ; le titre courant est le premier encore visible en haut de
// l'écran. Écart : nos titres vont du niveau 1 au niveau 5 (Docs : 1 à 3).

/** Le texte d'un contenu en ligne de BlockNote (texte et liens). */
function texteDe(contenu) {
  if (!Array.isArray(contenu)) return ''
  return contenu.map((c) => (c.type === 'text' ? c.text : c.type === 'link' ? texteDe(c.content) : '')).join('')
}

/**
 * Les titres d'une liste de blocs BlockNote, dans l'ordre du texte, enfants compris.
 * @param {Array<any>} blocs
 * @returns {Array<{ cle: string, niveau: number, libelle: string }>}
 */
export function titresDe(blocs) {
  const titres = []
  const parcourir = (liste) => {
    for (const b of liste ?? []) {
      if (b.type === 'heading')
        titres.push({ cle: b.id, niveau: Number(b.props?.level) || 1, libelle: texteDe(b.content) })
      parcourir(b.children)
    }
  }
  parcourir(blocs)
  return titres
}

/** Le haut de la zone visible : sous le bandeau fixe de la page, s'il y en a un
 * (un titre caché dessous n'est ni courant, ni la cible d'un défilement). */
function hautVisible() {
  const bandeau = document.querySelector('body header')
  return bandeau && getComputedStyle(bandeau).position === 'fixed' ? bandeau.getBoundingClientRect().bottom : 0
}

/** Le premier titre encore visible en haut de l'écran (comme Docs), sinon le premier. */
export function titreCourant(racine, titres) {
  const haut = hautVisible()
  for (const t of titres) {
    const el = racine?.querySelector(`[data-id="${CSS.escape(t.cle)}"]`)
    if (el && el.getBoundingClientRect().top >= haut) return t.cle
  }
  return titres[0]?.cle ?? null
}

/**
 * Aller à un titre : curseur à sa fin, titre amené à l'écran ; le focus
 * seulement hors écran tactile.
 */
export function allerAuTitre(editeur, cle, { focaliser }) {
  if (focaliser) editeur.focus()
  editeur.setTextCursorPosition(cle, 'end')
  const el = editeur.domElement?.querySelector(`[data-id="${CSS.escape(cle)}"]`)
  if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - hautVisible(), behavior: 'smooth' })
}
