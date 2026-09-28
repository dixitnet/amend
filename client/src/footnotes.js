// Les notes dans l'éditeur (28/09/2026, claude/conception-notes-bas-de-page.md).
//
// Une note vit dans son appel : un nœud inline `footnote` qui contient son
// texte (schema.js). Ici, trois choses :
//
//   1. **l'appel** — une vue de nœud (`VueNote`) qui rend un chiffre en
//      exposant. Le numéro n'est pas calculé en JavaScript : c'est un
//      compteur CSS (`counter-increment: note` sur `.note-appel`,
//      style.css), donc insérer une note au début renumérote tout, tout
//      seul, sans un seul écouteur ;
//   2. **la fenêtre** — cliquer l'appel ouvre, sous lui, un petit éditeur
//      ProseMirror qui édite **le contenu du nœud lui-même**. C'est le
//      motif de l'exemple « footnote » de ProseMirror : les pas de
//      l'éditeur intérieur sont rejoués dans le document extérieur, décalés
//      de la position de la note, et inversement. Même document, donc même
//      Yjs, même suivi des modifications ;
//   3. **la liste de fin** — une vue en lecture seule des notes, repliée
//      sous le texte, chaque entrée menant à son appel.
//
// Le suivi : insérer une note en suivi pose `suivi: { type: 'insertion' }`
// sur le nœud, la supprimer pose `deletion` (trackChanges.js sait faire les
// deux et les accepter/rejeter). Le texte d'une note **en attente
// d'insertion** n'est pas suivi mot à mot : la proposition, c'est la note
// entière. Le texte d'une note déjà acceptée l'est, comme un paragraphe.

import { EditorState, TextSelection, NodeSelection, Plugin, PluginKey } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { StepMap } from 'prosemirror-transform'
import { undo, redo } from 'y-prosemirror'
import { isTrackChangesEnabled } from './trackChanges.js'
import { notesDuDocument } from './notes.js'

const cle = new PluginKey('footnotes')

/** Les vues vivantes, pour retrouver celle d'une position (la liste de fin
 * et la commande d'insertion en ont besoin). Même motif que la table des
 * matières. */
const vues = new Set()

/** Position d'une note qu'on vient d'insérer et qu'il faut ouvrir dès que
 * sa vue existe — la vue naît après la transaction, on ne peut pas lui
 * parler avant. */
let aOuvrir = null

/** Vrai si le bloc du curseur (ou un bloc de la sélection) contient une
 * note — un titre ne peut pas en porter (schema.js), et ProseMirror lève
 * une erreur plutôt que de convertir un bloc en un type qui refuse son
 * contenu. */
export function selectionContientUneNote(state) {
  const { from, to } = state.selection
  let trouve = false
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (trouve) return false
    if (node.isTextblock) {
      node.descendants((n) => {
        if (n.type.name === 'footnote') trouve = true
        return !trouve
      })
      return false
    }
    return true
  })
  return trouve
}

/** Insère une note au curseur et ouvre sa fenêtre. En suivi, la note
 * naît proposée. Refusée dans un titre. */
export function insererNote(view, user) {
  const { state } = view
  const { $from, empty } = state.selection
  const type = state.schema.nodes.footnote
  if (!type) return false
  if (!$from.parent.inlineContent || $from.parent.type.name === 'heading') return false
  if (!empty && !state.selection.$to.sameParent($from)) return false
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) return false
  const suivi = isTrackChangesEnabled(state)
    ? { type: 'insertion', user: user.name, userColor: user.color, ts: Date.now() }
    : null
  const note = type.create({ suivi })
  const pos = state.selection.to
  const tr = state.tr.insert(pos, note)
  tr.setSelection(TextSelection.create(tr.doc, pos + note.nodeSize))
  // Le suivi ne réécrit pas cette transaction : la proposition est déjà
  // portée par le nœud (voir en tête de fichier).
  tr.setMeta('trackChangesInternal', true)
  aOuvrir = pos
  view.dispatch(tr)
  for (const vue of vues) {
    if (vue.getPos() === pos) {
      vue.ouvrir()
      break
    }
  }
  aOuvrir = null
  return true
}

/** Le greffon : la vue de nœud, et un rafraîchissement de la liste de fin
 * à chaque changement du document. */
export function footnotesPlugin(getUser, { surChangement } = {}) {
  return new Plugin({
    key: cle,
    props: {
      nodeViews: {
        footnote: (node, view, getPos) => new VueNote(node, view, getPos, getUser),
      },
    },
    view() {
      let dernierDoc = null
      return {
        update(view) {
          if (view.state.doc === dernierDoc) return
          dernierDoc = view.state.doc
          if (surChangement) surChangement(view)
        },
      }
    },
  })
}

