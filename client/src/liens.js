// Les liens dans l'éditeur (30/09/2026).
//
// Trois gestes : poser ou modifier un lien (une fenêtre, Ctrl/⌘+K ou le
// bouton « Lien »), le voir et l'ouvrir (une bulle sous le curseur, et
// Ctrl/⌘+clic), le retirer. Et un raccourci que tout le monde connaît :
// coller une adresse sur du texte sélectionné en fait un lien.
//
// **Qui peut poser un lien.** Les éditeurs. Un lien est une mise en forme
// comme le gras — il ne passe pas par le suivi des modifications — mais
// contrairement au gras il change *où mène* un texte que d'autres liront.
// Un correcteur, dont tout le travail doit rester visible et rejetable,
// ne peut donc pas en poser : il propose le texte et met l'adresse en
// commentaire. Un lecteur ne modifie rien. Les uns et les autres peuvent
// ouvrir les liens existants.
//
// **Quelles adresses.** Celles de `shared/liens.js`, sans exception : http,
// https, mailto. La saisie tolère la forme (« exemple.org » devient
// « https://exemple.org/ »), pas le fond.

import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { adresseDepuisSaisie, adresseAutorisee, libelleCourt, estUneAdresseSeule } from '../../shared/liens.js'
import { messageFugace } from './images.js'

const cle = new PluginKey('liens')

/** Le lien qui couvre la position : { from, to, mark } — l'étendue de toute
 * la suite de nœuds de texte contigus qui portent ce lien, pas seulement
 * du morceau touché (un lien dont un mot est en gras est fait de deux
 * nœuds). `null` si la position n'est dans aucun lien. `strict` : le
 * curseur doit être *dans* le lien, pas à sa frontière. */
export function lienAutour(doc, pos, type, { strict = false } = {}) {
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  if (!parent.inlineContent) return null
  const debut = $pos.start()
  const morceaux = []
  parent.forEach((enfant, decalage) => {
    const mark = enfant.marks.find((m) => m.type === type)
    morceaux.push({ from: debut + decalage, to: debut + decalage + enfant.nodeSize, href: mark ? mark.attrs.href : null, mark })
  })
  let i = morceaux.findIndex((m) => m.href !== null && (strict ? pos > m.from && pos < m.to : pos >= m.from && pos <= m.to))
  if (i === -1) return null
  // Frontière entre deux morceaux (pos == to du précédent == from du suivant) :
  // en mode non strict on préfère celui qui contient réellement la position.
  const href = morceaux[i].href
  let a = i
  let b = i
  while (a > 0 && morceaux[a - 1].href === href) a--
  while (b < morceaux.length - 1 && morceaux[b + 1].href === href) b++
  return { from: morceaux[a].from, to: morceaux[b].to, mark: morceaux[i].mark }
}

/** Le lien que la sélection désigne, s'il y en a un et un seul : celui
 * du curseur, ou celui qui couvre toute la sélection. */
export function lienDeLaSelection(state) {
  const type = state.schema.marks.link
  const { from, to, empty } = state.selection
  if (empty) return lienAutour(state.doc, from, type, { strict: true })
  const l = lienAutour(state.doc, from, type)
  return l && l.from <= from && l.to >= to ? l : null
}

/** Pose (ou remplace) le lien sur [from, to]. Hors suivi : une mise en
 * forme, comme le gras. */
export function poserLienSur(view, from, to, href) {
  const type = view.state.schema.marks.link
  const tr = view.state.tr.removeMark(from, to, type).addMark(from, to, type.create({ href }))
  view.dispatch(tr.setMeta('trackChangesInternal', true))
}

export function retirerLien(view, from, to) {
  const type = view.state.schema.marks.link
  view.dispatch(view.state.tr.removeMark(from, to, type).setMeta('trackChangesInternal', true))
}

/** Insère `texte` au curseur (par le chemin ordinaire : sous suivi, il
 * naît proposé et attribué) puis le lie. Deux transactions, exprès : le
 * suivi réécrit une insertion, et lui glisser une marque de plus dans la
 * même transaction reviendrait à parier qu'il la conserve. */
export function insererTexteLie(view, texte, href) {
  const { from, to } = view.state.selection
  view.dispatch(view.state.tr.insertText(texte, from, to))
  const fin = view.state.selection.from
  poserLienSur(view, fin - texte.length, fin, href)
  // Le curseur sort du lien : on continue d'écrire après, pas dedans.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, fin)).setMeta('trackChangesInternal', true))
}

function ouvrirAdresse(href) {
  const sure = adresseAutorisee(href)
  if (!sure) return false
  // `noopener` : la page ouverte ne reçoit pas de référence vers celle-ci.
  window.open(sure, '_blank', 'noopener,noreferrer')
  return true
}

