// Le spécimen d'un modèle (28/10/2026) : une page miniature, montée à l'écran
// à partir de la feuille de style — format, marges, polices, tailles,
// alignement, numéro de page. C'est ce qui permet de **choisir un modèle en
// le voyant**, sur la carte de la page Modèles et à côté du formulaire.
//
// Il est **indicatif** : l'écran ne coupe pas les mots ni ne compose comme le
// PDF (Typst) ; le PDF fait foi. La page est construite à sa taille réelle
// (en millimètres) puis réduite d'un bloc, de sorte que les proportions entre
// marges, corps et interlignes sont celles du modèle.

import { dimensionsPage } from '../../shared/style.js'
import { buildStyleCss, fusionner } from './styleConfig.js'

const PX_PAR_MM = 96 / 25.4
let compteur = 0

const EXEMPLE = {
  titre: 'Premier chapitre',
  intertitre: 'Un intertitre',
  texte: [
    'Le texte courant occupe la largeur de la page, entre les marges du modèle. Il est composé dans la police et au corps réglés ici, avec leur interligne.',
    'Un second paragraphe montre le retrait de première ligne, l’espace entre paragraphes et l’alignement du texte, justifié ou non.',
  ],
  legende: 'Une légende',
  citation: 'Une citation se distingue par sa marge et son corps, sans guillemets ajoutés.',
}

/**
 * @param {object} style  une feuille de style (complète ou partielle)
 * @param {{ largeur?: number }} [options]  largeur du spécimen à l'écran, en pixels
 * @returns {{ el: HTMLElement, maj: (style: object) => void }}
 */
export function creerSpecimen(style, { largeur = 120 } = {}) {
  const id = `specimen-${++compteur}`

  const cadre = document.createElement('div')
  cadre.className = 'specimen'
  cadre.setAttribute('aria-hidden', 'true')

  const css = document.createElement('style')
  const feuille = document.createElement('div')
  feuille.className = `specimen-page ${id}`

  const h1 = document.createElement('h1')
  h1.textContent = EXEMPLE.titre
  const p1 = document.createElement('p')
  p1.textContent = EXEMPLE.texte[0]
  const p2 = document.createElement('p')
  p2.textContent = EXEMPLE.texte[1]
  const citation = document.createElement('blockquote')
  citation.textContent = EXEMPLE.citation
  const legende = document.createElement('p')
  legende.className = 'style-legende'
  legende.textContent = EXEMPLE.legende
  const separateur = document.createElement('div')
  separateur.className = 'specimen-separateur'
  const h2 = document.createElement('h2')
  h2.textContent = EXEMPLE.intertitre
  const p3 = document.createElement('p')
  p3.textContent = EXEMPLE.texte[0]
  const numero = document.createElement('div')
  numero.className = 'specimen-numero'
  feuille.append(h1, p1, p2, legende, separateur, citation, h2, p3, numero)
  cadre.append(css, feuille)

  function maj(nouveau) {
    const complet = fusionner(nouveau)
    const p = complet.page
    const [l, h] = dimensionsPage(p)
    const echelle = largeur / (l * PX_PAR_MM)
    cadre.style.width = `${largeur}px`
    cadre.style.height = `${Math.round(h * PX_PAR_MM * echelle)}px`
    feuille.style.width = `${l}mm`
    feuille.style.height = `${h}mm`
    feuille.style.padding = `${p.marginTop}mm ${p.marginRight}mm ${p.marginBottom}mm ${p.marginLeft}mm`
    feuille.style.transform = `scale(${echelle})`
    // Colonnes : le contenu se répartit, le numéro reste en place.
    feuille.style.columnCount = p.colonnes > 1 ? String(p.colonnes) : ''
    feuille.style.columnGap = p.colonnes > 1 ? `${p.gouttiere}mm` : ''
    const portee = `.specimen .${id}`
    // Ce que la feuille de style des blocs ne dit pas : premier paragraphe
    // sans retrait, descente d'un titre qui ouvre une page.
    const en_plus = []
    if (p.premierSansRetrait) en_plus.push(`${portee} h1 + p, ${portee} .specimen-separateur + p { text-indent: 0 }`)
    if (p.debutChapitre !== 'continuer' && p.descente > 0) en_plus.push(`${portee} h1 { margin-top: ${p.descente}mm }`)
    css.textContent = [buildStyleCss(complet, { scope: portee }), ...en_plus].join('\n')
    // Le séparateur de scène, tel que choisi.
    separateur.className = `specimen-separateur specimen-separateur-${p.separateur}`
    separateur.textContent = { asterisques: '*   *   *', asterisme: '⁂' }[p.separateur] || ''
    // Le numéro : on montre une page de droite (la première d'un livre).
    const pn = p.pageNumbers || {}
    numero.hidden = !pn.enabled
    numero.textContent = String(pn.startAt || 1)
    const enHaut = pn.position === 'haut-exterieur'
    numero.style.textAlign = !pn.position || pn.position === 'bas-centre' ? 'center' : 'right'
    numero.style.paddingRight = numero.style.textAlign === 'right' ? `${p.marginRight}mm` : '0'
    numero.style.bottom = enHaut ? '' : `${Math.max(2, p.marginBottom / 2 - 2)}mm`
    numero.style.top = enHaut ? `${Math.max(2, p.marginTop / 2 - 2)}mm` : ''
  }
  maj(style)
  return { el: cadre, maj }
}
