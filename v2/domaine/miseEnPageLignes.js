// Un modèle de livre compté en lignes (couche 4), en JavaScript pur.
//
// Décision du 27/11/2026 (docs/v2-grille-plan.md) : la grille est tenue
// strictement, et tout se compte en lignes de la grille.
//
// 1. Le texte est fait de briques : chaque ligne occupe exactement un pas
//    (l'interligne du texte), quel que soit son corps. Une citation, une
//    bibliographie, une légende, une note, plus petites, gardent ce pas.
// 2. Un blanc se compte en demi-lignes. Si le blanc avant et le blanc après
//    d'un bloc ne font pas un nombre entier de lignes, une demi-ligne est
//    ajoutée avant.
// 3. Un titre est composé à son propre interligne (`grille.hauteurTitre` fois
//    son corps), mesuré, puis arrondi à la ligne supérieure, le complément
//    au-dessus : sa dernière ligne est sur la grille. Il ne se coupe pas.
// 4. Une image, un tableau occupent un nombre entier de lignes.
// 5. La page se règle en lignes : la marge de pied s'en déduit ; l'en-tête et
//    le numéro de page sont à une ligne blanche du texte.
//
// Technique reprise du paquet Typst `gridlock` (la ligne comme brique, la
// mesure de ce qui ne se coupe pas). Ce gabarit vit à côté de celui de
// `miseEnPage.js` jusqu'à la reprise des modèles enregistrés.

import {
  PT_PAR_MM,
  pt,
  mm,
  ZERO,
  PLEINE_LARGEUR,
  NOIR,
  chaineTypst,
  couleurTypst,
  SIGNES_DE_SEPARATEUR,
} from './ecritureTypst.js'

/** Un modèle compté en lignes le dit : `regle: 'lignes'`. */
export const REGLE_EN_LIGNES = 'lignes'
export const estEnLignes = (modele) => modele?.regle === REGLE_EN_LIGNES

/** Les styles mesurés puis arrondis (règle 3) ; les autres sont en briques. */
const TITRES = Object.freeze(['titre', 'sousTitre', 'titre1', 'titre2', 'titre3', 'titre4', 'titre5'])
/** Les styles en briques, hors du texte courant. */
const BRIQUES = Object.freeze(['citation', 'bibliographie', 'legende'])

/** Un blanc, ramené à la demi-ligne ; jamais négatif. */
const enDemiLignes = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x * 2) / 2 : 0)

/**
 * Combien de lignes de la grille occupe un titre.
 * @param {number} corps  le corps du titre, en pt
 * @param {number} pas  le pas de la grille, en pt
 * @param {number} hauteurTitre  la hauteur d'une ligne de titre, par unité de corps
 * @param {number} [lignesDeTitre]  le nombre de lignes sur lesquelles le titre passe
 * @returns {number}
 */
export function lignesOccupees(corps, pas, hauteurTitre, lignesDeTitre = 1) {
  return Math.max(1, Math.ceil((lignesDeTitre * hauteurTitre * corps) / pas - 1e-9))
}

/** Les deux blancs d'un bloc ne font-ils pas un nombre entier de lignes ? Une demi-ligne est alors ajoutée avant. */
export function demiLigneAjoutee(avant, apres) {
  return Math.round((enDemiLignes(avant) + enDemiLignes(apres)) * 2) % 2 !== 0
}

/**
 * Les blancs d'un bloc, en lignes : ce qui est hors du bloc (un nombre entier
 * de lignes, que Typst retire en haut de page), la demi-ligne gardée dans le
 * bloc, et le blanc après. Un titre qui ouvre une page garde tout dans le bloc.
 * @returns {{ dehors: number, dedans: number, apres: number }}
 */
export function blancsDuBloc(avant, apres, ouvre = false) {
  const tout = enDemiLignes(avant) + (demiLigneAjoutee(avant, apres) ? 0.5 : 0)
  const dehors = ouvre ? 0 : Math.floor(tout)
  return { dehors, dedans: tout - dehors, apres: enDemiLignes(apres) }
}