class VueNote {
  constructor(node, vueExterne, getPos, getUser) {
    this.node = node
    this.vueExterne = vueExterne
    this.getPos = getPos
    this.getUser = getUser
    this.dom = document.createElement('sup')
    this.dom.className = 'note-appel'
    this.dom.setAttribute('role', 'button')
    this.dom.tabIndex = 0
    this.dom.title = 'Ouvrir la note'
    this.fenetre = null
    this.vueInterne = null
    this.majEtat()
    this.dom.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.fenetre ? this.fermer() : this.ouvrir()
    })
    this.dom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.ouvrir()
      }
    })
    vues.add(this)
    if (aOuvrir !== null && aOuvrir === getPos()) setTimeout(() => this.ouvrir(), 0)
  }

  /** Les classes qui disent l'état de suivi — le compteur CSS ne compte pas
   * une note proposée à la suppression. */
  majEtat() {
    const suivi = this.node.attrs.suivi
    this.dom.classList.toggle('note-inseree', !!suivi && suivi.type === 'insertion')
    this.dom.classList.toggle('note-supprimee', !!suivi && suivi.type === 'deletion')
    if (suivi) this.dom.style.setProperty('--user-color', suivi.userColor || '')
    else this.dom.style.removeProperty('--user-color')
    this.dom.title = suivi
      ? `Note ${suivi.type === 'insertion' ? 'proposée' : 'supprimée'} par ${suivi.user}`
      : this.node.textContent
        ? this.node.textContent.slice(0, 120)
        : 'Ouvrir la note'
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode')
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode')
  }

  ouvrir() {
    if (this.fenetre) return
    const fenetre = document.createElement('div')
    fenetre.className = 'note-fenetre'
    const entete = document.createElement('div')
    entete.className = 'note-fenetre-entete'
    const titre = document.createElement('span')
    titre.textContent = 'Note'
    const fermerBtn = document.createElement('button')
    fermerBtn.type = 'button'
    fermerBtn.className = 'note-fenetre-fermer'
    fermerBtn.textContent = '×'
    fermerBtn.setAttribute('aria-label', 'Fermer la note')
    fermerBtn.onclick = () => this.fermer()
    entete.append(titre, fermerBtn)
    const corps = document.createElement('div')
    corps.className = 'note-fenetre-corps'
    fenetre.append(entete, corps)
    // Dans le conteneur de l'éditeur, pas dans le corps de page : le
    // positionnement se fait par rapport au texte, et les feuilles basses
    // du téléphone ont leur propre couche.
    const conteneur = this.vueExterne.dom.parentNode
    conteneur.appendChild(fenetre)
    this.fenetre = fenetre
    this.placer()

    const lireSeulement = !this.vueExterne.editable
    this.vueInterne = new EditorView(corps, {
      state: EditorState.create({
        doc: this.node,
        plugins: [
          keymap({
            'Mod-z': () => undo(this.vueExterne.state),
            'Mod-y': () => redo(this.vueExterne.state),
            'Mod-Shift-z': () => redo(this.vueExterne.state),
            'Mod-b': toggleMark(this.node.type.schema.marks.strong),
            'Mod-i': toggleMark(this.node.type.schema.marks.em),
            Escape: () => {
              this.fermer()
              return true
            },
            // Entrée ferme : une note est un texte court. Maj+Entrée fait un
            // retour à la ligne dedans.
            Enter: () => {
              this.fermer()
              return true
            },
            'Shift-Enter': (state, dispatch) => {
              const br = state.schema.nodes.hard_break
              if (dispatch) dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
              return true
            },
          }),
          keymap(baseKeymap),
        ],
      }),
      editable: () => !lireSeulement,
      dispatchTransaction: (tr) => this.dispatchInterne(tr),
      handleDOMEvents: {
        mousedown: () => {
          // Le focus reste dans la fenêtre : la vue extérieure ne doit pas
          // le reprendre.
          if (this.vueExterne.hasFocus()) this.vueInterne.focus()
        },
      },
    })
    // Pour les tests (jsdom) : la vue intérieure, accessible depuis la
    // fenêtre elle-même.
    fenetre.vueInterne = this.vueInterne
    this.vueInterne.focus()
    // Curseur en fin de note, là où l'on continue d'écrire.
    const fin = this.vueInterne.state.doc.content.size
    this.vueInterne.dispatch(this.vueInterne.state.tr.setSelection(TextSelection.create(this.vueInterne.state.doc, fin)))

    this.surClicDehors = (e) => {
      if (fenetre.contains(e.target) || this.dom.contains(e.target)) return
      this.fermer()
    }
    document.addEventListener('mousedown', this.surClicDehors, true)
  }

  /** Sous l'appel, dans les limites du conteneur ; en bas de l'écran sur
   * téléphone (style.css s'en charge par une requête média). */
  placer() {
    const conteneur = this.vueExterne.dom.parentNode
    const rc = conteneur.getBoundingClientRect()
    const ra = this.dom.getBoundingClientRect()
    const largeur = Math.min(420, Math.max(220, rc.width - 24))
    let gauche = ra.left - rc.left
    if (gauche + largeur > rc.width - 12) gauche = Math.max(12, rc.width - 12 - largeur)
    this.fenetre.style.width = `${largeur}px`
    this.fenetre.style.left = `${gauche}px`
    this.fenetre.style.top = `${ra.bottom - rc.top + conteneur.scrollTop + 6}px`
  }

  fermer() {
    if (!this.fenetre) return
    document.removeEventListener('mousedown', this.surClicDehors, true)
    this.vueInterne.destroy()
    this.vueInterne = null
    this.fenetre.remove()
    this.fenetre = null
    if (this.vueExterne.editable) this.vueExterne.focus()
  }

  /** Un pas fait dans la fenêtre est rejoué dans le document, décalé de la
   * position de la note (+1 pour entrer dans le nœud). Le document
   * revient ensuite par `update`, qui remet la fenêtre d'accord. */
  dispatchInterne(tr) {
    const { state, transactions } = this.vueInterne.state.applyTransaction(tr)
    this.vueInterne.updateState(state)
    if (tr.getMeta('duDehors')) return
    const trExterne = this.vueExterne.state.tr
    const decalage = StepMap.offset(this.getPos() + 1)
    let touche = false
    for (const t of transactions) {
      for (const pas of t.steps) {
        trExterne.step(pas.map(decalage))
        touche = true
      }
    }
    if (!touche) return
    // Une note proposée à l'insertion : son texte n'est pas suivi mot à
    // mot, la proposition c'est la note entière (voir en tête de fichier).
    const suivi = this.node.attrs.suivi
    if (suivi && suivi.type === 'insertion') trExterne.setMeta('trackChangesInternal', true)
    this.vueExterne.dispatch(trExterne)
  }

  update(node) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.majEtat()
    if (this.vueInterne) {
      const etat = this.vueInterne.state
      const debut = node.content.findDiffStart(etat.doc.content)
      if (debut != null) {
        let { a: finA, b: finB } = node.content.findDiffEnd(etat.doc.content)
        const chevauchement = debut - Math.min(finA, finB)
        if (chevauchement > 0) {
          finA += chevauchement
          finB += chevauchement
        }
        this.vueInterne.dispatch(etat.tr.replace(debut, finB, node.slice(debut, finA)).setMeta('duDehors', true))
      }
    }
    return true
  }

  stopEvent(e) {
    return !!(this.fenetre && this.fenetre.contains(e.target))
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.fermer()
    vues.delete(this)
  }
}

