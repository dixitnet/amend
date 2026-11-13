// Les aides de l'écran d'édition : zoom mémorisé, textes des ajouts et filet de sécurité.
import { Component, useEffect, useState } from 'react'
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
    return [...REGLAGES.zoom.paliers, ...REGLAGES.zoom.paliersS].includes(z) ? z : REGLAGES.zoom.parDefaut
  } catch {
    return REGLAGES.zoom.parDefaut
  }
}
/** Le réseau est-il disponible ? (`navigator.onLine` et ses événements ; vrai quand le navigateur ne le dit pas.) */
export function useEnLigne() {
  const lire = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
  const [enLigne, setEnLigne] = useState(lire)
  useEffect(() => {
    const maj = () => setEnLigne(lire())
    window.addEventListener('online', maj)
    window.addEventListener('offline', maj)
    maj()
    return () => {
      window.removeEventListener('online', maj)
      window.removeEventListener('offline', maj)
    }
  }, [])
  return enLigne
}

/**
 * L'état de connexion à annoncer (13/11/2026) : « hors ligne » tout de suite
 * sans réseau, et aussi quand la connexion n'aboutit pas depuis plus de
 * `REGLAGES.synchro.delaiHorsLigne` ; sinon celui du fournisseur.
 */
export function useEtatAffiche(etat, enLigne) {
  // « Trop long » reste vrai tant que la connexion n'a pas abouti : le fournisseur
  // alterne « en connexion » et « déconnecté » à chaque essai, sans que le
  // picto ne clignote entre « hors ligne » et « synchronisation ».
  const [trop, setTrop] = useState(false)
  useEffect(() => {
    if (etat === 'connecte') setTrop(false)
    else if (etat === 'deconnecte') setTrop(true)
    else {
      const minuteur = setTimeout(() => setTrop(true), REGLAGES.synchro.delaiHorsLigne)
      return () => clearTimeout(minuteur)
    }
    return undefined
  }, [etat])
  return !enLigne || (etat !== 'connecte' && trop) ? 'deconnecte' : etat
}

/**
 * ESSAI (13/11/2026) : la barre de mise en forme en bandeau au format S.
 * `?barre=bandeau` dans l'adresse l'active et le retient dans ce navigateur ;
 * `?barre=flottante` revient à la palette flottante.
 */
const CLE_BARRE = 'amend.essai.barre'
export function lireEssaiBarre() {
  try {
    const demande = new URLSearchParams(location.search).get('barre')
    if (demande === 'bandeau') localStorage.setItem(CLE_BARRE, '1')
    else if (demande === 'flottante') localStorage.removeItem(CLE_BARRE)
    return localStorage.getItem(CLE_BARRE) === '1'
  } catch {
    return false
  }
}

/** Le palier proposé (d'une liste) le plus proche d'un zoom mémorisé : 50 % devient 100 % au format S.
 * À égale distance, le premier de la liste (les paliers vont du plus petit au plus grand). */
export const palierLePlusProche = (z, paliers) =>
  paliers.reduce((meilleur, p) => (Math.abs(p - z) < Math.abs(meilleur - z) ? p : meilleur), paliers[0])
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
  // La note de bas de page (12/11/2026) : bouton de la palette et menu « / ».
  note: {
    libelle: t('document.note'),
    titre: t('document.note'),
    description: t('document.noteDescription'),
    picto: <PictoDe role="noteDePageMenu" />,
    pictoPalette: <PictoDe role="noteDePage" />,
  },
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
  paragraphe: { picto: <PictoDe role="paragraphe" /> },
  sousTitre: {
    titre: t('document.sousTitre'),
    description: t('document.sousTitreDescription'),
    picto: <PictoDe role="sousTitre" />,
  },
  legende: {
    titre: t('document.legende'),
    description: t('document.legendeDescription'),
    picto: <PictoDe role="legende" />,
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
