// Le modèle de mise en page d'un livre (couche 4), en JavaScript pur.
//
// Depuis le 27/11/2026 un modèle est compté en lignes : sa grille et son gabarit Typst sont dans
// `miseEnPageLignes.js` (docs/v2-grille-plan.md). Ce module garde ce qui vaut pour tout modèle : régler,
// vérifier, compléter, choisir. Il garde aussi, pour la conversion des modèles enregistrés en points
// (`migrationModeles.js`), ce qui lisait l'ancienne façon : le nombre de lignes que laissait une marge basse,
// les points que valait une ligne blanche. Le gabarit en points, lui, a été retiré.

import { PT_PAR_MM, chaineTypst } from './ecritureTypst.js'
import { estEnLignes, grilleEnLignes, gabaritEnLignes } from './miseEnPageLignes.js'

export { chaineTypst }

/** Une ligne de Typst a une boîte de 1 em : 0,8 em au-dessus de la ligne de
 * base, 0,2 em en dessous. Le pas entre deux lignes de base vaut alors
 * exactement l'interligne, quel que soit le dessin de la police. */
const HAUT = 0.8
const BAS = 0.2

/**
 * Combien de lignes de la grille tiennent entre la marge de tête et la marge
 * basse du modèle : n lignes tiennent, n + 1 non (Sylvain, 15/11/2026 : la
 * personne règle la marge basse, le nombre de lignes s'en déduit).
 * @param {{ page: { hauteur: number }, marges: { haut: number, bas: number }, grille: { corps: number, interligne: number } }} modele
 * @returns {number}
 */
export function lignesQuiTiennent({ page, marges, grille: g }) {
  const disponible = (page.hauteur - marges.haut - marges.bas) * PT_PAR_MM
  return Math.floor((disponible - g.corps - (g.interligne - g.corps) / 2) / g.interligne) + 1
}

/**
 * La marge basse (mm, arrondie à 0,1 mm vers le bas) qui laisse exactement
 * `lignes` lignes à la page : pour reprendre un modèle écrit en lignes par page.
 * @param {{ page: { hauteur: number }, marges: { haut: number }, grille: { corps: number, interligne: number } }} modele
 * @param {number} lignes
 */
export function margeBasPourLignes({ page, marges, grille: g }, lignes) {
  const hauteurTexte = (lignes - 1) * g.interligne + g.corps + (g.interligne - g.corps) / 2
  return Math.floor((page.hauteur - marges.haut - hauteurTexte / PT_PAR_MM) * 10) / 10
}

/**
 * Ce que la grille impose à la page d'un modèle (voir `grilleEnLignes`). Depuis le 27/11/2026 un modèle est compté
 * en lignes ; un modèle en points se convertit d'abord (`valeursEnLignes`) : ici, il est refusé.
 * @param {object} modele
 */
export function grille(modele) {
  if (!estEnLignes(modele)) throw impossible('valeur')
  return grilleEnLignes(modele)
}

const impossible = (raison) =>
  Object.assign(new Error(`modèle impossible : ${raison}`), { code: 'modele-impossible', raison })

// --- Les styles d'un modèle (13/11/2026) ------------------------------------
//
// Chaque style du livre a son jeu de réglages, repris de la v1 (`shared/style.js` :
// police, taille, gras, italique, majuscules, alignement, espaces, retraits) et
// adapté à la grille : les espaces se comptent en lignes. Un modèle est une
// copie complète : on le crée à partir d'un autre, puis il est indépendant.

/** Les styles réglables d'un modèle, dans l'ordre du formulaire. */
export const NOMS_STYLES = Object.freeze([
  'texte',
  'citation',
  'bibliographie',
  'titre1',
  'titre2',
  'titre3',
  'titre4',
  'titre5',
  'titre',
  'sousTitre',
  'legende',
])

