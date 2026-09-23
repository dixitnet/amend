// L'interface iPhone (22/09/2026) — reprise de ce que font Google Docs et
// Obsidian sur téléphone, et non une réduction de l'interface de bureau.
//
// La première version du petit écran gardait tout et rangeait : bandeau
// allégé, barre à onglets, feuilles. C'était encore l'application de bureau,
// en plus étroit. Les deux applications qui savent éditer un texte long sur
// un téléphone ont pris une décision plus radicale, et c'est celle-là qu'on
// reprend ici :
//
// **Lire et écrire sont deux moments distincts.** Google Docs ouvre un
// document en lecture, sans rien autour ; un bouton crayon fait entrer en
// écriture, une coche en sort. Obsidian fait le même partage autrement : une
// barre de navigation quand on ne tape pas, une barre d'outils quand on
// tape, jamais les deux. Cela libère l'écran pour ce qui compte : le texte.
//
// Deux conséquences directes :
//
//  - **En lecture, l'écran ne porte que le texte** — plus de barre d'outils,
//    plus de compteurs, plus de panneaux. Seuls un en-tête minuscule et le
//    crayon.
//  - **En écriture, une seule rangée d'outils**, au ras du clavier, qu'on
//    fait défiler du doigt si elle déborde (c'est le geste d'Obsidian), et
//    une coche pour revenir lire.
//
// **Ce qui disparaît du téléphone**, parce que l'écran ne s'agrandira pas et
// que chaque bouton gardé coûte au texte : la mise en page, les tableaux,
// les images, le sommaire, le saut de page, la publication, les accès, les
// exports, l'historique, l'assistance IA, le zoom, les favoris, les
// compteurs de mots, de signes et de marqueurs, les pastilles de présence.
// Rien n'est retiré du code ni du serveur : ces fonctions restent entières
// sur un écran d'ordinateur, elles ne sont simplement pas proposées ici.
//
// **Ce qui reste**, parce que c'est l'application : lire, écrire, le suivi
// des modifications, les commentaires, et le plan pour se déplacer dans un
// document long.

import { TextSelection } from 'prosemirror-state'
import { ouvrirFeuille } from './feuille.js'
import { suivreLeClavier } from './clavier.js'
import { ouvrirPlan } from './planFeuille.js'

/**
 * Installe l'interface téléphone. Ne fait rien si l'on n'est pas sur un
 * petit écran — et se défait proprement si l'écran s'élargit (un iPhone
 * qu'on tourne, un iPad qui sort de Split View).
 *
 * `pieces` : les éléments que l'éditeur a déjà construits, qu'on se contente
 * de replacer ou de masquer. Rien n'est dupliqué.
 */
