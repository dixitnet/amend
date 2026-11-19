// Le modèle de mise en page d'un livre (couche 4), en JavaScript pur.
//
// Un modèle se pense en grille (docs/v2-etape-7-plan.md) : le format de la
// page, la marge de tête, le corps et l'interligne du texte en points et le
// nombre de lignes par page. Tout le reste en découle : la marge de pied, la
// place du folio, les blancs autour des titres, comptés en lignes pour que le
// texte d'une page tombe sur les lignes de la page d'en face.
//
// Ce module rend le préambule Typst du livre (le « gabarit ») : les règles
// de page, de texte et de titres. Le corps du document est écrit à part, par
// l'adaptateur de BlockNote ; l'un et l'autre se compilent ensemble.

const PT_PAR_MM = 72 / 25.4

/** Une ligne de Typst a une boîte de 1 em : 0,8 em au-dessus de la ligne de
 * base, 0,2 em en dessous. Le pas entre deux lignes de base vaut alors
 * exactement l'interligne, quel que soit le dessin de la police. */
const HAUT = 0.8
const BAS = 0.2

const nombre = (x) => String(Math.round(x * 1000) / 1000)
// Les longueurs du gabarit viennent toutes du modèle (design, règle 21) ou de
// la mécanique de Typst (zéro, une boîte de ligne de 1 em, pleine largeur) :
// elles s'écrivent par ces fonctions, jamais en dur (règle 17).
const pt = (x) => `${nombre(x)}pt`
const mm = (x) => `${nombre(x)}mm`
const em = (x) => `${nombre(x)}em`
const pourcent = (x) => `${nombre(x)}%`
const ZERO = pt(0)
const PLEINE_LARGEUR = pourcent(100)
/** Le noir du texte : 100 % de noir, sans les trois autres encres (« Typst
 * seul » pour l'imprimeur, docs/v2-etape-7-plan.md). */
const NOIR = `cmyk(${[0, 0, 0, 100].map(pourcent).join(', ')})`