/**
 * Le greffon. `peutPoser()` dit si la personne peut poser des liens ;
 * `surRefus()` est appelé quand elle essaie sans pouvoir.
 */
export function liensPlugin({ peutPoser, surRefus = () => {} }) {
  return new Plugin({
    key: cle,
    props: {
      // Ctrl/⌘+clic ouvre ; dans une vue non modifiable (lecteur), un clic
      // simple ouvre, puisqu'il n'y a rien d'autre à faire d'un lien.
      handleClick(view, pos, event) {
        const type = view.state.schema.marks.link
        const l = lienAutour(view.state.doc, pos, type, { strict: true })
        if (!l) return false
        if (view.editable && !(event.ctrlKey || event.metaKey)) return false
        return ouvrirAdresse(l.mark.attrs.href)
      },
      // Coller une adresse — seule — sur du texte sélectionné : c'est un
      // lien, pas un remplacement. Sans sélection, l'adresse est insérée et
      // liée d'un coup.
      handlePaste(view, event) {
        if (!view.editable) return false
        const texte = event.clipboardData && event.clipboardData.getData('text/plain')
        if (!texte || !estUneAdresseSeule(texte)) return false
        if (!peutPoser()) return false // collage ordinaire (texte proposé, sans lien)
        const href = adresseAutorisee(texte)
        const { from, to, empty } = view.state.selection
        if (empty) {
          insererTexteLie(view, texte.trim(), href)
        } else {
          if (!view.state.doc.resolve(from).sameParent(view.state.doc.resolve(to))) return false
          poserLienSur(view, from, to, href)
        }
        return true
      },
    },
    view: (view) => new BulleDeLien(view, peutPoser),
  })
}

/** Sous le curseur, quand il est dans un lien : où il mène, l'ouvrir, le
 * modifier, le retirer. Sans elle un lien serait invisible sur téléphone,
 * où il n'y a ni survol ni Ctrl+clic. */
class BulleDeLien {
  constructor(view, peutPoser) {
    this.view = view
    this.peutPoser = peutPoser
    this.bulle = null
  }

  update(view) {
    this.view = view
    const l = lienDeLaSelection(view.state)
    if (!l || !view.hasFocus()) return this.masquer()
    this.montrer(l)
  }

  montrer(l) {
    const href = l.mark.attrs.href
    if (!this.bulle) {
      this.bulle = document.createElement('div')
      this.bulle.className = 'lien-bulle'
      this.bulle.setAttribute('role', 'toolbar')
      this.bulle.setAttribute('aria-label', 'Lien')
      // Ne pas voler le focus à l'éditeur : sinon la bulle disparaît à
      // l'instant où l'on veut cliquer dedans.
      this.bulle.addEventListener('mousedown', (e) => e.preventDefault())
      this.view.dom.parentNode.appendChild(this.bulle)
    }
    const b = this.bulle
    if (b.dataset.href !== href || b.dataset.de !== String(l.from)) {
      b.dataset.href = href
      b.dataset.de = String(l.from)
      b.textContent = ''
      const ouvrir = document.createElement('button')
      ouvrir.type = 'button'
      ouvrir.className = 'lien-bulle-ouvrir'
      ouvrir.textContent = `↗ ${libelleCourt(href)}`
      ouvrir.title = href
      ouvrir.onclick = () => ouvrirAdresse(href)
      b.append(ouvrir)
      if (this.peutPoser()) {
        const modifier = document.createElement('button')
        modifier.type = 'button'
        modifier.textContent = 'Modifier'
        modifier.onclick = () => ouvrirFenetreLien(this.view, { peutPoser: this.peutPoser })
        const retirer = document.createElement('button')
        retirer.type = 'button'
        retirer.textContent = 'Retirer'
        retirer.onclick = () => {
          const cur = lienDeLaSelection(this.view.state)
          if (cur) retirerLien(this.view, cur.from, cur.to)
        }
        b.append(modifier, retirer)
      }
    }
    placerSous(this.view, b, l.to)
  }

  masquer() {
    if (this.bulle) {
      this.bulle.remove()
      this.bulle = null
    }
  }

  destroy() {
    this.masquer()
  }
}

/** Place un élément absolu sous la position `pos`, dans les limites du
 * conteneur de l'éditeur (comme la fenêtre d'une note). */
function placerSous(view, el, pos) {
  const conteneur = view.dom.parentNode
  let c
  try {
    c = view.coordsAtPos(pos)
  } catch {
    return
  }
  const rc = conteneur.getBoundingClientRect()
  const largeur = el.offsetWidth || 260
  let gauche = c.left - rc.left
  if (gauche + largeur > rc.width - 12) gauche = Math.max(12, rc.width - 12 - largeur)
  el.style.left = `${Math.max(12, gauche)}px`
  el.style.top = `${c.bottom - rc.top + conteneur.scrollTop + 6}px`
}

