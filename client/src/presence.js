// "Qui est connecté" — une rangée de pastilles colorées dans le bandeau du
// haut, construite à partir de la même awareness Yjs qui fait déjà les
// curseurs distants nommés et colorés (buildCursor dans editor.js) et
// l'attribution des modifications suivies.
//
// Volontairement des **connexions**, pas des personnes : le constat 1.4 du
// rapport de fiabilité a montré que le décompte du serveur ne déduplique
// pas par nom — et ne doit pas le faire, puisque le modèle de comptes
// permet à plusieurs personnes de partager un même nom. Une pastille par
// connexion est l'image honnête, pas une approximation d'un « nombre de
// têtes ».
//
// Depuis le 17/09/2026, cliquer sur une pastille **emmène au curseur** de
// cette personne. L'information était déjà là : l'awareness transporte la
// position de chacun, y-prosemirror la peint déjà dans le texte. Il ne
// manquait que le geste.

import { relativePositionToAbsolutePosition, ySyncPluginKey } from 'y-prosemirror'
import { createRelativePositionFromJSON } from 'yjs'

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** La position du curseur d'un participant dans le document *tel qu'il est
 * ici, maintenant*.
 *
 * L'awareness ne transporte pas un numéro de caractère — il ne voudrait
 * rien dire, chacun ayant un document dans un état légèrement différent —
 * mais une **position relative** Yjs, ancrée à un caractère précis.
 * `relativePositionToAbsolutePosition` la traduit dans notre propre
 * document. Elle vaut `null` quand le caractère d'ancrage a disparu, ou
 * quand la personne n'a jamais placé son curseur dans le texte. */
function positionDuCurseur(etat, ydoc, type, view) {
  const curseur = etat && etat.cursor
  if (!curseur || !curseur.head) return null
  const binding = ySyncPluginKey.getState(view.state)?.binding
  if (!binding) return null
  try {
    const rel = createRelativePositionFromJSON(curseur.head)
    const pos = relativePositionToAbsolutePosition(ydoc, type, rel, binding.mapping)
    if (pos == null || pos < 0 || pos > view.state.doc.content.size) return null
    return pos
  } catch {
    return null
  }
}

/** L'élément qui défile autour de l'éditeur. */
function conteneurDefilant(el) {
  let n = el
  while (n && n !== document.body) {
    const style = getComputedStyle(n)
    if (/(auto|scroll)/.test(style.overflowY) && n.scrollHeight > n.clientHeight) return n
    n = n.parentElement
  }
  return null
}

/** Amène `pos` sous les yeux, au milieu de la zone de lecture plutôt qu'en
 * bordure : arriver sur une ligne collée au bord haut ne dit pas où l'on
 * est. Sans rien changer au document ni à la sélection de qui clique — on
 * va voir, on ne prend pas la place. */
function allerA(view, pos) {
  const coords = view.coordsAtPos(pos)
  const scroller = conteneurDefilant(view.dom)
  if (!scroller) {
    window.scrollTo({ top: window.scrollY + coords.top - window.innerHeight / 2, behavior: 'smooth' })
    return
  }
  const cadre = scroller.getBoundingClientRect()
  const cible = scroller.scrollTop + (coords.top - cadre.top) - scroller.clientHeight / 2
  scroller.scrollTo({ top: Math.max(0, cible), behavior: 'smooth' })
}

/** Fait clignoter brièvement le curseur distant visé. Sans ça, on arrive
 * au bon endroit sans savoir lequel des curseurs présents on cherchait. */
function signaler(nom) {
  const el = document.querySelector(`.remote-cursor[data-user="${CSS.escape(nom)}"]`)
  if (!el) return
  el.classList.remove('remote-cursor-vise')
  // Forcer un reflow, sinon retirer puis remettre la classe dans le même
  // cycle ne rejoue pas l'animation.
  void el.offsetWidth
  el.classList.add('remote-cursor-vise')
  setTimeout(() => el.classList.remove('remote-cursor-vise'), 2000)
}

/**
 * Monte la rangée « qui est là » dans `container`, alimentée par
 * l'awareness de `provider`. `contexte` donne de quoi aller au curseur :
 * la vue (par une fonction, elle n'existe pas encore au moment du montage),
 * le document Yjs et le type partagé.
 */
export function mountPresenceBar(container, provider, contexte = {}) {
  const { getView, ydoc, type, surAbsence } = contexte
  container.classList.add('presence-bar')

  function render() {
    const states = Array.from(provider.awareness.getStates().entries())
    container.innerHTML = ''
    for (const [clientId, state] of states) {
      const user = state?.user
      if (!user || !user.name) continue
      const soi = clientId === provider.awareness.clientID
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'presence-avatar'
      chip.style.setProperty('--user-color', user.color || '#888')
      chip.textContent = initials(user.name)
      chip.title = soi ? `${user.name} (vous)` : `Aller au curseur de ${user.name}`
      if (soi) chip.classList.add('presence-moi')

      chip.onclick = () => {
        const view = getView && getView()
        if (!view || soi) return
        const pos = positionDuCurseur(state, ydoc, type, view)
        if (pos == null) {
          // Dire pourquoi il ne se passe rien vaut mieux qu'un bouton
          // mort : la personne est bien là, mais son curseur n'est nulle
          // part — onglet en arrière-plan, ou pas encore cliqué dans le
          // texte.
          if (surAbsence) surAbsence(`${user.name} n’a pas de curseur dans le texte pour l’instant.`)
          return
        }
        allerA(view, pos)
        signaler(user.name)
      }

      container.appendChild(chip)
    }
  }

  provider.awareness.on('change', render)
  render()

  return {
    destroy() {
      provider.awareness.off('change', render)
    },
  }
}
