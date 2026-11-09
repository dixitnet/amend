// Adaptateur BlockNote (couche 2) : le plan du document (volet « Plan » des
// formats M et L) et la lecture d'abord (format M, comme le format S).
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

/** Le premier titre encore visible en haut de l'écran (comme Docs), sinon le premier. */
export function titreCourant(racine, titres) {
  for (const t of titres) {
    const el = racine?.querySelector(`[data-id="${CSS.escape(t.cle)}"]`)
    if (el && el.getBoundingClientRect().top > 0) return t.cle
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
  editeur.domElement
    ?.querySelector(`[data-id="${CSS.escape(cle)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/**
 * Passer de la lecture à la modification au point touché, dans le geste
 * même (sinon un écran tactile n'ouvre pas le clavier) : l'éditeur devient
 * modifiable, prend le focus, et le curseur est posé par la sélection du
 * navigateur à l'endroit touché (ProseMirror la reprend).
 */
export function modifierAuPoint(editeur, x, y) {
  editeur.isEditable = true
  editeur.focus()
  const point = document.caretPositionFromPoint?.(x, y)
  const plage = point ? null : document.caretRangeFromPoint?.(x, y)
  const noeud = point?.offsetNode ?? plage?.startContainer
  const decalage = point?.offset ?? plage?.startOffset
  if (noeud && editeur.domElement?.contains(noeud)) window.getSelection()?.collapse(noeud, decalage)
}

/** Repasser en lecture. */
export function lireSeulement(editeur) {
  editeur.isEditable = false
  editeur.domElement?.blur()
}