/**
 * Les retraits d'un style en briques, en mm : la citation prend l'alinéa du texte en retrait à gauche, la
 * bibliographie en retrait suspendu (renoncement n° 30). Une seule règle, pour le gabarit et pour l'aperçu.
 * @returns {{ retrait: number, suspendu: number }}
 */
export function retraitsDuStyle(nom, alinea) {
  const a = Number.isFinite(alinea) && alinea > 0 ? alinea : 0
  return { retrait: nom === 'citation' ? a : 0, suspendu: nom === 'bibliographie' ? a : 0 }
}

const impossible = (raison) =>
  Object.assign(new Error(`modèle impossible : ${raison}`), { code: 'modele-impossible', raison })

/** Un style d'un modèle en lignes, complété : au corps du texte, sans allure ni blanc, tant qu'il ne dit pas autre chose. */
function styleDe(modele, nom) {
  return {
    corps: modele.grille.corps,
    gras: false,
    italique: false,
    capitales: false,
    petitesCapitales: false,
    alignement: 'gauche',
    blancAvant: 0,
    blancApres: 0,
    ...modele.styles?.[nom],
  }
}

/**
 * Ce que la grille impose à la page d'un modèle en lignes.
 * @param {object} modele  voir `gabaritEnLignes`
 * @returns {{ pas: number, lignes: number, hauteurTexte: number, margeBas: number, descenteFolio: number }}
 *   le pas (pt), le nombre de lignes par page, la hauteur de la zone de texte (pt), la marge de pied obtenue (mm)
 *   et la descente du numéro de page sous la zone de texte (mm : un pas). Un modèle impossible lève une erreur
 *   de code `modele-impossible` (raisons : `valeur`, `interligne`, `lignes`, `folio`, `enTete`).
 */
export function grilleEnLignes(modele) {
  const { page, marges, grille: g } = modele
  // Une valeur non numérique (NaN, chaîne, absente) ferait passer du NaN dans le gabarit (audit partiel du 27/11/2026 :
  // la largeur et les marges de côté comprises).
  const mesures = [
    page?.largeur,
    page?.hauteur,
    marges?.haut,
    marges?.interieure,
    marges?.exterieure,
    g?.corps,
    g?.interligne,
    g?.lignes,
    g?.hauteurTitre,
  ]
  if (!mesures.every(Number.isFinite)) throw impossible('valeur')
  const pas = g.interligne
  // Une brique loge une ligne du texte, et une ligne de chaque style en briques.
  if (!(pas >= g.corps) || BRIQUES.some((nom) => !(styleDe(modele, nom).corps <= pas))) throw impossible('interligne')
  if (!(Number.isInteger(g.lignes) && g.lignes >= 1 && g.hauteurTitre > 0)) throw impossible('lignes')
  const hauteurTexte = g.lignes * pas
  const margeBas = page.hauteur - marges.haut - hauteurTexte / PT_PAR_MM
  if (margeBas <= 0) throw impossible('lignes')
  // Le numéro de page en bas est sur la deuxième ligne sous le texte : il lui faut deux pas de marge.
  const position = modele.folio?.position ?? 'bas-centre'
  const enBas = position === 'bas-centre' || position === 'bas-exterieur'
  if (enBas && margeBas * PT_PAR_MM < 2 * pas) throw impossible('folio')
  // De même en haut (audit partiel du 27/11/2026) : l'en-tête, ou le numéro de page en haut, est sur la deuxième
  // ligne au-dessus du texte ; il lui faut deux pas de marge de tête.
  const e = modele.enTete ?? {}
  const enHaut = position === 'haut-exterieur' || (e.gauche ?? 'rien') !== 'rien' || (e.droite ?? 'rien') !== 'rien'
  if (enHaut && marges.haut * PT_PAR_MM < 2 * pas) throw impossible('enTete')
  return { pas, lignes: g.lignes, hauteurTexte, margeBas, descenteFolio: pas / PT_PAR_MM }
}

