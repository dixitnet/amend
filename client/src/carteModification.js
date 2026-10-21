// La carte de la modification courante, dans la gouttière (lot L2,
// 21/10/2026 — décision D10, piste 3 : claude/vues-reference-formats.md).
//
// Commentaires et modifications sont deux annotations d'un passage : ils
// prennent la même forme et la même place. Les commentaires restent tous
// affichés ; des modifications, une seule — la courante, celle du curseur ou
// la suivante — se déploie dans la gouttière, à la hauteur de son passage,
// avec son auteur, ce qu'elle change, et le parcours ‹ n / N › Accepter
// Rejeter. Ce parcours n'est pas recopié : c'est **le même nœud** que la
// barre de relecture, déménagé ici quand la gouttière est là (editor.js).
//
// Ce module ne place rien : il construit la carte et la remplit ; c'est la
// gouttière (commentsGutter.js) qui la pose et l'empile avec les commentaires.

import { changesKey, modificationsAffichees } from './changesPanel.js'
import { couleurSure } from '../../shared/securite.js'
import { texteSurCouleur } from '../../shared/identite.js'

const LIBELLES = {
  insertion: 'ajoute',
  deletion: 'supprime',
  remplacement: 'remplace',
  paragraphe: 'coupe le paragraphe',
}

/** Les initiales d'un nom, pour la pastille : « Camille Durand » → « CD ». */
export function initiales(nom) {
  const mots = String(nom || '?')
    .trim()
    .split(/[\s-]+/)
    .filter((m) => /^\p{L}/u.test(m))
  const lettres = mots.length > 1 ? mots[0][0] + mots[mots.length - 1][0] : (mots[0] || '?').slice(0, 2)
  return lettres.toUpperCase()
}

/** Ce que fait la modification, en un verbe. */
export function verbeDe(change) {
  if (change.type === 'lot') return `propose ${change.membres.length} changements`
  return LIBELLES[change.type] || 'modifie'
}

function tempsRelatif(ts) {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}

function tronque(s, n) {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function el(nom, classe, texte) {
  const e = document.createElement(nom)
  if (classe) e.className = classe
  if (texte != null) e.textContent = texte
  return e
}

/**
 * @param {object} o
 * @param {() => import('prosemirror-view').EditorView} o.getView
 * @param {{ courante: () => ({from:number, to:number}|null) }} o.relecture
 * @returns {{ carte: HTMLElement, pied: HTMLElement, remplir: () => (number|null) }}
 */
export function monterCarteModification({ getView, relecture }) {
  const carte = el('div', 'carte-modification')
  carte.setAttribute('role', 'group')
  carte.setAttribute('aria-label', 'Modification courante')
  carte.hidden = true
  const entete = el('div', 'carte-modif-entete')
  const texte = el('div', 'carte-modif-texte')
  const pied = el('div', 'carte-modif-pied')
  carte.append(entete, texte, pied)

  /** Remplit la carte avec la modification courante ; rend la position où
   * l'ancrer, ou null s'il n'y a rien à relire. */
  function remplir() {
    const view = getView()
    const cur = view && relecture.courante()
    if (!cur) {
      carte.hidden = true
      return null
    }
    const raw = changesKey.getState(view.state)?.raw ?? []
    const affichees = modificationsAffichees(raw)
    const change =
      affichees.find((c) => c.from <= cur.from && cur.from <= c.to) || affichees.find((c) => c.from >= cur.from) || cur
    carte.hidden = false
    carte.style.setProperty('--user-color', couleurSure(change.userColor))

    const pastille = el('span', 'carte-modif-pastille', initiales(change.user))
    pastille.style.color = texteSurCouleur(couleurSure(change.userColor))
    pastille.setAttribute('aria-hidden', 'true')
    entete.replaceChildren(
      pastille,
      el('strong', 'carte-modif-auteur', change.user || 'Quelqu’un'),
      el('span', 'carte-modif-verbe', [verbeDe(change), tempsRelatif(change.ts)].filter(Boolean).join(' · '))
    )
    if (change.type === 'remplacement') {
      texte.replaceChildren(
        el('span', 'carte-modif-ancien', tronque(change.ancien, 110)),
        el('span', 'carte-modif-nouveau', tronque(change.nouveau, 110))
      )
    } else if (change.type === 'deletion') {
      texte.replaceChildren(el('span', 'carte-modif-ancien', tronque(change.text, 160)))
    } else {
      texte.replaceChildren(el('span', 'carte-modif-nouveau', tronque(change.text, 160)))
    }
    return cur.from
  }

  return { carte, pied, remplir }
}
