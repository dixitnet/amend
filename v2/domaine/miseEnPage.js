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
 * Ce que la grille impose à la page.
 * @param {object} modele  voir `gabaritTypst`
 * @returns {{ pas: number, hauteurTexte: number, margeBas: number, descenteFolio: number }}
 *   le pas (pt), la hauteur de la zone de texte (pt), la marge de pied (mm) et
 *   la descente du folio sous la zone de texte (mm). Un modèle impossible
 *   (lignes qui ne tiennent pas, folio hors de la page) lève une erreur de
 *   code `modele-impossible`.
 */
export function grille(modele) {
  const { page, marges, grille: g, folio } = modele
  const pas = g.interligne
  if (!(pas >= g.corps && g.lignes >= 1)) throw impossible('interligne')
  // n lignes tiennent dans la zone, n + 1 non : on laisse sous la dernière
  // ligne la moitié du blanc qui sépare deux lignes.
  const hauteurTexte = (g.lignes - 1) * pas + g.corps + (pas - g.corps) / 2
  const margeBas = page.hauteur - marges.haut - hauteurTexte / PT_PAR_MM
  if (margeBas <= 0) throw impossible('lignes')
  // Le folio est posé par sa ligne de base, à `folio.bas` mm du bas de la page.
  const descenteFolio = margeBas - folio.bas
  if (descenteFolio <= 0) throw impossible('folio')
  return { pas, hauteurTexte, margeBas, descenteFolio }
}

const impossible = (raison) =>
  Object.assign(new Error(`modèle impossible : ${raison}`), { code: 'modele-impossible', raison })

/**
 * Le préambule Typst d'un livre.
 *
 * @param {object} modele
 * @param {{ largeur: number, hauteur: number }} modele.page  format, en mm
 * @param {{ haut: number, interieure: number, exterieure: number }} modele.marges  en mm
 * @param {{ corps: number, interligne: number, lignes: number }} modele.grille
 *   corps et interligne en pt, nombre de lignes par page
 * @param {string} modele.police  nom de famille de la police du texte
 * @param {number} modele.alinea  retrait de première ligne, en mm
 * @param {{ bas: number }} modele.folio  ligne de base du folio, en mm depuis le bas de la page
 * @param {{ bellePage: boolean, ligneTitre: number, ligneTexte: number, corps: number, interligne: number, graisse: number }} modele.chapitre
 *   titre de niveau 1 : ouverture en belle page (page de droite), ligne de la
 *   grille où tombe sa première ligne, ligne où reprend le texte, corps et
 *   interligne (pt), graisse
 * @param {{ italique: boolean, lignesAvant: number, lignesApres: number }} modele.intertitres
 *   titres de niveau 2 à 5 : au corps du texte, un nombre entier de lignes
 *   blanches avant et après
 * @param {{ retrait: number }} modele.citation  retrait à gauche, en mm
 * @param {{ titre?: string, langue?: string }} [document]  titre et langue
 *   (code ISO à deux lettres) du document
 * @returns {string}
 */
