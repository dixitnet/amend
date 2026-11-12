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

/** La marge d'ancrage d'un bloc (`scroll-margin-top`, posée par la couche
 * design sous un bandeau fixe) : un titre caché dessous n'est pas courant. */
const marge = (el) => parseFloat(getComputedStyle(el).scrollMarginTop) || 0

/** Le haut de la zone qui fait défiler le texte : celle de la coquille quand
 * le texte défile seul (formats M et L), sinon l'écran. */
function hautDeLaZone(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if (o === 'auto' || o === 'scroll') return n.getBoundingClientRect().top
  }
  return 0
}

/** Le premier titre encore visible en haut de la zone du texte (comme Docs) ;
 * si tous sont passés, le dernier (écart avec Docs, qui revient au premier). */
export function titreCourant(racine, titres) {
  let haut = null
  for (const t of titres) {
    const el = racine?.querySelector(`[data-id="${CSS.escape(t.cle)}"]`)
    if (!el) continue
    haut ??= hautDeLaZone(el)
    if (el.getBoundingClientRect().top >= haut + marge(el)) return t.cle
  }
  return titres.at(-1)?.cle ?? null
}

/**
 * Aller à un titre : curseur à sa fin, titre amené à l'écran ; le focus
 * seulement hors écran tactile.
 */
export function allerAuTitre(editeur, cle, { focaliser }) {
  if (focaliser) editeur.focus()
  editeur.setTextCursorPosition(cle, 'end')
  // Le défilement respecte la marge d'ancrage du bloc (sous le bandeau).
  editeur.domElement
    ?.querySelector(`[data-id="${CSS.escape(cle)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