/** Le jeu laissé sous la dernière ligne, en pt : les arrondis de Typst ne doivent pas refuser la ligne n ;
 * la ligne n + 1 demanderait un pas entier. Mécanique, non un réglage. */
const JEU = 0.1
/** L'écart toléré avant d'arrondir une hauteur mesurée à la ligne supérieure, en lignes (mécanique). */
const TOLERANCE = 0.001

/**
 * Le préambule Typst d'un livre dont le modèle est compté en lignes.
 *
 * @param {object} modele
 * @param {'lignes'} modele.regle
 * @param {{ largeur: number, hauteur: number }} modele.page  format, en mm
 * @param {{ haut: number, interieure: number, exterieure: number }} modele.marges  en mm
 * @param {{ corps: number, interligne: number, lignes: number, hauteurTitre: number }} modele.grille
 *   corps et interligne du texte en pt, lignes par page, hauteur d'une ligne de titre par unité de corps
 * @param {{ position?: 'bas-centre' | 'bas-exterieur' | 'haut-exterieur' | 'aucun', depart?: number, ouverture?: boolean, ouverture2?: boolean }} [modele.folio]
 * @param {{ gauche?: string, droite?: string, texteGauche?: string, texteDroite?: string, italique?: boolean, petitesCapitales?: boolean }} [modele.enTete]
 *   `rien`, `titreDocument`, `chapitre` ou `texte` ; au corps du texte, centrés
 * @param {{ debut?: 'continuer' | 'page' | 'belle-page', premierSansAlinea?: boolean }} [modele.chapitre]  le début d'un titre 1
 * @param {{ debut?: 'continuer' | 'page' | 'belle-page' }} [modele.ouverture2]  le début d'un titre 2
 * @param {string} [modele.separateur]
 * @param {boolean} [modele.cesure]
 * @param {Record<string, { police?: string, corps?: number, gras?: boolean, italique?: boolean, capitales?: boolean, petitesCapitales?: boolean,
 *   alignement?: 'gauche' | 'justifie' | 'centre', alinea?: number, blancAvant?: number, blancApres?: number }>} modele.styles
 *   `texte` porte la police, l'alignement et l'alinéa (mm, qui sert aussi de retrait à la citation et de retrait
 *   suspendu à la bibliographie) ; les autres, leur corps, leur allure et leurs blancs en lignes (par demi-ligne)
 * @param {{ titre?: string, langue?: string, auteur?: string, surlignage?: string }} [document]
 * @returns {string}
 */