/**
 * La fenêtre « lien ». Trois cas : modifier le lien du curseur, lier la
 * sélection, ou — sans sélection — écrire un texte et son adresse.
 */
export function ouvrirFenetreLien(view, { peutPoser }) {
  if (!peutPoser()) return false
  if (!view.editable) return false
  document.querySelectorAll('.lien-fenetre').forEach((f) => f.remove())
  const etat = view.state
  const existant = lienDeLaSelection(etat)
  const { from, to, empty } = etat.selection
  const cible = existant ? { from: existant.from, to: existant.to } : empty ? null : { from, to }
  if (cible && !etat.doc.resolve(cible.from).sameParent(etat.doc.resolve(cible.to))) {
    messageFugace('Un lien se pose sur du texte d’un seul paragraphe.', { erreur: true })
    return false
  }

  const fenetre = document.createElement('form')
  fenetre.className = 'lien-fenetre'
  fenetre.setAttribute('role', 'dialog')
  fenetre.setAttribute('aria-label', existant ? 'Modifier le lien' : 'Ajouter un lien')

  const titre = document.createElement('div')
  titre.className = 'lien-fenetre-titre'
  titre.textContent = existant ? 'Modifier le lien' : 'Ajouter un lien'
  fenetre.append(titre)

  let champTexte = null
  if (!cible) {
    const etiquette = document.createElement('label')
    etiquette.textContent = 'Texte à afficher'
    champTexte = document.createElement('input')
    champTexte.type = 'text'
    champTexte.autocomplete = 'off'
    champTexte.placeholder = 'facultatif — sinon l’adresse'
    etiquette.append(champTexte)
    fenetre.append(etiquette)
  }

  const etiquetteAdresse = document.createElement('label')
  etiquetteAdresse.textContent = 'Adresse'
  const champ = document.createElement('input')
  champ.type = 'text'
  champ.autocomplete = 'off'
  champ.spellcheck = false
  champ.inputMode = 'url'
  champ.placeholder = 'exemple.org/page  ou  nom@exemple.org'
  champ.value = existant ? existant.mark.attrs.href : ''
  etiquetteAdresse.append(champ)
  fenetre.append(etiquetteAdresse)

  const erreur = document.createElement('p')
  erreur.className = 'lien-fenetre-erreur'
  erreur.hidden = true
  erreur.setAttribute('role', 'alert')
  fenetre.append(erreur)

  const actions = document.createElement('div')
  actions.className = 'lien-fenetre-actions'
  const ok = document.createElement('button')
  ok.type = 'submit'
  ok.className = 'btn-primary'
  ok.textContent = existant ? 'Enregistrer' : 'Ajouter'
  const annuler = document.createElement('button')
  annuler.type = 'button'
  annuler.textContent = 'Annuler'
  actions.append(ok, annuler)
  if (existant) {
    const retirer = document.createElement('button')
    retirer.type = 'button'
    retirer.textContent = 'Retirer le lien'
    retirer.onclick = () => {
      retirerLien(view, existant.from, existant.to)
      fermer()
    }
    actions.append(retirer)
  }
  fenetre.append(actions)

  function fermer() {
    document.removeEventListener('mousedown', surClicDehors, true)
    fenetre.remove()
    view.focus()
  }
  function surClicDehors(e) {
    if (!fenetre.contains(e.target)) fermer()
  }
  annuler.onclick = fermer
  fenetre.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      fermer()
    }
  })
  fenetre.addEventListener('submit', (e) => {
    e.preventDefault()
    const href = adresseDepuisSaisie(champ.value)
    if (!href) {
      erreur.textContent = 'Adresse non acceptée : http, https ou une adresse électronique seulement.'
      erreur.hidden = false
      champ.focus()
      return
    }
    const texte = champTexte ? champTexte.value.trim() : ''
    fermerSansFocus()
    if (cible) poserLienSur(view, cible.from, cible.to, href)
    else insererTexteLie(view, texte || libelleCourt(href), href)
    view.focus()
  })
  function fermerSansFocus() {
    document.removeEventListener('mousedown', surClicDehors, true)
    fenetre.remove()
  }

  view.dom.parentNode.appendChild(fenetre)
  placerSous(view, fenetre, cible ? cible.to : to)
  document.addEventListener('mousedown', surClicDehors, true)
  ;(champTexte || champ).focus()
  return true
}

/** La commande de clavier (Ctrl/⌘+K) et du bouton. */
export function commandeLien({ peutPoser, surRefus }) {
  return (_state, _dispatch, view) => {
    if (!view) return false
    if (!peutPoser()) {
      surRefus()
      return true
    }
    return ouvrirFenetreLien(view, { peutPoser })
  }
}