/**
 * Le blanc, en pt, entre un bloc et le texte voisin pour que le texte retombe
 * sur la grille : `n` lignes blanches au moins, davantage si le corps du bloc
 * l'exige ; jamais moins que l'espace ordinaire entre deux paragraphes, que
 * Typst ferait gagner sinon.
 */
function blancSurGrille({ pas, corps }, n, corpsDuBloc, cote) {
  const ordinaire = pas - corps
  for (let k = Math.max(0, n); k <= n + 60; k++) {
    const v =
      cote === 'avant'
        ? (1 + k) * pas - BAS * corps - HAUT * corpsDuBloc
        : (1 + k) * pas - BAS * corpsDuBloc - HAUT * corps
    if (v >= ordinaire - 1e-9) return v
  }
  return ordinaire
}

/**
 * Le préambule Typst d'un livre (voir `gabaritEnLignes`). Le gabarit en points a été retiré le 27/11/2026, une fois
 * les modèles comptés en lignes en production (Sylvain : « retire l'ancien gabarit en points une fois en ligne ») ;
 * un modèle en points se convertit d'abord (`valeursEnLignes`) : ici, il est refusé.
 * @param {object} modele  un modèle compté en lignes
 * @param {{ titre?: string, langue?: string, auteur?: string, surlignage?: string }} [document]
 * @returns {string}
 */
export function gabaritTypst(modele, document = {}) {
  if (!estEnLignes(modele)) throw impossible('valeur')
  return gabaritEnLignes(modele, document)
}

// --- Les modèles (ADR 0011, revu le 13/11/2026) ------------------------------
//
// Un modèle est une copie complète : on le crée à partir d'un modèle existant,
// puis il est indépendant (Sylvain, 13/11/2026 : « après, pas besoin de faire
// référence à cette filiation »). Ses réglages sont pris dans une liste fermée
// de réglages bornés (décidée dans le design et passée ici en paramètre).

const lire = (objet, cle) => cle.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), objet)
const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype'])
export function poser(objet, cle, valeur) {
  const k = cle.split('.')
  let o = objet
  // Jamais une clé qui toucherait au prototype (audit du 16/11/2026).
  if (k.some((p) => CLES_INTERDITES.has(p))) return
  for (const p of k.slice(0, -1)) o = o[p] = { ...(o[p] ?? {}) }
  o[k.at(-1)] = valeur
}
const refus = (code, reglage) => ({ ok: false, code, ...(reglage ? { reglage } : {}) })
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Un caractère de texte libre : ni contrôle, ni saut de ligne ou de paragraphe Unicode. */
const sansControle = (c) => {
  const n = c.codePointAt(0)
  return n >= 0x20 && !(n >= 0x7f && n <= 0x9f) && n !== 0x2028 && n !== 0x2029
}

/** Une valeur est-elle permise par la description d'un réglage ? */
function valeurPermise(r, v, polices) {
  if (r.type === 'booleen') return typeof v === 'boolean'
  if (r.type === 'police')
    return typeof v === 'string' && ((r.herite && v === '') || polices.some((p) => p.famille === v))
  if (r.type === 'choix') return r.options.includes(v)
  // Un texte libre : sur une seule ligne, sans caractère de contrôle, borné.
  if (r.type === 'texte') return typeof v === 'string' && v.length <= (r.max ?? 100) && [...v].every(sansControle)
  if (r.type !== 'nombre' && r.type !== 'entier') return false
  if (typeof v !== 'number' || !Number.isFinite(v)) return false
  if (r.type === 'entier' && !Number.isInteger(v)) return false
  // Un réglage compté par pas entiers (les blancs, par demi-ligne : `multiple: 0.5`).
  if (r.multiple !== undefined && !Number.isInteger(Math.round((v / r.multiple) * 1e6) / 1e6)) return false
  return !(r.min !== undefined && v < r.min) && !(r.max !== undefined && v > r.max)
}