export function monterInterfaceTelephone(pieces) {
  const {
    racine,
    topBanner,
    titleInput,
    toolbar,
    outlineSidebar,
    trackToggleLabel,
    getView,
    estCorrecteur,
    nbCommentaires,
    ouvrirCommentaire,
    outilsEssentiels = [],
    zoomSelect = null,
  } = pieces

  let mode = 'lecture'

  // --- L'en-tête : trois éléments, jamais plus.
  const entete = document.createElement('div')
  entete.className = 'tel-entete'

  const gauche = document.createElement('button')
  gauche.type = 'button'
  gauche.className = 'tel-gauche'

  const titre = document.createElement('div')
  titre.className = 'tel-titre'

  const plus = document.createElement('button')
  plus.type = 'button'
  plus.className = 'tel-plus'
  plus.textContent = '⋯'
  plus.setAttribute('aria-label', 'Plus')

  // --- Les outils essentiels, dans l'en-tête (23/09/2026).
  //
  // Pourquoi là, et pas au-dessus du clavier comme le font Google Docs ou
  // Obsidian : sur un iPhone, Safari intercale déjà **deux** rangées à
  // nous entre le texte et le clavier — la pastille du site et sa barre de
  // formulaire (∧ ∨ ✓) — qu'aucune API ne permet de retirer. Une troisième
  // rangée à nous ne laissait plus que trois lignes de texte visibles.
  // L'en-tête, lui, existe de toute façon : il accueille les deux ou trois
  // gestes de frappe, et le reste part dans le menu ⋯.
  const outils = document.createElement('div')
  outils.className = 'tel-outils'
  const placeDesOutils = new Map()
  for (const b of outilsEssentiels) {
    if (b) placeDesOutils.set(b, { parent: b.parentNode, voisin: b.nextSibling })
  }

  const filBouton = document.createElement('button')
  filBouton.type = 'button'
  filBouton.className = 'tel-outil'
  filBouton.textContent = '💬'
  filBouton.title = 'Commentaires'
  filBouton.setAttribute('aria-label', 'Commentaires')
  filBouton.onclick = () => ouvrirCommentaire()

  function prendreLesOutils() {
    for (const b of outilsEssentiels) if (b) outils.appendChild(b)
    outils.appendChild(filBouton)
  }
  function rendreLesOutils() {
    // Rendus exactement à leur place : ce sont les boutons de l'éditeur,
    // pas des copies, et leur ordre dans la barre a un sens.
    // À rebours : le voisin de droite du premier bouton est le second, qui
    // n'est de retour qu'une fois traité. Dans l'autre sens, le navigateur
    // jette « The child can not be found in the parent ».
    for (const b of [...outilsEssentiels].reverse()) {
      const place = placeDesOutils.get(b)
      if (!place || !place.parent) continue
      const voisin = place.voisin && place.voisin.parentNode === place.parent ? place.voisin : null
      place.parent.insertBefore(b, voisin)
    }
    filBouton.remove()
  }

  entete.append(gauche, titre, outils, plus)

  // --- Le crayon : en lecture seulement, en bas à droite, là où le pouce
  // arrive. C'est le geste d'entrée dans l'écriture.
  const crayon = document.createElement('button')
  crayon.type = 'button'
  crayon.className = 'tel-crayon'
  crayon.textContent = '✏️'
  crayon.setAttribute('aria-label', 'Modifier le document')

  function majTitre() {
    titre.textContent = titleInput.value || 'Sans titre'
  }
  majTitre()
  titleInput.addEventListener('input', majTitre)

  // Renommer depuis le téléphone : on touche le titre, il devient un champ.
  // Un correcteur n'y touche pas — c'est déjà la règle ailleurs.
  titre.onclick = () => {
    if (estCorrecteur()) return
    const feuille = ouvrirFeuille('Titre du document', { hauteur: 0.35, modale: true })
    const champ = document.createElement('input')
    champ.type = 'text'
    champ.className = 'feuille-filtre'
    champ.value = titleInput.value
    const valider = document.createElement('button')
    valider.type = 'button'
    valider.className = 'btn-accept'
    valider.textContent = 'Enregistrer'
    valider.onclick = () => {
      titleInput.value = champ.value
      // Passer par l'évènement du champ d'origine : c'est lui qui diffuse
      // le titre aux autres et l'enregistre, et il n'y a pas deux chemins.
      titleInput.dispatchEvent(new Event('input', { bubbles: true }))
      feuille.fermer()
    }
    feuille.corps.append(champ, valider)
    champ.focus()
    champ.select()
  }

  // --- Le menu ⋯ : tout ce qui n'est pas lire, écrire ou commenter.
  plus.onclick = () => {
    const feuille = ouvrirFeuille('Document', { hauteur: 0.45 })
    const liste = document.createElement('div')
    liste.className = 'tel-menu'

    const entree = (libelle, action, detail) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'tel-menu-entree'
      const nom = document.createElement('span')
      nom.textContent = libelle
      b.appendChild(nom)
      if (detail) {
        const d = document.createElement('em')
        d.textContent = detail
        b.appendChild(d)
      }
      b.onclick = action
      liste.appendChild(b)
      return b
    }

    if (mode === 'edition') {
      entree('Mise en forme', () => {
        // Même principe que le plan : la barre est **déménagée**, pas
        // recopiée. Ses boutons gardent leurs gestionnaires et leur état.
        ouvrirBarreOutils()
      })
    }

    entree('Plan du document', () => {
      // `ouvrirPlan` ferme cette feuille en s'ouvrant : jamais deux
      // feuilles empilées (voir feuille.js).
      ouvrirPlan(outlineSidebar)
    })

    const n = nbCommentaires()
    entree('Commentaires', () => {
      // Surtout pas de `fermerFeuille()` ici (banc du 23/09/2026) : la
      // fermeture passe par `history.back()`, qui est **asynchrone**. Son
      // `popstate` arrivait après l'ouverture du fil et refermait celui-ci
      // aussitôt — l'entrée du menu semblait ne rien faire, exactement le
      // défaut qu'avait le plan. On laisse donc la nouvelle feuille
      // remplacer l'ancienne : elle hérite de son entrée d'historique.
      ouvrirCommentaire()
    }, n ? `${n}` : 'aucun')

    // La taille du texte. Sur téléphone, c'est ici qu'elle se règle : le
    // suivi de la taille système a été abandonné au profit de ce zoom, qui
    // a l'avantage d'être le même partout et de ne pas faire doublon avec
    // le menu aA de Safari (voir style.css).
    if (zoomSelect) {
      const ligneZoom = document.createElement('div')
      ligneZoom.className = 'tel-menu-entree tel-menu-zoom'
      const nomZoom = document.createElement('span')
      nomZoom.textContent = 'Taille du texte'
      ligneZoom.append(nomZoom, zoomSelect)
      liste.appendChild(ligneZoom)
    }

    // Le suivi des modifications : l'interrupteur lui-même, déménagé dans
    // le menu. Pas une copie — l'état est unique.
    const ligneSuivi = document.createElement('div')
    ligneSuivi.className = 'tel-menu-entree tel-menu-suivi'
    ligneSuivi.appendChild(trackToggleLabel)
    liste.appendChild(ligneSuivi)

    feuille.corps.appendChild(liste)
    feuille.el.addEventListener('click', (e) => {
      // Refermer sur une entrée qui ne mène nulle part ailleurs.
      if (e.target.closest('.tel-menu-suivi') || e.target.closest('.tel-menu-zoom')) return
    })
  }

  /** La barre d'outils au complet, le temps d'une feuille. */
  function ouvrirBarreOutils() {
    const place = toolbar.parentNode
    const voisin = toolbar.nextSibling
    ouvrirFeuille('Mise en forme', {
      hauteur: 0.4,
      surFermeture() {
        toolbar.classList.remove('barre-dans-feuille')
        if (place) place.insertBefore(toolbar, voisin)
      },
    }).corps.appendChild(toolbar)
    toolbar.classList.add('barre-dans-feuille')
  }

  // --- Le passage d'un mode à l'autre.
  function appliquer() {
    const view = getView()
    racine.classList.toggle('tel-lecture', mode === 'lecture')
    racine.classList.toggle('tel-edition', mode === 'edition')
    gauche.textContent = mode === 'edition' ? '✓' : '‹'
    gauche.setAttribute('aria-label', mode === 'edition' ? 'Terminer' : 'Mes documents')
    if (view) view.setProps({ editable: () => mode === 'edition' })
    if (mode === 'edition') prendreLesOutils()
    else rendreLesOutils()
    reglerLaZoneVisible()
  }

  gauche.onclick = () => {
    if (mode === 'edition') {
      mode = 'lecture'
      appliquer()
      const view = getView()
      if (view) view.dom.blur()
      return
    }
    location.hash = '#/'
  }

  crayon.onclick = () => {
    mode = 'edition'
    appliquer()
    const view = getView()
    if (!view) return
    // Le cycle blur → focus différé (23/09/2026), et il n'est pas
    // décoratif. Safari sur iPhone décide de la façon dont il traite une
    // touche **au moment où il prend le nœud en charge** : un élément passé
    // de `contenteditable="false"` à `"true"` sans repasser par une mise au
    // point continue d'être traité comme un texte que l'on ne modifie pas,
    // et toucher le texte ne déplace alors pas le curseur — exactement ce
    // que Sylvain a constaté. Rendre la main au navigateur entre les deux
    // (un tour de boucle) suffit à lui faire relire l'état du nœud.
    view.dom.blur()
    setTimeout(() => {
      if (mode !== 'edition') return
      view.focus()
    }, 0)
  }

  // Un correcteur entre en écriture comme un éditeur : ses modifications
  // sont des propositions, c'est le suivi qui s'en charge, pas le mode.
  racine.prepend(entete)
  racine.appendChild(crayon)
  // Ce qui, en bas, recouvre réellement le texte. En écriture, plus rien : la
  // barre a quitté le bas de l'écran pour l'en-tête. Reste le crayon, en
  // lecture, et c'est tout — mais la règle est écrite une fois
  // pour toutes, de sorte qu'une future barre flottante s'y range aussi.
  const hauteurCouvrante = () => {
    const flottants = mode === 'lecture' ? [crayon] : []
    let bas = 0
    for (const el of flottants) {
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null
      if (r && r.height) bas = Math.max(bas, Math.round(r.height) + 24)
    }
    return bas
  }
  // Mesuré au banc (23/09/2026) : ProseMirror juge de la visibilité d'après
  // le rectangle du conteneur de défilement et ne voit pas ce qui flotte
  // par-dessus. `scrollThreshold` dit à partir d'où faire défiler,
  // `scrollMargin` jusqu'où le faire.
  function reglerLaZoneVisible() {
    const view = getView()
    if (!view) return
    const bord = { top: 0, right: 0, bottom: hauteurCouvrante(), left: 0 }
    view.setProps({ scrollThreshold: bord, scrollMargin: bord })
  }

  // Ramener le curseur **à l'ouverture du clavier seulement** (23/09/2026).
  //
  // La version précédente le faisait à chaque changement de hauteur. Or sur
  // iOS la fenêtre visuelle bouge aussi quand on fait défiler, clavier
  // ouvert : la barre du navigateur se replie et se déplie. On ramenait donc
  // la vue au curseur au moment même où l'on s'en éloignait du doigt — et le
  // toucher qui suivait tombait sur un texte qui venait de sauter, donc sur
  // rien. Sylvain : « quand le curseur est hors écran, le toucher n'a pas
  // d'effet ». On ne le fait plus qu'au passage de zéro à quelque chose.
  let clavierOuvert = false
  function auClavier(hauteur) {
    const ouvert = hauteur > 0
    const vientDeSOuvrir = ouvert && !clavierOuvert
    clavierOuvert = ouvert
    const view = getView()
    if (!view || mode !== 'edition') return
    reglerLaZoneVisible()
    if (vientDeSOuvrir) view.dispatch(view.state.tr.scrollIntoView())
  }

  // --- Le toucher fait autorité (23/09/2026).
  //
  // Safari sur iPhone avale parfois la pose du curseur : après un défilement
  // à l'élan, le premier toucher ne fait qu'arrêter la course ; et un
  // recouvrement de mise en page entre l'appui et le relâchement lui fait
  // annuler le placement. Dans les deux cas le doigt semble sans effet, et
  // c'est précisément quand le curseur était loin — donc quand on a fait
  // défiler pour aller le chercher.
  //
  // On ne se substitue pas au navigateur : on le laisse faire, et on ne
  // reprend la main que s'il n'a rien fait. Un glissement, un appui long
  // (la sélection de mot), un toucher à plusieurs doigts : on n'y touche pas.
  let depart = null
  racine.addEventListener(
    'touchstart',
    (e) => {
      depart =
        e.touches.length === 1
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
          : null
    },
    { passive: true }
  )
  racine.addEventListener(
    'touchend',
    (e) => {
      const d = depart
      depart = null
      const view = getView()
      const touche = e.changedTouches && e.changedTouches[0]
      if (!d || !view || !touche || mode !== 'edition') return
      if (!view.dom.contains(e.target)) return
      if (Math.abs(touche.clientX - d.x) > 8 || Math.abs(touche.clientY - d.y) > 8) return
      if (Date.now() - d.t > 500) return
      const avant = view.state.selection
      const x = touche.clientX
      const y = touche.clientY
      setTimeout(() => {
        if (mode !== 'edition') return
        // Le navigateur a fait son travail : on ne le refait pas.
        if (!view.state.selection.eq(avant)) return
        const point = view.posAtCoords({ left: x, top: y })
        if (!point) return
        const sel = TextSelection.near(view.state.doc.resolve(point.pos))
        if (sel.eq(avant)) return
        view.dispatch(view.state.tr.setSelection(sel))
        view.focus()
      }, 60)
    },
    { passive: true }
  )

  const arreterLeSuivi = suivreLeClavier(racine, auClavier)
  // L'interrupteur du suivi quitte la colonne de droite, qui n'existe plus
  // ici : il est retiré de la page et n'apparaît que dans le menu ⋯. Le
  // laisser dans une colonne masquée reviendrait à le rendre introuvable
  // tout en le gardant dans l'ordre de tabulation et pour les lecteurs
  // d'écran — présent sans être là, le pire des deux.
  trackToggleLabel.remove()
  appliquer()

  return {
    estEnEdition: () => mode === 'edition',
    demonter() {
      arreterLeSuivi()
      rendreLesOutils()
      entete.remove()
      crayon.remove()
      // L'interrupteur est rendu à l'éditeur, qui le remettra en tête de
      // la colonne de droite (voir `placerLeSuivi`).
      trackToggleLabel.remove()
      racine.classList.remove('tel-lecture', 'tel-edition')
      const view = getView()
      if (view) {
        const zero = { top: 0, right: 0, bottom: 0, left: 0 }
        view.setProps({ editable: () => true, scrollThreshold: zero, scrollMargin: zero })
      }
    },
  }
}
