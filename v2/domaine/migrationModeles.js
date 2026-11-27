// La reprise des modèles enregistrés avant le 13/11/2026 (code transitoire) :
// un modèle d'alors était un modèle de base et des écarts (ADR 0011) ; il
// devient un modèle complet, avec un jeu de réglages par style. À retirer
// quand plus aucun modèle n'est enregistré à l'ancienne façon.

import { poser, margeBasPourLignes, stylesEnPoints, lignesQuiTiennent, completerModele } from './miseEnPage.js'
import { REGLE_EN_LIGNES, estEnLignes, lignesOccupees } from './miseEnPageLignes.js'
import { PT_PAR_MM } from './ecritureTypst.js'

/** « A4 simple » tel que le code le livrait jusqu'au 13/11/2026. */
const A4_ANCIEN = Object.freeze({
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
  const modele = versModeleParStyleEnLignes(ancien)
  // Les blancs, en points (15/11/2026).
  return stylesEnPoints(modele, modele)
}
function versModeleParStyleEnLignes(ancien) {
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
    alinea: 0,
    retrait: 0,
  }
  const titre = ancien.titre ?? { corps: c.corps, graisse: c.graisse }
  const sousTitre = ancien.sousTitre ?? { corps: c.corps, italique: true }
  return {
    page: structuredClone(ancien.page),
    // La marge basse qui laisse le nombre de lignes par page d'alors (15/11/2026).
    marges: { ...structuredClone(ancien.marges), bas: margeBasPourLignes(ancien, g.lignes) },
    grille: { corps: g.corps, interligne: g.interligne },
    folio: structuredClone(ancien.folio),
    // Les textes libres des en-têtes (15/11/2026) manquent aux anciens modèles.
    enTete: { texteGauche: '', texteDroite: '', ...structuredClone(ancien.enTete) },
    // Les images (14 et 15/11/2026) : toute la largeur, sans numérotation.
    image: { largeur: 100 },
    separateur: ancien.separateur,
    cesure: ancien.cesure,
    chapitre: {
      debut: c.debut,
      premierSansAlinea: true,
      ligneTitre: c.ligneTitre,
      ligneTexte: c.ligneTexte,
      interligne: c.interligne,
    },
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
        alinea: 0,
        retrait: 0,
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
        alinea: 0,
        retrait: 0,
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
        alinea: 0,
        retrait: 0,
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
        alinea: 0,
        retrait: 0,
      },
    },
  }
}

// --- Des points aux lignes (27/11/2026, docs/v2-grille-plan.md, § 5 : « conversion automatique ») --------
//
// Un modèle enregistré avant la grille stricte compte ses blancs en points et règle sa marge basse. Il devient
// un modèle compté en lignes, au plus proche. Code transitoire : à retirer, avec le gabarit en points, quand plus
// aucun modèle n'est enregistré à l'ancienne façon.

/** « A4 simple » tel que le design le livrait jusqu'au 27/11/2026, en points : ce qui manquait à un modèle
 * enregistré d'alors se complétait par lui. */