export function gabaritTypst(modele, { titre, langue } = {}) {
  const { page, marges, grille: g, chapitre: c, intertitres: it } = modele
  const { pas, margeBas, descenteFolio } = grille(modele)
  const ecart = `${pt(pas)} - ${em(1)}`
  // Ligne n de la grille : sa ligne de base est à HAUT × corps + (n − 1) × pas
  // du haut de la zone de texte.
  const base = (n) => HAUT * g.corps + (n - 1) * pas
  // L'ouverture de chapitre est un bloc de hauteur fixe : le texte reprend
  // toujours à la même ligne, que le titre tienne sur une ligne ou deux.
  const hauteurOuverture = (c.ligneTexte - 1) * pas
  const descenteTitre = base(c.ligneTitre) - HAUT * c.corps
  // Un intertitre au corps du texte : avant lui, sa ligne et ses blancs
  // occupent un nombre entier de lignes de la grille.
  const avant = (1 + it.lignesAvant) * pas - (BAS + HAUT) * g.corps
  const apres = (1 + it.lignesApres) * pas - (BAS + HAUT) * g.corps

  const lignes = []
  if (titre) lignes.push(`#set document(title: ${chaineTypst(titre)})`)
  lignes.push(
    `#set page(width: ${mm(page.largeur)}, height: ${mm(page.hauteur)}, ` +
      `margin: (top: ${mm(marges.haut)}, bottom: ${mm(margeBas)}, inside: ${mm(marges.interieure)}, outside: ${mm(marges.exterieure)}), ` +
      `footer-descent: ${mm(descenteFolio)}, ` +
      // Pas de folio sur la page blanche laissée avant un chapitre en belle
      // page : celle qui suit la fin d'un chapitre et précède le suivant.
      `footer: context { let p = here().page(); ` +
      `let blanche = query(<amend-fin>).any(f => f.location().page() == p - 1) and query(<amend-debut>).any(d => d.location().page() == p + 1); ` +
      `if not blanche { align(center + top, text(top-edge: "baseline", counter(page).display())) } })`,
    `#set text(font: (${chaineTypst(modele.police)},), size: ${pt(g.corps)}, ` +
      (langue ? `lang: ${chaineTypst(langue)}, ` : '') +
      `top-edge: ${em(HAUT)}, bottom-edge: ${em(-BAS)}, fill: ${NOIR})`,
    `#set par(justify: true, leading: ${ecart}, spacing: ${ecart}, first-line-indent: (amount: ${mm(modele.alinea)}, all: true))`,
    `#set block(spacing: ${ecart})`,
    `#set list(spacing: ${ecart})`,
    `#set enum(spacing: ${ecart})`,
    `#show quote.where(block: true): set block(spacing: ${ecart})`,
    `#show quote.where(block: true): it => pad(left: ${mm(modele.citation.retrait)}, it.body)`,
    // Un blanc (le séparateur de BlockNote) : une ligne de la grille.
    `#let amend-blanc = v(${pt(pas)})`,
    // Le premier paragraphe d'un chapitre, sans alinéa.
    `#let amend-sans-alinea(corps) = par(first-line-indent: ${ZERO}, corps)`,
    `#show heading: it => block(above: ${pt(avant)}, below: ${pt(apres)}, sticky: true, {` +
      `set par(justify: false, first-line-indent: ${ZERO}); ` +
      `text(size: ${pt(g.corps)}, style: ${it.italique ? '"italic"' : '"normal"'}, weight: "regular", it.body)})`,
    `#show heading.where(level: 1): it => {` +
      `[#metadata(none) <amend-fin>]; ` +
      (c.bellePage ? `pagebreak(to: "odd", weak: true); ` : `pagebreak(weak: true); `) +
      `[#metadata(none) <amend-debut>]; ` +
      `block(height: ${pt(hauteurOuverture)}, width: ${PLEINE_LARGEUR}, above: ${ZERO}, below: ${ZERO}, sticky: true, {` +
      `v(${pt(descenteTitre)}); ` +
      `set text(size: ${pt(c.corps)}, weight: ${c.graisse}); ` +
      `set par(justify: false, first-line-indent: ${ZERO}, leading: ${pt(c.interligne)} - ${em(1)}); ` +
      `align(center, it.body)})}`,
  )
  return lignes.join('\n') + '\n'
}

// --- Modèles d'équipe (ADR 0011) -------------------------------------------
//
// Un modèle d'équipe dérive d'un modèle d'amend.ink : il n'enregistre que ses
// écarts, pris dans une liste fermée de réglages bornés (décidée dans le
// design et passée ici en paramètre). Le modèle complet est toujours calculé ;
// une correction du modèle de base atteint donc les modèles qui en dérivent.