/**
 * Les réglages d'un modèle changés : le modèle complet qui en résulte.
 * @param {object} modele  le modèle actuel (voir `gabaritTypst`)
 * @param {Record<string, any>} reglages  `{ 'page.largeur': 135, 'styles.texte.police': '…' }`
 * @param {{ reglables: Array<{ cle: string, type: string, min?: number, max?: number, options?: string[] }>,
 *   polices: Array<{ famille: string }>, largeurUtileMin?: number }} regles
 * @returns {{ ok: true, modele: object } | { ok: false, code: string, reglage?: string, raison?: string }}
 *   codes : `reglages-invalides`, `reglage-inconnu`, `reglage-hors-bornes`,
 *   `modele-impossible` (la grille ne tient pas dans la page)
 */
export function appliquerReglages(modele, reglages, { reglables, polices, largeurUtileMin = 0 }) {
  if (!estObjet(reglages)) return refus('reglages-invalides')
  const resultat = structuredClone(modele)
  for (const [cle, valeur] of Object.entries(reglages)) {
    const r = reglables.find((x) => x.cle === cle)
    if (!r) return refus('reglage-inconnu', cle)
    if (!valeurPermise(r, valeur, polices)) return refus('reglage-hors-bornes', cle)
    poser(resultat, cle, valeur)
  }
  const utile = resultat.page.largeur - resultat.marges.interieure - resultat.marges.exterieure
  if (utile < largeurUtileMin) return { ...refus('modele-impossible'), raison: 'largeur' }
  try {
    grille(resultat)
  } catch (e) {
    if (e.code !== 'modele-impossible') throw e
    return { ...refus('modele-impossible'), raison: e.raison }
  }
  return { ok: true, modele: resultat }
}

/** Un modèle complet respecte-t-il ses règles ? (tous ses réglages sont présents et permis) */
export function verifierModele(modele, regles) {
  const reglages = Object.fromEntries(regles.reglables.map((r) => [r.cle, lire(modele, r.cle)]))
  return appliquerReglages(modele, reglages, regles)
}

/** Un modèle enregistré, complété par les valeurs d'un modèle de référence pour
 * ce qui lui manque (un réglage ajouté depuis qu'il a été enregistré). */
export function completerModele(valeurs, defaut) {
  const complet = fusionner(valeurs, defaut)
  // Un modèle compté en lignes (27/11/2026) n'a rien à reprendre de l'ancienne façon.
  if (estEnLignes(complet)) return complet
  // Un modèle enregistré en lignes par page (avant le 15/11/2026) : la marge
  // basse qui laisse ce nombre de lignes remplace celle du modèle de référence.
  if (Number.isFinite(valeurs?.grille?.lignes)) {
    if (!Number.isFinite(valeurs?.marges?.bas)) complet.marges.bas = margeBasPourLignes(complet, valeurs.grille.lignes)
    delete complet.grille.lignes // la marge basse fait foi, plus de donnée morte
  }
  stylesEnPoints(complet, valeurs)
  // Ce qui manque à un modèle enregistré avant le 19/11/2026 se déduit de lui,
  // non du modèle de référence : le rendu d'un modèle déjà réglé ne change pas.
  const g = complet.grille
  // Le titre 2 reste dans le flux ; ses lignes d'ouverture, s'il vient à ouvrir une page, sont celles du titre 1.
  if (!estObjet(valeurs?.ouverture2) && complet.chapitre) {
    const { ligneTitre, ligneTexte, interligne } = complet.chapitre
    complet.ouverture2 = { debut: 'continuer', ligneTitre, ligneTexte, interligne }
  }
  // Les en-têtes étaient au corps du texte.
  if (!Number.isFinite(valeurs?.enTete?.corps) && complet.enTete) complet.enTete.corps = g.corps
  // La bibliographie : au corps du texte, l'espace ordinaire entre deux paragraphes, l'alinéa du texte en retrait suspendu.
  if (!estObjet(valeurs?.styles?.bibliographie) && complet.styles?.bibliographie) {
    const ordinaire = Math.round((g.interligne - g.corps) * 10) / 10
    Object.assign(complet.styles.bibliographie, {
      corps: g.corps,
      espaceAvant: ordinaire,
      espaceApres: ordinaire,
      retraitSuspendu: complet.styles.texte?.alinea ?? 0,
    })
  }
  return complet
}
/**
 * Les styles d'un modèle enregistré avec des lignes blanches avant et après (avant le 15/11/2026) :
 * les points que ces lignes valaient sur la grille du modèle (Sylvain : « espacement en pt »).
 * Modifie `complet` ; `valeurs` dit ce que le modèle enregistré portait.
 */
