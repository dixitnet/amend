// Les aides de l'écran d'édition : zoom mémorisé, textes des ajouts et filet de sécurité.
import { Component } from 'react'
import { PictoDe } from '../../design/index.js'
import { REGLAGES } from '../../design/reglages.js'
import { t } from './commun.js'
import { PROFONDEURS_TABLE } from '../../domaine/index.js'

/** Le zoom du texte de l'éditeur (Sylvain, 11/11/2026 : 50, 100, 150 %, comme
 * la v1) : propre à ce navigateur, une commodité perdue sans conséquence. */
const CLE_ZOOM = 'amend.zoom'
export function lireZoom() {
  try {
    const z = Number(localStorage.getItem(CLE_ZOOM))
    return REGLAGES.zoom.paliers.includes(z) ? z : REGLAGES.zoom.parDefaut
  } catch {
    return REGLAGES.zoom.parDefaut
  }
}
export function noterZoom(z) {
  try {
    localStorage.setItem(CLE_ZOOM, String(z))
  } catch {
    // stockage refusé (navigation privée) : le zoom vaut pour cette page seulement
  }
}

/** Les libellés et pictos des ajouts de l'éditeur (exposant, table des matières, titre et sous-titre). */
export const TEXTES_EDITEUR = {
  exposant: { libelle: t('document.exposant'), picto: <PictoDe role="exposant" /> },
  table: {
    titre: t('document.tableDesMatieres'),
    description: t('document.tableDescription'),
    profondeur: t('document.tableProfondeur'),
    // Les options du choix de la profondeur, en clair (« Niveaux 1 à 3 »).
    niveaux: Object.fromEntries(PROFONDEURS_TABLE.map((n) => [n, t('document.tableNiveaux', { n })])),
    picto: <PictoDe role="tableDesMatieres" />,
  },
  date: { titre: t('document.date'), description: t('document.dateDescription'), picto: <PictoDe role="date" /> },
  titre: { titre: t('document.titre'), description: t('document.titreDescription'), picto: <PictoDe role="titre" /> },
  sousTitre: {
    titre: t('document.sousTitre'),
    description: t('document.sousTitreDescription'),
    picto: <PictoDe role="sousTitre" />,
  },
}

/**
 * Filet de sécurité de l'éditeur (contournement, veille ; Sylvain, 11/11/2026) :
 * si l'affichage des suggestions plante (document que Yjs ne sait plus rendre en
 * suggestion), on ne laisse pas la page blanche ; `surErreur` décide de la suite.
 */
export class FiletDeLEditeur extends Component {
  state = { erreur: null }
  static getDerivedStateFromError(erreur) {
    return { erreur }
  }
  componentDidCatch(erreur) {
    console.error('éditeur :', erreur)
    this.props.surErreur?.(erreur)
  }
  render() {
    return this.state.erreur ? this.props.repli : this.props.children
  }
}
