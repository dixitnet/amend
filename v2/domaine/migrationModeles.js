// La reprise des modèles enregistrés avant le 13/11/2026 (code transitoire) :
// un modèle d'alors était un modèle de base et des écarts (ADR 0011) ; il
// devient un modèle complet, avec un jeu de réglages par style. À retirer
// quand plus aucun modèle n'est enregistré à l'ancienne façon.

import { poser } from './miseEnPage.js'

/** « A4 simple » tel que le code le livrait jusqu'au 13/11/2026. */
export const A4_ANCIEN = Object.freeze({
  page: { largeur: 210, hauteur: 297 },
  marges: { haut: 25, interieure: 20, exterieure: 20 },
  grille: { corps: 11, interligne: 14, lignes: 50 },
  police: 'EB Garamond',
  alinea: 5,
  folio: { bas: 15, position: 'bas-centre', depart: 1, ouverture: true },
  enTete: { gauche: 'rien', droite: 'rien' },
  chapitre: { debut: 'page', ligneTitre: 3, ligneTexte: 7, corps: 16, interligne: 19, graisse: 600 },
  intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
  citation: { retrait: 8 },
  titre: { corps: 20, graisse: 600 },
  sousTitre: { corps: 14, italique: true },
  separateur: 'blanc',
  cesure: true,
})

/**
 * Le modèle complet, à l'ancienne façon, d'un modèle enregistré : son modèle
 * de base (celui du code, ou un modèle de l'instance, lui-même ainsi résolu)
 * puis ses écarts, sans les contrôler.
 * @param {{ base: string, ecarts: object }} entree
 * @param {(id: string) => ({ base: string, ecarts: object } | null)} instance
 * @param {string} idCode  l'identifiant du modèle du code
 */
export function ancienModele(entree, instance, idCode, profondeur = 0) {
  let modele
  if (entree.base === idCode || profondeur > 3) modele = structuredClone(A4_ANCIEN)
  else {
    const parent = instance(entree.base)
    modele = parent ? ancienModele(parent, instance, idCode, profondeur + 1) : structuredClone(A4_ANCIEN)
  }
  for (const [cle, valeur] of Object.entries(entree.ecarts ?? {})) {
    // L'ancien réglage « belle page » (avant le 12/11/2026) est le début de chapitre.
    if (cle === 'chapitre.bellePage') poser(modele, 'chapitre.debut', valeur ? 'belle-page' : 'page')
    else poser(modele, cle, valeur)
  }
  return modele
}

/** Un modèle à l'ancienne façon, devenu un modèle complet par style. */
export function versModeleParStyle(ancien) {
  const g = ancien.grille
  const c = ancien.chapitre
  const police = ancien.police
  const gras = (graisse) => (graisse ?? 400) >= 600
  const intertitre = {
    police,
    corps: g.corps,
    gras: false,
    italique: ancien.intertitres?.italique ?? true,
    capitales: false,
    alignement: 'gauche',
    lignesAvant: ancien.intertitres?.lignesAvant ?? 1,
    lignesApres: ancien.intertitres?.lignesApres ?? 0,
  }
  const titre = ancien.titre ?? { corps: c.corps, graisse: c.graisse }
  const sousTitre = ancien.sousTitre ?? { corps: c.corps, italique: true }
  return {
    page: structuredClone(ancien.page),
    marges: structuredClone(ancien.marges),
    grille: structuredClone(g),
    folio: structuredClone(ancien.folio),
    enTete: structuredClone(ancien.enTete),
    separateur: ancien.separateur,
    cesure: ancien.cesure,
    chapitre: { debut: c.debut, ligneTitre: c.ligneTitre, ligneTexte: c.ligneTexte, interligne: c.interligne },
    styles: {
      texte: {
        police,
        gras: false,
        italique: false,
        alignement: 'justifie',
        alinea: ancien.alinea,
      },
      citation: {
        police,
        corps: g.corps,
        gras: false,
        italique: false,
        capitales: false,
        alignement: 'justifie',
        lignesAvant: 0,
        lignesApres: 0,
        alinea: ancien.alinea,
        retrait: ancien.citation?.retrait ?? 0,
      },
      titre1: {
        police,
        corps: c.corps,
        gras: gras(c.graisse),
        italique: false,
        capitales: false,
        alignement: 'centre',
      },
      titre2: { ...intertitre },
      titre3: { ...intertitre },
      titre4: { ...intertitre },
      titre5: { ...intertitre },
      titre: {
        police,
        corps: titre.corps,
        gras: gras(titre.graisse),
        italique: false,
        capitales: false,
        alignement: 'centre',
        lignesAvant: 0,
        lignesApres: 1,
      },
      sousTitre: {
        police,
        corps: sousTitre.corps,
        gras: false,
        italique: sousTitre.italique ?? true,
        capitales: false,
        alignement: 'centre',
        lignesAvant: 0,
        lignesApres: 1,
      },
      legende: {
        police,
        corps: 9,
        gras: false,
        italique: true,
        capitales: false,
        alignement: 'centre',
        lignesAvant: 0,
        lignesApres: 1,
      },
    },
  }
}