/** La liste des notes en fin de document : repliée, en lecture seule,
 * chaque entrée mène à son appel. Rendue depuis le document, jamais
 * depuis le DOM ; à appeler à chaque changement (voir footnotesPlugin). */
export function monterListeDesNotes(conteneur, getView) {
  const details = document.createElement('details')
  details.className = 'notes-fin'
  const resume = document.createElement('summary')
  const liste = document.createElement('ol')
  details.append(resume, liste)
  conteneur.appendChild(details)

  function rafraichir(view) {
    const notes = notesDuDocument(view.state.doc)
    details.hidden = notes.length === 0
    resume.textContent = notes.length > 1 ? `Notes (${notes.length})` : 'Note'
    liste.textContent = ''
    notes.forEach(({ node, pos }) => {
      const li = document.createElement('li')
      const suivi = node.attrs.suivi
      if (suivi) li.className = suivi.type === 'insertion' ? 'note-inseree' : 'note-supprimee'
      li.textContent = node.textContent || '(vide)'
      li.title = 'Aller à l’appel'
      li.onclick = () => {
        const v = getView()
        if (!v) return
        v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, pos)).scrollIntoView())
        for (const vue of vues) {
          if (vue.getPos() === pos) {
            vue.ouvrir()
            break
          }
        }
      }
      liste.appendChild(li)
    })
  }
  return { el: details, rafraichir }
}