const lire = (objet, cle) => cle.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), objet)
function poser(objet, cle, valeur) {
  const k = cle.split('.')
  let o = objet
  for (const p of k.slice(0, -1)) o = o[p] = { ...(o[p] ?? {}) }
  o[k.at(-1)] = valeur
}
const refus = (code, reglage) => ({ ok: false, code, ...(reglage ? { reglage } : {}) })
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Une valeur est-elle permise par la description d'un réglage ? */
function valeurPermise(r, v, polices) {
  if (r.type === 'booleen') return typeof v === 'boolean'
  if (r.type === 'police') return typeof v === 'string' && polices.some((p) => p.famille === v)
  if (r.type !== 'nombre' && r.type !== 'entier') return false
  if (typeof v !== 'number' || !Number.isFinite(v)) return false
  if (r.type === 'entier' && !Number.isInteger(v)) return false
  return !(r.min !== undefined && v < r.min) && !(r.max !== undefined && v > r.max)
}

/**
 * Le modèle complet d'une équipe : son modèle de base et ses écarts.
 * @param {object} base  un modèle d'amend.ink (voir `gabaritTypst`)
 * @param {Record<string, any>} ecarts  `{ 'page.largeur': 135, police: '…' }`
 * @param {{ reglables: Array<{ cle: string, type: string, min?: number, max?: number }>,
 *   polices: Array<{ famille: string, fichiers: string[] }>, largeurUtileMin?: number }} regles
 * @returns {{ ok: true, modele: object, ecarts: object } | { ok: false, code: string, reglage?: string, raison?: string }}
 *   codes : `ecarts-invalides`, `reglage-inconnu`, `reglage-hors-bornes`,
 *   `modele-impossible` (la grille ne tient pas dans la page)
 */
export function appliquerEcarts(base, ecarts, { reglables, polices, largeurUtileMin = 0 }) {
  if (!estObjet(ecarts)) return refus('ecarts-invalides')
  const modele = structuredClone(base)
  const retenus = {}
  for (const [cle, valeur] of Object.entries(ecarts)) {
    const r = reglables.find((x) => x.cle === cle)
    if (!r) return refus('reglage-inconnu', cle)
    if (!valeurPermise(r, valeur, polices)) return refus('reglage-hors-bornes', cle)
    // Un écart égal à la base n'en est pas un : il n'est pas gardé, pour que
    // la base reste maîtresse de ce réglage.
    if (lire(base, cle) === valeur) continue
    retenus[cle] = valeur
    poser(modele, cle, valeur)
    if (r.type === 'police') modele.polices = polices.find((p) => p.famille === valeur).fichiers
  }
  const utile = modele.page.largeur - modele.marges.interieure - modele.marges.exterieure
  if (utile < largeurUtileMin) return { ...refus('modele-impossible'), raison: 'largeur' }
  try {
    grille(modele)
  } catch (e) {
    if (e.code !== 'modele-impossible') throw e
    return { ...refus('modele-impossible'), raison: e.raison }
  }
  return { ok: true, modele, ecarts: retenus }
}

/** La valeur d'un réglage dans un modèle complet (pour le formulaire). */
export const valeurDuReglage = (modele, cle) => lire(modele, cle)

/**
 * Le modèle retenu pour un document : celui choisi pour lui s'il lui est
 * permis, sinon le modèle par défaut de son équipe s'il l'est, sinon le
 * premier modèle d'amend.ink.
 * @param {{ choisi?: string | null, defautEquipe?: string | null, permis: readonly string[] }} o
 *   `permis` : les identifiants des modèles d'amend.ink, puis ceux de
 *   l'équipe qui possède le document
 * @returns {string}
 */
export function modeleRetenu({ choisi, defautEquipe, permis }) {
  for (const id of [choisi, defautEquipe]) if (id && permis.includes(id)) return id
  return permis[0]
}

/** Choisir le modèle d'un document (l'enregistrer avec lui) : qui l'écrit. */
export const peutChoisirModele = (capsDocument) => capsDocument.includes('ecrire')