const A4_EN_POINTS = Object.freeze({
  page: { largeur: 210, hauteur: 297 },
  marges: { haut: 25, interieure: 20, exterieure: 20, bas: 25.5 },
  grille: { corps: 11, interligne: 14 },
  folio: { bas: 15, position: 'bas-centre', depart: 1, ouverture: true, ouverture2: true },
  enTete: {
    gauche: 'rien',
    droite: 'rien',
    texteGauche: '',
    texteDroite: '',
    police: '',
    corps: 11,
    italique: true,
    petitesCapitales: false,
    alignement: 'centre',
  },
  separateur: 'blanc',
  cesure: true,
  image: { largeur: 100 },
  chapitre: { debut: 'page', premierSansAlinea: true, ligneTitre: 3, ligneTexte: 7, interligne: 19 },
  ouverture2: { debut: 'continuer', ligneTitre: 3, ligneTexte: 7, interligne: 19 },
  styles: {
    texte: { police: 'EB Garamond', gras: false, italique: false, alignement: 'justifie', alinea: 5 },
    citation: {
      police: 'EB Garamond',
      corps: 11,
      gras: false,
      italique: false,
      capitales: false,
      petitesCapitales: false,
      alignement: 'justifie',
      espaceAvant: 3,
      espaceApres: 3,
      alinea: 5,
      retrait: 8,
      retraitSuspendu: 0,
    },
    bibliographie: {
      police: '',
      corps: 11,
      gras: false,
      italique: false,
      capitales: false,
      petitesCapitales: false,
      alignement: 'gauche',
      espaceAvant: 3,
      espaceApres: 3,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 5,
    },
    titre1: {
      police: 'EB Garamond',
      corps: 16,
      gras: true,
      italique: false,
      capitales: false,
      petitesCapitales: false,
      alignement: 'centre',
      alinea: 0,
      retrait: 0,
    },
    titre2: {
      police: 'EB Garamond',
      corps: 11,
      gras: false,
      italique: true,
      capitales: false,
      petitesCapitales: false,
      alignement: 'gauche',
      espaceAvant: 17,
      espaceApres: 3,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
    titre3: {
      police: 'EB Garamond',
      corps: 11,
      gras: false,
      italique: true,
      capitales: false,
      petitesCapitales: false,
      alignement: 'gauche',
      espaceAvant: 17,
      espaceApres: 3,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
    titre4: {
      police: 'EB Garamond',
      corps: 11,
      gras: false,
      italique: true,
      capitales: false,
      petitesCapitales: false,
      alignement: 'gauche',
      espaceAvant: 17,
      espaceApres: 3,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
    titre5: {
      police: 'EB Garamond',
      corps: 11,
      gras: false,
      italique: true,
      capitales: false,
      petitesCapitales: false,
      alignement: 'gauche',
      espaceAvant: 17,
      espaceApres: 3,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
    titre: {
      police: 'EB Garamond',
      corps: 20,
      gras: true,
      italique: false,
      capitales: false,
      petitesCapitales: false,
      alignement: 'centre',
      espaceAvant: 9.8,
      espaceApres: 15.2,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
    sousTitre: {
      police: 'EB Garamond',
      corps: 14,
      gras: false,
      italique: true,
      capitales: false,
      petitesCapitales: false,
      alignement: 'centre',
      espaceAvant: 14.6,
      espaceApres: 16.4,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
    legende: {
      police: 'EB Garamond',
      corps: 9,
      gras: false,
      italique: true,
      capitales: false,
      petitesCapitales: false,
      alignement: 'centre',
      espaceAvant: 4.6,
      espaceApres: 17.4,
      alinea: 0,
      retrait: 0,
      retraitSuspendu: 0,
    },
  },
})

const demiLignes = (x) => Math.max(0, Math.round(x * 2) / 2)

/**
 * Un modèle complet en points, devenu un modèle compté en lignes.
 * - La première ligne de base ne bouge pas : la marge de tête se compte désormais jusqu'au haut de la première
 *   brique (un pas au-dessus de la ligne de base), non plus jusqu'au haut des lettres.
 * - Le nombre de lignes par page est celui que la marge basse laissait.
 * - Un blanc en points devient des demi-lignes : ce qu'il ajoutait à l'espace ordinaire entre deux paragraphes.
 * - Un titre qui avait ses lignes d'ouverture garde la ligne de son titre et celle où le texte reprend.
 * - Ce que la grille stricte ne règle plus est abandonné (plan, § 7) : alinéa et retraits par style,
 *   marge basse, place du numéro de page en millimètres, police, corps et alignement des en-têtes.
 *   La police d'un style, elle, est gardée (27/11/2026).
 * @param {object} ancien  un modèle complet en points (voir `gabaritTypst`)
 * @param {number} hauteurTitre  la hauteur d'une ligne de titre par unité de corps (design)
 */
export function versModeleEnLignes(ancien, hauteurTitre) {
  const g = ancien.grille
  const pas = g.interligne
  const ordinaire = pas - g.corps
  const blanc = (points) => demiLignes(((Number.isFinite(points) ? points : ordinaire) - ordinaire) / pas)
  // La police d'un style : gardée si elle n'est pas celle du texte (vide : celle du texte).
  // Sans police de texte connue (un modèle incomplet), toute police de style est gardée.
  const policeDuTexte = ancien.styles?.texte?.police
  const allure = (st) => ({
    police: st.police && st.police !== policeDuTexte ? st.police : '',
    corps: st.corps ?? g.corps,
    gras: Boolean(st.gras),
    italique: Boolean(st.italique),
    capitales: Boolean(st.capitales),
    petitesCapitales: Boolean(st.petitesCapitales),
  })
  // Hors du texte courant, un style est à gauche ou centré ; la citation suit le texte.
  const place = (st) => (st.alignement === 'centre' ? 'centre' : 'gauche')
  const style = (nom) => {
    const st = ancien.styles?.[nom] ?? {}
    return {
      ...allure(st),
      alignement: place(st),
      blancAvant: blanc(st.espaceAvant),
      blancApres: blanc(st.espaceApres),
    }
  }
  // Un titre à lignes d'ouverture : sa ligne de base reste sur `ligneTitre`, le texte reprend à `ligneTexte`.
  // (Un titre si gros qu'il occupe plus de lignes qu'il n'y en a avant `ligneTitre` descend d'autant : pas de blanc négatif.)
  const ouvrant = (nom, o) => {
    // Sans lignes d'ouverture lisibles (un modèle incomplet), le titre garde les blancs de son style.
    if (!Number.isFinite(o?.ligneTitre) || !Number.isFinite(o?.ligneTexte)) return style(nom)
    const st = ancien.styles?.[nom] ?? {}
    const occupe = lignesOccupees(st.corps ?? g.corps, pas, hauteurTitre)
    return {
      ...allure(st),
      alignement: place(st),
      blancAvant: Math.max(0, o.ligneTitre - occupe),
      blancApres: Math.max(0, o.ligneTexte - o.ligneTitre - 1),
    }
  }
  const o2 = { debut: 'continuer', ...ancien.ouverture2 }
  const texte = ancien.styles?.texte ?? {}
  const f = ancien.folio ?? {}
  const e = ancien.enTete ?? {}
  return {
    regle: REGLE_EN_LIGNES,
    page: { largeur: ancien.page.largeur, hauteur: ancien.page.hauteur },
    marges: {
      haut: Math.max(0, Math.round((ancien.marges.haut + (0.8 * g.corps - pas) / PT_PAR_MM) * 10) / 10),
      interieure: ancien.marges.interieure,
      exterieure: ancien.marges.exterieure,
    },
    grille: { corps: g.corps, interligne: pas, lignes: lignesQuiTiennent(ancien), hauteurTitre },
    folio: {
      position: f.position ?? 'bas-centre',
      depart: f.depart ?? 1,
      ouverture: f.ouverture !== false,
      ouverture2: f.ouverture2 !== false,
    },
    enTete: {
      gauche: e.gauche ?? 'rien',
      droite: e.droite ?? 'rien',
      texteGauche: e.texteGauche ?? '',
      texteDroite: e.texteDroite ?? '',
      italique: e.italique !== false,
      petitesCapitales: Boolean(e.petitesCapitales),
    },
    chapitre: {
      debut: ancien.chapitre?.debut ?? (ancien.chapitre?.bellePage === false ? 'page' : 'belle-page'),
      premierSansAlinea: ancien.chapitre?.premierSansAlinea !== false,
    },
    ouverture2: { debut: o2.debut },
    separateur: ancien.separateur ?? 'blanc',
    cesure: ancien.cesure !== false,
    image: { largeur: ancien.image?.largeur ?? 100 },
    styles: {
      texte: {
        police: texte.police,
        gras: Boolean(texte.gras),
        italique: Boolean(texte.italique),
        alignement: texte.alignement === 'gauche' ? 'gauche' : 'justifie',
        alinea: texte.alinea ?? 0,
      },
      titre: style('titre'),
      sousTitre: style('sousTitre'),
      titre1: ouvrant('titre1', ancien.chapitre),
      titre2: o2.debut === 'continuer' ? style('titre2') : ouvrant('titre2', o2),
      titre3: style('titre3'),
      titre4: style('titre4'),
      titre5: style('titre5'),
      // Un style en briques ne dépasse pas le pas.
      citation: { ...style('citation'), corps: Math.min(pas, ancien.styles?.citation?.corps ?? g.corps) },
      bibliographie: {
        ...style('bibliographie'),
        corps: Math.min(pas, ancien.styles?.bibliographie?.corps ?? g.corps),
      },
      legende: { ...style('legende'), corps: Math.min(pas, ancien.styles?.legende?.corps ?? g.corps) },
    },
  }
}

/**
 * Les valeurs d'un modèle enregistré, en lignes : telles quelles si elles le sont déjà, converties sinon
 * (complétées d'abord, à l'ancienne façon, par « A4 simple » en points).
 * @param {object} valeurs  ce que le modèle enregistré porte
 * @param {number} hauteurTitre
 */
export function valeursEnLignes(valeurs, hauteurTitre) {
  if (estEnLignes(valeurs)) return valeurs
  return versModeleEnLignes(completerModele(valeurs ?? {}, A4_EN_POINTS), hauteurTitre)
}