export function stylesEnPoints(complet, valeurs) {
  for (const [nom, v] of Object.entries(valeurs?.styles ?? {})) {
    const st = complet.styles?.[nom]
    if (!estObjet(v) || !st) continue // un style inconnu est ignoré
    const grilleDuModele = { pas: complet.grille.interligne, corps: complet.grille.corps }
    const corps = st.corps ?? complet.grille.corps
    if (Number.isFinite(v.lignesAvant) && !Number.isFinite(v.espaceAvant))
      st.espaceAvant = Math.round(blancSurGrille(grilleDuModele, v.lignesAvant, corps, 'avant') * 10) / 10
    if (Number.isFinite(v.lignesApres) && !Number.isFinite(v.espaceApres))
      st.espaceApres = Math.round(blancSurGrille(grilleDuModele, v.lignesApres, corps, 'apres') * 10) / 10
  }
  // Seuls les styles que le modèle enregistré portait (des copies : les autres sont ceux du modèle de référence).
  for (const nom of Object.keys(valeurs?.styles ?? {})) {
    if (!complet.styles?.[nom]) continue
    delete complet.styles[nom].lignesAvant
    delete complet.styles[nom].lignesApres
  }
  return complet
}

function fusionner(valeurs, defaut) {
  if (!estObjet(defaut)) return valeurs === undefined ? defaut : valeurs
  const sortie = { ...defaut }
  for (const [k, v] of Object.entries(valeurs ?? {}))
    if (!CLES_INTERDITES.has(k)) sortie[k] = estObjet(v) ? fusionner(v, defaut[k]) : v
  return sortie
}

/** Les familles de polices qu'emploie un modèle : celle de chacun de ses styles
 * et celle de ses en-têtes, la police du texte en premier. */
export function famillesDuModele(modele) {
  const familles = new Set()
  const texte = modele.styles?.texte?.police
  if (texte) familles.add(texte)
  for (const st of Object.values(modele.styles ?? {})) if (st?.police) familles.add(st.police)
  // La police des en-têtes, quand elle n'est pas celle du texte (19/11/2026).
  if (modele.enTete?.police) familles.add(modele.enTete.police)
  return [...familles]
}

/** La valeur d'un réglage dans un modèle complet (pour le formulaire). */
export const valeurDuReglage = (modele, cle) => lire(modele, cle)

/**
 * Le modèle retenu pour un document : celui choisi pour lui s'il lui est
 * permis, sinon le modèle par défaut de son équipe s'il l'est, sinon le
 * modèle par défaut de l'instance, sinon le premier modèle d'amend.ink.
 * @param {{ choisi?: string | null, defautEquipe?: string | null, defautInstance?: string | null, permis: readonly string[] }} o
 *   `permis` : les identifiants des modèles d'amend.ink, puis ceux de
 *   l'équipe qui possède le document
 * @returns {string}
 */
export function modeleRetenu({ choisi, defautEquipe, defautInstance, permis }) {
  for (const id of [choisi, defautEquipe, defautInstance]) if (id && permis.includes(id)) return id
  return permis[0]
}

/** Choisir le modèle d'un document (l'enregistrer avec lui) : qui l'écrit. */
export const peutChoisirModele = (capsDocument) => capsDocument.includes('ecrire')