/** Une chaîne Typst entre guillemets, échappée. */
export function chaineTypst(texte) {
  const echappes = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t' }
  return `"${String(texte ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\\"\n\t]/g, (c) => echappes[c])}"`
}

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
 * Ce que la grille impose à la page.
 * @param {object} modele  voir `gabaritTypst`
 * @returns {{ pas: number, lignes: number, hauteurTexte: number, margeBas: number, descenteFolio: number }}
 *   le pas (pt), le nombre de lignes par page, la hauteur de la zone de texte
 *   (pt), la marge de pied obtenue (mm : la marge basse demandée, plus le reste
 *   de moins d'une ligne) et la descente du folio sous la zone de texte (mm).
 *   Un modèle impossible (aucune ligne ne tient, folio hors de la page) lève
 *   une erreur de code `modele-impossible`. Un modèle d'avant le 15/11/2026,
 *   écrit en `grille.lignes`, se lit encore.
 */
export function grille(modele) {
  const { page, marges, grille: g, folio } = modele
  const parMarge = Number.isFinite(marges?.bas)
  // Une valeur non numérique (NaN, chaîne, absente) ferait passer du NaN dans le gabarit.
  const mesures = [page?.hauteur, marges?.haut, folio?.bas, g?.corps, g?.interligne, parMarge ? marges.bas : g?.lignes]
  if (!mesures.every(Number.isFinite)) throw impossible('valeur')
  const pas = g.interligne
  if (!(pas >= g.corps)) throw impossible('interligne')
  const lignes = parMarge ? lignesQuiTiennent(modele) : g.lignes
  if (!(lignes >= 1)) throw impossible('lignes')
  // n lignes tiennent dans la zone, n + 1 non : on laisse sous la dernière
  // ligne la moitié du blanc qui sépare deux lignes.
  const hauteurTexte = (lignes - 1) * pas + g.corps + (pas - g.corps) / 2
  const margeBas = page.hauteur - marges.haut - hauteurTexte / PT_PAR_MM
  if (margeBas <= 0) throw impossible('lignes')
  // Le folio est posé par sa ligne de base, à `folio.bas` mm du bas de la page.
  const descenteFolio = margeBas - folio.bas
  if (descenteFolio <= 0) throw impossible('folio')
  // Le titre de chapitre tombe sur une ligne de la page, et le texte reprend après lui.
  const c = modele.chapitre
  if (c && !(c.ligneTitre >= 1 && c.ligneTexte > c.ligneTitre && c.ligneTexte <= lignes)) throw impossible('chapitre')
  return { pas, lignes, hauteurTexte, margeBas, descenteFolio }
}

const impossible = (raison) =>
  Object.assign(new Error(`modèle impossible : ${raison}`), { code: 'modele-impossible', raison })

// --- Les styles d'un modèle (13/11/2026) ------------------------------------
//
// Chaque style du livre a son jeu de réglages, repris de la v1 (`shared/style.js` :
// police, taille, gras, italique, majuscules, alignement, espaces, retraits) et
// adapté à la grille : les espaces se comptent en lignes. Un modèle est une
// copie complète : on le crée à partir d'un autre, puis il est indépendant.

/** Les alignements d'un style. */
const ALIGNEMENTS = Object.freeze(['gauche', 'justifie', 'centre'])
/** Les styles réglables d'un modèle, dans l'ordre du formulaire. */
export const NOMS_STYLES = Object.freeze([
  'texte',
  'citation',
  'titre1',
  'titre2',
  'titre3',
  'titre4',
  'titre5',
  'titre',
  'sousTitre',
  'legende',
])

const STYLE_PAR_DEFAUT = {
  gras: false,
  italique: false,
  capitales: false,
  alignement: 'gauche',
  // L'espace avant et après un bloc, en points (Sylvain, 15/11/2026 : « espacement en pt »).
  espaceAvant: 0,
  espaceApres: 0,
  alinea: 0,
  retrait: 0,
}

/** Un style d'un modèle, complété : sa police est celle du texte et son corps
 * celui de la grille tant qu'il ne dit pas autre chose. */
function styleDe(modele, nom) {
  const texte = modele.styles?.texte ?? {}
  const st = { police: texte.police, corps: modele.grille.corps, ...STYLE_PAR_DEFAUT, ...modele.styles?.[nom] }
  // Une police vide : celle du texte courant (Sylvain, 15/11/2026, « même police que le texte »).
  if (!st.police) st.police = texte.police
  return st
}

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
 * Le préambule Typst d'un livre.
 *
 * @param {object} modele
 * @param {{ largeur: number, hauteur: number }} modele.page  format, en mm
 * @param {{ haut: number, interieure: number, exterieure: number }} modele.marges  en mm
 * @param {{ corps: number, interligne: number, lignes: number }} modele.grille
 *   corps (celui du texte courant) et interligne en pt, nombre de lignes par page
 * @param {{ bas: number, position?: 'bas-centre' | 'bas-exterieur' | 'haut-exterieur' | 'aucun', depart?: number, ouverture?: boolean }} modele.folio
 *   ligne de base du folio en bas (mm depuis le bas de la page), sa place,
 *   le premier numéro, et s'il paraît sur les pages d'ouverture de chapitre
 * @param {{ gauche?: string, droite?: string, texteGauche?: string, texteDroite?: string }} [modele.enTete]
 *   en-têtes des pages de gauche et de droite : `rien`, `titreDocument`,
 *   `chapitre` (le chapitre en cours) ou `texte` (le texte libre `texteGauche`
 *   ou `texteDroite`, Sylvain, 15/11/2026)
 * @param {string} [modele.separateur]  séparateur de scène (`SEPARATEURS`)
 * @param {boolean} [modele.cesure]  couper les mots en fin de ligne (oui par défaut)
 * @param {{ debut?: 'continuer' | 'page' | 'belle-page', bellePage?: boolean, premierSansAlinea?: boolean, ligneTitre: number, ligneTexte: number, interligne: number }} modele.chapitre
 *   l'ouverture d'un chapitre (titre de niveau 1) : début (sur la page, page
 *   suivante, belle page), ligne de la grille où tombe sa première ligne,
 *   ligne où reprend le texte, interligne (pt) de ses lignes
 * @param {Record<string, { police?: string, corps?: number, gras?: boolean, italique?: boolean, capitales?: boolean,
 *   alignement?: 'gauche' | 'justifie' | 'centre', lignesAvant?: number, lignesApres?: number, alinea?: number, retrait?: number }>} modele.styles
 *   les styles (`NOMS_STYLES`) : `texte` (le texte courant, dont le corps est
 *   celui de la grille), `citation`, `titre1` (le chapitre) à `titre5`, `titre`,
 *   `sousTitre`, `legende`. Les espaces avant et après sont des nombres de lignes
 *   de la grille ; l'alinéa et le retrait sont en mm
 * @param {{ titre?: string, langue?: string, auteur?: string }} [document]  titre,
 *   langue (code ISO à deux lettres) et auteur du document
 * @returns {string}
 */
export function gabaritTypst(modele, { titre, langue, auteur } = {}) {
  const { page, marges, grille: g } = modele
  const c = { ...modele.chapitre, debut: debutChapitre(modele.chapitre) }
  const f = { position: 'bas-centre', depart: 1, ouverture: true, ...modele.folio }
  const enTete = { gauche: 'rien', droite: 'rien', ...modele.enTete }
  const { pas, margeBas, descenteFolio } = grille(modele)
  const texte = styleDe(modele, 'texte')
  const t1 = styleDe(modele, 'titre1')
  const ecart = `${pt(pas)} - ${em(1)}`
  // Ligne n de la grille : sa ligne de base est à HAUT × corps + (n − 1) × pas
  // du haut de la zone de texte.
  const base = (n) => HAUT * g.corps + (n - 1) * pas
  // L'ouverture de chapitre est un bloc de hauteur fixe : le texte reprend
  // toujours à la même ligne, que le titre tienne sur une ligne ou deux.
  const hauteurOuverture = (c.ligneTexte - 1) * pas
  const descenteTitre = base(c.ligneTitre) - HAUT * t1.corps
  // Le blanc d'une ligne de la grille et de ses voisines, au corps du texte.
  const lignesDeBlanc = (n) => (1 + n) * pas - (BAS + HAUT) * g.corps

  // Un style : le texte réglé (police, corps, graisse, italique), l'interligne
  // de la grille quel que soit le corps, l'alignement ; sans alinéa sauf pour
  // les styles qui en ont un.
  const poids = (st) => (st.gras ? '"bold"' : '"regular"')
  const forme = (st) => (st.italique ? '"italic"' : '"normal"')
  const placement = (st) => (st.alignement === 'centre' ? 'center' : 'left')
  const regle = (st) =>
    `set text(font: (${chaineTypst(st.police)},), size: ${pt(st.corps)}, weight: ${poids(st)}, style: ${forme(st)}); ` +
    `set par(justify: ${st.alignement === 'justifie'}, leading: ${pt(pas)} - ${em(1)}, ` +
    `first-line-indent: (amount: ${mm(st.alinea)}, all: true)); `
  const contenu = (st, corps) => (st.capitales ? `upper(${corps})` : corps)
  const avantApres = (st) => `above: ${pt(st.espaceAvant)}, below: ${pt(st.espaceApres)}`
  // Le retrait de première ligne (`alinea`) est dans `regle` ; le retrait à gauche, ici, pour tout style.
  const avecRetrait = (st, contenuTypst) =>
    st.retrait ? `pad(left: ${mm(st.retrait)}, ${contenuTypst})` : contenuTypst
  const bloc = (st, corps, { colle = false } = {}) =>
    `block(width: ${PLEINE_LARGEUR}, ${avantApres(st)}${colle ? ', sticky: true' : ''}, { ${regle(st)}` +
    `${avecRetrait(st, `align(${placement(st)}, ${contenu(st, corps)})`)}})`

  // Pages : page blanche laissée avant un chapitre en belle page (celle qui
  // suit la fin d'un chapitre et précède le suivant), page d'ouverture d'un
  // chapitre, recto (page impaire, à droite).
  const blanche =
    `let blanche = query(<amend-fin>).any(f => f.location().page() == p - 1) and ` +
    `query(<amend-debut>).any(d => d.location().page() == p + 1) and ` +
    // Une page qui commence elle-même un chapitre (la table des matières) n'est pas blanche.
    `not query(<amend-debut>).any(d => d.location().page() == p); `
  const ouverture = `let ouverture = query(heading.where(level: 1, outlined: true)).any(h => h.location().page() == p); `
  const folio = `counter(page).display()`
  const folioVisible = f.ouverture ? 'true' : 'not ouverture'
  const cote = `if calc.odd(p) { right } else { left }`
  // L'en-tête (v1, `entete`, « titre courant » jusqu'au 15/11/2026), absent des
  // pages d'ouverture. Le nom du chapitre en cours tient sur une ligne : ni
  // retour de ligne ni saut de paragraphe du titre (Sylvain, 15/11/2026).
  const courant = (choix, libre) =>
    choix === 'titreDocument' && titre
      ? `[#${chaineTypst(titre)}]`
      : choix === 'texte' && libre
        ? `[#${chaineTypst(libre)}]`
        : choix === 'chapitre'
          ? `{ show linebreak: [ ]; show parbreak: [ ]; show regex("[\\n\\r]+"): [ ]; let hs = query(heading.where(level: 1, outlined: true).before(here())); if hs.len() > 0 { hs.last().body } }`
          : 'none'
  const avecEnTete = enTete.gauche !== 'rien' || enTete.droite !== 'rien'
  const enHaut = f.position === 'haut-exterieur' || avecEnTete
  const enBas = f.position === 'bas-centre' || f.position === 'bas-exterieur'

  const lignes = []
  const proprietes = [titre ? `title: ${chaineTypst(titre)}` : null, auteur ? `author: ${chaineTypst(auteur)}` : null]
  if (titre || auteur) lignes.push(`#set document(${proprietes.filter(Boolean).join(', ')})`)
  lignes.push(
    `#set page(width: ${mm(page.largeur)}, height: ${mm(page.hauteur)}, ` +
      `margin: (top: ${mm(marges.haut)}, bottom: ${mm(margeBas)}, inside: ${mm(marges.interieure)}, outside: ${mm(marges.exterieure)}), ` +
      `footer-descent: ${mm(descenteFolio)}, ` +
      (enBas
        ? `footer: context { let p = here().page(); ${blanche}${ouverture}` +
          `if not blanche and ${folioVisible} { align(${f.position === 'bas-centre' ? 'center' : cote} + top, text(top-edge: "baseline", ${folio})) } }`
        : 'footer: none') +
      ', ' +
      (enHaut
        ? `header: context { let p = here().page(); ${blanche}${ouverture}` +
          `if not blanche { ` +
          (f.position === 'haut-exterieur' ? `if ${folioVisible} { place(${cote}, ${folio}) }; ` : '') +
          (avecEnTete
            ? `if not ouverture { let c = if calc.odd(p) { ${courant(enTete.droite, enTete.texteDroite)} } else { ${courant(enTete.gauche, enTete.texteGauche)} }; ` +
              `if c != none { align(center, text(style: "italic", c)) } }`
            : '') +
          ` } }`
        : 'header: none') +
      ')',
    `#set text(font: (${chaineTypst(texte.police)},), size: ${pt(g.corps)}, weight: ${poids(texte)}, style: ${forme(texte)}, ` +
      (langue ? `lang: ${chaineTypst(langue)}, ` : '') +
      (modele.cesure === false ? 'hyphenate: false, ' : '') +
      `top-edge: ${em(HAUT)}, bottom-edge: ${em(-BAS)}, fill: ${NOIR})`,
    `#set par(justify: ${texte.alignement === 'justifie'}, leading: ${ecart}, spacing: ${ecart}, first-line-indent: (amount: ${mm(texte.alinea)}, all: true))`,
    ...(texte.alignement === 'centre' ? ['#set align(center)'] : []),
    `#set block(spacing: ${ecart})`,
    // Une image occupe la largeur de la page hors marges, 100 % (Sylvain, 14/11/2026).
    `#set image(width: ${modele.image?.largeur ?? 100}%)`,
    `#set list(spacing: ${ecart})`,
    `#set enum(spacing: ${ecart})`,
    // La citation : son style, et son retrait à gauche.
    `#show quote.where(block: true): it => ${bloc(styleDe(modele, 'citation'), 'it.body')}`,
    // Les liens en noir, comme le texte (impression) ; l'adresse reste dans le PDF.
    `#show link: set text(fill: ${NOIR})`,
    // La table des matières : un titre sur plusieurs lignes tient sur une seule
    // (Sylvain, 15/11/2026), et les chapitres sont à la graisse de leur titre.
    `#show outline.entry: it => { show linebreak: [ ]; show regex("[\\n\\r]+"): [ ]; it }`,
    `#show outline.entry.where(level: 1): set text(weight: ${poids(t1)})`,
    // Un blanc (paragraphes vides en série) : une ligne de la grille.
    // Une ligne vide (un paragraphe qui ne porte qu'une boîte d'un em, sans aucun caractère), non un espacement :
    // Typst supprime un espacement en haut de page, et le saut de ligne d'une page commencée par un blanc ne
    // comptait pas (Sylvain, 15/11/2026). Comme un paragraphe, elle tombe sur la grille en haut de page comme ailleurs.
    `#let amend-blanc = par(first-line-indent: ${ZERO})[#box(height: ${em(1)})]`,
    // Le séparateur de scène (le séparateur de BlockNote) : une ligne de la
    // grille, blanche ou portant un signe centré.
    `#let amend-separateur = ${separateurTypst(modele.separateur, pas)}`,
    // Titre, sous-titre et légende : dans le flux, chacun son style.
    `#let amend-titre(corps) = ${bloc(styleDe(modele, 'titre'), 'corps')}`,
    `#let amend-sous-titre(corps) = ${bloc(styleDe(modele, 'sousTitre'), 'corps')}`,
    `#let amend-legende(corps) = ${bloc(styleDe(modele, 'legende'), 'corps')}`,
    // Le premier paragraphe d'un chapitre, sans alinéa.
    // Le premier paragraphe d'un chapitre : sans retrait par défaut, au choix du modèle (Sylvain, 15/11/2026).
    c.premierSansAlinea === false
      ? `#let amend-sans-alinea(corps) = corps`
      : `#let amend-sans-alinea(corps) = par(first-line-indent: ${ZERO}, corps)`,
    // Les intertitres : le titre de niveau 5 vaut pour tout niveau inconnu, puis
    // chaque niveau de 4 à 2 a son style.
    `#show heading: it => ${bloc(styleDe(modele, 'titre5'), 'it.body', { colle: true })}`,
    ...[4, 3, 2].map(
      (n) =>
        `#show heading.where(level: ${n}): it => ${bloc(styleDe(modele, `titre${n}`), 'it.body', { colle: true })}`,
    ),
    c.debut === 'continuer'
      ? // Le chapitre continue sur la page : son titre garde ses blancs d'ouverture
        // (lignes avant et après), dans le flux.
        `#show heading.where(level: 1): it => block(above: ${pt(lignesDeBlanc(c.ligneTitre - 1))}, ` +
          `below: ${pt(lignesDeBlanc(c.ligneTexte - c.ligneTitre - 1))}, width: ${PLEINE_LARGEUR}, sticky: true, {` +
          `set text(font: (${chaineTypst(t1.police)},), size: ${pt(t1.corps)}, weight: ${poids(t1)}, style: ${forme(t1)}); ` +
          `set par(justify: ${t1.alignement === 'justifie'}, first-line-indent: ${mm(t1.alinea)}, leading: ${pt(c.interligne)} - ${em(1)}); ` +
          `${avecRetrait(t1, `align(${placement(t1)}, ${contenu(t1, 'it.body')})`)}})`
      : `#show heading.where(level: 1): it => {` +
          `[#metadata(none) <amend-fin>]; ` +
          (c.debut === 'belle-page' ? `pagebreak(to: "odd", weak: true); ` : `pagebreak(weak: true); `) +
          `[#metadata(none) <amend-debut>]; ` +
          `block(height: ${pt(hauteurOuverture)}, width: ${PLEINE_LARGEUR}, above: ${ZERO}, below: ${ZERO}, sticky: true, {` +
          `v(${pt(descenteTitre)}); ` +
          `set text(font: (${chaineTypst(t1.police)},), size: ${pt(t1.corps)}, weight: ${poids(t1)}, style: ${forme(t1)}); ` +
          `set par(justify: ${t1.alignement === 'justifie'}, first-line-indent: ${mm(t1.alinea)}, leading: ${pt(c.interligne)} - ${em(1)}); ` +
          `${avecRetrait(t1, `align(${placement(t1)}, ${contenu(t1, 'it.body')})`)}})}`,
  )
  // Le premier numéro de page (v1, `startAt`).
  // Un numéro de départ qui n'est pas un entier positif est ignoré (1).
  if (Number.isInteger(f.depart) && f.depart > 1) lignes.push(`#counter(page).update(${f.depart})`)
  return lignes.join('\n') + '\n'
}

/** Le début d'un chapitre : `continuer`, `page` ou `belle-page` (l'ancien
 * booléen `bellePage` est encore lu). */
const debutChapitre = (c) => c?.debut ?? (c?.bellePage === false ? 'page' : 'belle-page')

/** Les séparateurs de scène (v1, `SEPARATEURS`) et leur ligne de Typst. */
const SEPARATEURS = Object.freeze(['blanc', 'asterisme', 'etoiles', 'trait'])
function separateurTypst(choix, pas) {
  const signe = { asterisme: '⁂', etoiles: '* * *', trait: '—' }[choix]
  if (!signe) return `v(${pt(pas)})`
  return `align(center, par(first-line-indent: ${ZERO}, justify: false, ${chaineTypst(signe)}))`
}

// --- Les modèles (ADR 0011, revu le 13/11/2026) ------------------------------
//
// Un modèle est une copie complète : on le crée à partir d'un modèle existant,
// puis il est indépendant (Sylvain, 13/11/2026 : « après, pas besoin de faire
// référence à cette filiation »). Ses réglages sont pris dans une liste fermée
// de réglages bornés (décidée dans le design et passée ici en paramètre).

const lire = (objet, cle) => cle.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), objet)
export function poser(objet, cle, valeur) {
  const k = cle.split('.')
  let o = objet
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
  // Un modèle enregistré en lignes par page (avant le 15/11/2026) : la marge
  // basse qui laisse ce nombre de lignes remplace celle du modèle de référence.
  if (Number.isFinite(valeurs?.grille?.lignes)) {
    if (!Number.isFinite(valeurs?.marges?.bas)) complet.marges.bas = margeBasPourLignes(complet, valeurs.grille.lignes)
    delete complet.grille.lignes // la marge basse fait foi, plus de donnée morte
  }
  stylesEnPoints(complet, valeurs)
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
  for (const [k, v] of Object.entries(valeurs ?? {})) sortie[k] = estObjet(v) ? fusionner(v, defaut[k]) : v
  return sortie
}

/** Les familles de polices qu'emploie un modèle : celle de chacun de ses styles,
 * la police du texte en premier. */
export function famillesDuModele(modele) {
  const familles = new Set()
  const texte = modele.styles?.texte?.police
  if (texte) familles.add(texte)
  for (const st of Object.values(modele.styles ?? {})) if (st?.police) familles.add(st.police)
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
