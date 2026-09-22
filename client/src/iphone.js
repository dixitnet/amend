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

import { ouvrirFeuille, fermerFeuille } from './feuille.js'
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

  entete.append(gauche, titre, plus)

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

    entree('Plan du document', () => {
      // `ouvrirPlan` ferme cette feuille en s'ouvrant : jamais deux
      // feuilles empilées (voir feuille.js).
      ouvrirPlan(outlineSidebar)
    })

    const n = nbCommentaires()
    entree('Commentaires', () => {
      fermerFeuille()
      ouvrirCommentaire()
    }, n ? `${n}` : 'aucun')

    // Le suivi des modifications : l'interrupteur lui-même, déménagé dans
    // le menu. Pas une copie — l'état est unique.
    const ligneSuivi = document.createElement('div')
    ligneSuivi.className = 'tel-menu-entree tel-menu-suivi'
    ligneSuivi.appendChild(trackToggleLabel)
    liste.appendChild(ligneSuivi)

    feuille.corps.appendChild(liste)
    feuille.el.addEventListener('click', (e) => {
      // Refermer sur une entrée qui ne mène nulle part ailleurs.
      if (e.target.closest('.tel-menu-suivi')) return
    })
  }

  // --- Le passage d'un mode à l'autre.
  function appliquer() {
    const view = getView()
    racine.classList.toggle('tel-lecture', mode === 'lecture')
    racine.classList.toggle('tel-edition', mode === 'edition')
    gauche.textContent = mode === 'edition' ? '✓' : '‹'
    gauche.setAttribute('aria-label', mode === 'edition' ? 'Terminer' : 'Mes documents')
    if (view) view.setProps({ editable: () => mode === 'edition' })
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
    if (view) view.focus()
  }

  // Un correcteur entre en écriture comme un éditeur : ses modifications
  // sont des propositions, c'est le suivi qui s'en charge, pas le mode.
  racine.prepend(entete)
  racine.appendChild(crayon)
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
      entete.remove()
      crayon.remove()
      // L'interrupteur est rendu à l'éditeur, qui le remettra en tête de
      // la colonne de droite (voir `placerLeSuivi`).
      trackToggleLabel.remove()
      racine.classList.remove('tel-lecture', 'tel-edition')
      const view = getView()
      if (view) view.setProps({ editable: () => true })
    },
  }
}