export function gabaritEnLignes(modele, { titre, langue, auteur, surlignage } = {}) {
  const { page, marges, grille: g } = modele
  const { pas, margeBas } = grilleEnLignes(modele)
  const texte = { police: '', alinea: 0, ...styleDe(modele, 'texte') }
  const c = { debut: 'belle-page', ...modele.chapitre }
  const c2 = { debut: 'continuer', ...modele.ouverture2 }
  const ouvre2 = c2.debut !== 'continuer'
  const f = { position: 'bas-centre', depart: 1, ouverture: true, ouverture2: true, ...modele.folio }
  const enTete = { gauche: 'rien', droite: 'rien', italique: true, petitesCapitales: false, ...modele.enTete }
  const justifie = texte.alignement === 'justifie'
  const L = (n) => pt(n * pas)

  const poids = (st) => (st.gras ? '"bold"' : '"regular"')
  const forme = (st) => (st.italique ? '"italic"' : '"normal"')
  const placement = (st) => (st.alignement === 'centre' ? 'center' : 'left')
  // Les majuscules l'emportent sur les petites capitales.
  const contenu = (st, corps) =>
    st.capitales ? `upper(${corps})` : st.petitesCapitales ? `smallcaps(${corps})` : corps
  const caractere = (st) => `size: ${pt(st.corps)}, weight: ${poids(st)}, style: ${forme(st)}`

  // Un titre (règle 3) : son interligne à lui, puis la mesure.
  const titreMesure = (nom, corps, debut = 'continuer') => {
    const st = styleDe(modele, nom)
    const b = blancsDuBloc(st.blancAvant, st.blancApres, debut !== 'continuer')
    const lignesDuTitre =
      `{ set text(${caractere(st)}, top-edge: ${pt(g.hauteurTitre * st.corps)}, hyphenate: false); ` +
      `set par(justify: false, first-line-indent: ${ZERO}); align(${placement(st)}, ${contenu(st, corps)}) }`
    const bloc = `amend-mesure(${L(b.dehors)}, ${L(b.dedans)}, ${L(b.apres)}, ${lignesDuTitre})`
    if (debut === 'continuer') return bloc
    return (
      `{[#metadata(none) <amend-fin>]; ` +
      (debut === 'belle-page' ? `pagebreak(to: "odd", weak: true); ` : `pagebreak(weak: true); `) +
      `[#metadata(none) <amend-debut>]; ${bloc}}`
    )
  }
  // Un style en briques (règle 1) : son corps, le pas de la page.
  const brique = (nom, corps) => {
    const st = styleDe(modele, nom)
    const b = blancsDuBloc(st.blancAvant, st.blancApres)
    const r = retraitsDuStyle(nom, texte.alinea)
    const suspendu = r.suspendu ? `, hanging-indent: ${mm(r.suspendu)}` : ''
    const retrait = r.retrait ? mm(r.retrait) : null
    // Un texte posé seul dans un bloc n'est pas un paragraphe pour Typst : le retrait suspendu en demande un.
    const dedans = `align(${placement(st)}, ${suspendu ? `par(${contenu(st, corps)})` : contenu(st, corps)})`
    return (
      `amend-brique(${L(b.dehors)}, ${L(b.dedans)}, ${L(b.apres)}, { set text(${caractere(st)}); ` +
      `set par(justify: ${st.alignement === 'justifie' || (nom === 'citation' && justifie && st.alignement !== 'centre')}, ` +
      `first-line-indent: ${ZERO}${suspendu}); ${retrait ? `pad(left: ${retrait}, ${dedans})` : dedans} })`
    )
  }

  // Pages : page blanche avant une belle page, page d'ouverture, côté (comme le gabarit en points).
  const blanche =
    `let blanche = query(<amend-fin>).any(f => f.location().page() == p - 1) and ` +
    `query(<amend-debut>).any(d => d.location().page() == p + 1) and ` +
    `not query(<amend-debut>).any(d => d.location().page() == p); `
  const ouvertePar = (n) => `query(heading.where(level: ${n}, outlined: true)).any(h => h.location().page() == p)`
  const ouverture = `let ouverture = ${ouvertePar(1)}; ` + (ouvre2 ? `let ouverture2 = ${ouvertePar(2)}; ` : '')
  const folio = `counter(page).display()`
  const sansFolio = [f.ouverture ? null : 'ouverture', ouvre2 && !f.ouverture2 ? 'ouverture2' : null].filter(Boolean)
  const folioVisible = ['true', `not ${sansFolio[0]}`, `not (${sansFolio.join(' or ')})`][sansFolio.length]
  const pageOuverte = ouvre2 ? '(ouverture or ouverture2)' : 'ouverture'
  const cote = `if calc.odd(p) { right } else { left }`
  const titresOuvrants = ouvre2
    ? `selector(heading.where(level: 1, outlined: true)).or(heading.where(level: 2, outlined: true))`
    : `heading.where(level: 1, outlined: true)`
  const courant = (choix, libre) =>
    choix === 'titreDocument' && titre
      ? `[#${chaineTypst(titre)}]`
      : choix === 'texte' && libre
        ? `[#${chaineTypst(libre)}]`
        : choix === 'chapitre'
          ? `{ show linebreak: [ ]; show parbreak: [ ]; show regex("[\\n\\r]+"): [ ]; let hs = query(${titresOuvrants}.before(here())); if hs.len() > 0 { hs.last().body } }`
          : 'none'
  const avecEnTete = enTete.gauche !== 'rien' || enTete.droite !== 'rien'
  const enHaut = f.position === 'haut-exterieur' || avecEnTete
  const enBas = f.position === 'bas-centre' || f.position === 'bas-exterieur'
  const texteEnTete = `text(style: ${forme(enTete)}, ${enTete.petitesCapitales ? 'smallcaps(c)' : 'c'})`

  const signe = SIGNES_DE_SEPARATEUR[modele.separateur]
  // D'un seul tenant : un bloc vide que Typst couperait entre deux pages laisserait une fraction de ligne en haut
  // de la suivante (trouvé par le contrat, 27/11/2026). En haut de page, la ligne vide reste, comme un paragraphe.
  const ligneVide = `block(width: ${PLEINE_LARGEUR}, height: amend-pas, breakable: false)`
  const lignes = []
  const proprietes = [titre ? `title: ${chaineTypst(titre)}` : null, auteur ? `author: ${chaineTypst(auteur)}` : null]
  if (titre || auteur) lignes.push(`#set document(${proprietes.filter(Boolean).join(', ')})`)
  lignes.push(
    `#let amend-pas = ${pt(pas)}`,
    // L'en-tête et le numéro de page : sur la grille, à une ligne blanche du texte.
    `#set page(width: ${mm(page.largeur)}, height: ${mm(page.hauteur)}, ` +
      `margin: (top: ${mm(marges.haut)}, bottom: ${mm(margeBas)} - ${pt(JEU)}, inside: ${mm(marges.interieure)}, outside: ${mm(marges.exterieure)}), ` +
      `footer-descent: amend-pas + ${pt(JEU)}, header-ascent: amend-pas, ` +
      (enBas
        ? `footer: context { let p = here().page(); ${blanche}${ouverture}` +
          `if not blanche and ${folioVisible} { align(${f.position === 'bas-centre' ? 'center' : cote} + top, ${folio}) } }`
        : 'footer: none') +
      ', ' +
      (enHaut
        ? `header: context { let p = here().page(); ${blanche}${ouverture}` +
          `if not blanche { ` +
          (f.position === 'haut-exterieur' ? `if ${folioVisible} { place(${cote} + bottom, ${folio}) }; ` : '') +
          (avecEnTete
            ? `if not ${pageOuverte} { let c = if calc.odd(p) { ${courant(enTete.droite, enTete.texteDroite)} } else { ${courant(enTete.gauche, enTete.texteGauche)} }; ` +
              `if c != none { align(center, ${texteEnTete}) } }`
            : '') +
          ` } }`
        : 'header: none') +
      ')',
    // La brique : une ligne de texte fait un pas de haut, sa ligne de base en bas ; rien entre deux lignes ni entre deux blocs.
    `#set text(font: (${chaineTypst(texte.police)},), size: ${pt(g.corps)}, weight: ${poids(texte)}, style: ${forme(texte)}, ` +
      (langue ? `lang: ${chaineTypst(langue)}, ` : '') +
      (modele.cesure === false ? 'hyphenate: false, ' : '') +
      `top-edge: amend-pas, bottom-edge: "baseline", fill: ${NOIR})`,
    `#set par(justify: ${justifie}, leading: ${ZERO}, spacing: ${ZERO}, first-line-indent: (amount: ${mm(texte.alinea)}, all: true))`,
    ...(texte.alignement === 'centre' ? ['#set align(center)'] : []),
    `#set block(spacing: ${ZERO})`,
    `#set list(spacing: ${ZERO})`,
    `#set enum(spacing: ${ZERO})`,
    // Les notes de bas de page : en briques elles aussi, à une ligne du texte.
    `#set footnote.entry(gap: ${ZERO}, clearance: amend-pas)`,
    `#set image(width: ${modele.image?.largeur ?? 100}%)`,
    // Un bloc en briques : ses blancs, la demi-ligne gardée dedans.
    `#let amend-brique(dehors, dedans, apres, corps) = block(width: ${PLEINE_LARGEUR}, above: dehors, below: apres, inset: (top: dedans), corps)`,
    // Un titre : mesuré, arrondi à la ligne supérieure, le complément au-dessus ; d'un seul tenant, avec ce qui le suit.
    `#let amend-mesure(dehors, dedans, apres, corps) = block(width: ${PLEINE_LARGEUR}, above: dehors, below: apres, sticky: true, breakable: false, ` +
      `layout(size => { let h = measure(block(width: size.width, corps)).height; ` +
      `pad(top: calc.ceil(h / amend-pas - ${TOLERANCE}) * amend-pas - h + dedans, corps) }))`,
    // Ce qui ne se coupe pas (image, tableau) : un nombre entier de lignes, une ligne de blanc comprise, répartie autour.
    `#let amend-entier(corps) = block(width: ${PLEINE_LARGEUR}, breakable: false, ` +
      `layout(size => { let h = measure(block(width: size.width, corps)).height; ` +
      `let reste = (calc.ceil(h / amend-pas - ${TOLERANCE}) + 1) * amend-pas - h; pad(top: reste / 2, bottom: reste / 2, corps) }))`,
    `#show image: it => amend-entier(it)`,
    `#show table: it => amend-entier(it)`,
    `#show quote.where(block: true): it => ${brique('citation', 'it.body')}`,
    `#show link: set text(fill: ${NOIR})`,
    `#show outline.entry: it => { show linebreak: [ ]; show regex("[\\n\\r]+"): [ ]; it }`,
    `#show outline.entry.where(level: 1): set text(weight: ${poids(styleDe(modele, 'titre1'))})`,
    // Un blanc et le séparateur de scène : une ligne de la grille, vide ou portant un signe centré.
    `#let amend-blanc = ${ligneVide}`,
    `#let amend-separateur = ${signe ? `block(width: ${PLEINE_LARGEUR}, align(center, ${chaineTypst(signe)}))` : ligneVide}`,
    `#let amend-titre(corps) = ${titreMesure('titre', 'corps')}`,
    `#let amend-sous-titre(corps) = ${titreMesure('sousTitre', 'corps')}`,
    `#let amend-legende(corps) = ${brique('legende', 'corps')}`,
    `#let amend-bibliographie(corps) = ${brique('bibliographie', 'corps')}`,
    `#let amend-surligne(corps) = highlight(${couleurTypst(surlignage)}corps)`,
    c.premierSansAlinea === false
      ? `#let amend-sans-alinea(corps) = corps`
      : `#let amend-sans-alinea(corps) = par(first-line-indent: ${ZERO}, corps)`,
    ouvre2 && c.premierSansAlinea !== false
      ? `#let amend-sans-alinea-2(corps) = par(first-line-indent: ${ZERO}, corps)`
      : `#let amend-sans-alinea-2(corps) = corps`,
    // Les titres : le niveau 5 vaut pour tout niveau inconnu ; les niveaux 1 et 2 peuvent ouvrir une page.
    `#show heading: it => ${titreMesure('titre5', 'it.body')}`,
    ...[4, 3].map((n) => `#show heading.where(level: ${n}): it => ${titreMesure(`titre${n}`, 'it.body')}`),
    `#show heading.where(level: 2): it => ${titreMesure('titre2', 'it.body', c2.debut)}`,
    `#show heading.where(level: 1): it => ${titreMesure('titre1', 'it.body', c.debut)}`,
  )
  if (Number.isInteger(f.depart) && f.depart > 1) lignes.push(`#counter(page).update(${f.depart})`)
  return lignes.join('\n') + '\n'
}

/** Les noms des styles mesurés et des styles en briques (pour le formulaire et les tests). */
export const STYLES_MESURES = TITRES
export const STYLES_EN_BRIQUES = BRIQUES
