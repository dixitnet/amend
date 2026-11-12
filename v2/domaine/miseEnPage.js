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
  // Une valeur non numérique (NaN, chaîne, absente) ferait passer du NaN dans le gabarit.
  const mesures = [page?.hauteur, marges?.haut, folio?.bas, g?.corps, g?.interligne, g?.lignes]
  if (!mesures.every(Number.isFinite)) throw impossible('valeur')
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
  // Le titre de chapitre tombe sur une ligne de la page, et le texte reprend après lui.
  const c = modele.chapitre
  if (c && !(c.ligneTitre >= 1 && c.ligneTexte > c.ligneTitre && c.ligneTexte <= g.lignes)) throw impossible('chapitre')
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
 * @param {{ bas: number, position?: 'bas-centre' | 'bas-exterieur' | 'haut-exterieur' | 'aucun', depart?: number, ouverture?: boolean }} modele.folio
 *   ligne de base du folio en bas (mm depuis le bas de la page), sa place,
 *   le premier numéro, et s'il paraît sur les pages d'ouverture de chapitre
 * @param {{ gauche?: string, droite?: string }} [modele.enTete]  titre courant des
 *   pages de gauche et de droite : `rien`, `titreDocument` ou `chapitre`
 * @param {string} [modele.separateur]  séparateur de scène (`SEPARATEURS`)
 * @param {boolean} [modele.cesure]  couper les mots en fin de ligne (oui par défaut)
 * @param {{ debut?: 'continuer' | 'page' | 'belle-page', bellePage?: boolean, ligneTitre: number, ligneTexte: number, corps: number, interligne: number, graisse: number }} modele.chapitre
 *   titre de niveau 1 : début (sur la page, page suivante, belle page), ligne de la
 *   grille où tombe sa première ligne, ligne où reprend le texte, corps et
 *   interligne (pt), graisse
 * @param {{ italique: boolean, lignesAvant: number, lignesApres: number }} modele.intertitres
 *   titres de niveau 2 à 5 : au corps du texte, un nombre entier de lignes
 *   blanches avant et après
 * @param {{ retrait: number }} modele.citation  retrait à gauche, en mm
 * @param {{ corps: number, graisse: number }} [modele.titre]  le bloc « Titre » :
 *   centré, hors de la table des matières ; par défaut, comme un titre de chapitre
 * @param {{ corps: number, italique: boolean }} [modele.sousTitre]  le bloc
 *   « Sous-titre » : centré ; par défaut, au corps du chapitre, en italique
 * @param {{ titre?: string, langue?: string, auteur?: string }} [document]  titre,
 *   langue (code ISO à deux lettres) et auteur du document
 * @returns {string}
 */
export function gabaritTypst(modele, { titre, langue, auteur } = {}) {
  const { page, marges, grille: g, intertitres: it } = modele
  const c = { ...modele.chapitre, debut: debutChapitre(modele.chapitre) }
  const f = { position: 'bas-centre', depart: 1, ouverture: true, ...modele.folio }
  const enTete = { gauche: 'rien', droite: 'rien', ...modele.enTete }
  const { pas, margeBas, descenteFolio } = grille(modele)
  const titre_ = modele.titre ?? { corps: c.corps, graisse: c.graisse }
  const sousTitre_ = modele.sousTitre ?? { corps: c.corps, italique: true }
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
  const lignesDeBlanc = (n) => (1 + n) * pas - (BAS + HAUT) * g.corps
  const avant = lignesDeBlanc(it.lignesAvant)
  const apres = lignesDeBlanc(it.lignesApres)

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
  // Le titre courant (v1, `entete`), absent des pages d'ouverture.
  const courant = (choix) =>
    choix === 'titreDocument' && titre
      ? `[#${chaineTypst(titre)}]`
      : choix === 'chapitre'
        ? `{ let hs = query(heading.where(level: 1, outlined: true).before(here())); if hs.len() > 0 { hs.last().body } }`
        : 'none'
  const avecTitreCourant = enTete.gauche !== 'rien' || enTete.droite !== 'rien'
  const enHaut = f.position === 'haut-exterieur' || avecTitreCourant
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
          (avecTitreCourant
            ? `if not ouverture { let c = if calc.odd(p) { ${courant(enTete.droite)} } else { ${courant(enTete.gauche)} }; ` +
              `if c != none { align(center, text(style: "italic", c)) } }`
            : '') +
          ` } }`
        : 'header: none') +
      ')',
    `#set text(font: (${chaineTypst(modele.police)},), size: ${pt(g.corps)}, ` +
      (langue ? `lang: ${chaineTypst(langue)}, ` : '') +
      (modele.cesure === false ? 'hyphenate: false, ' : '') +
      `top-edge: ${em(HAUT)}, bottom-edge: ${em(-BAS)}, fill: ${NOIR})`,
    `#set par(justify: true, leading: ${ecart}, spacing: ${ecart}, first-line-indent: (amount: ${mm(modele.alinea)}, all: true))`,
    `#set block(spacing: ${ecart})`,
    `#set list(spacing: ${ecart})`,
    `#set enum(spacing: ${ecart})`,
    `#show quote.where(block: true): set block(spacing: ${ecart})`,
    `#show quote.where(block: true): it => pad(left: ${mm(modele.citation.retrait)}, it.body)`,
    // Les liens en noir, comme le texte (impression) ; l'adresse reste dans le PDF.
    `#show link: set text(fill: ${NOIR})`,
    // La table des matières : les chapitres à la graisse de leur titre.
    `#show outline.entry.where(level: 1): set text(weight: ${c.graisse})`,
    // Un blanc (paragraphes vides en série) : une ligne de la grille.
    `#let amend-blanc = v(${pt(pas)})`,
    // Le séparateur de scène (le séparateur de BlockNote) : une ligne de la
    // grille, blanche ou portant un signe centré.
    `#let amend-separateur = ${separateurTypst(modele.separateur, pas)}`,
    // Titre et sous-titre (Sylvain, 12/11/2026) : dans le flux, centrés, sans
    // alinéa ni justification ; leur corps vient du modèle.
    `#let amend-titre(corps) = block(width: ${PLEINE_LARGEUR}, {` +
      `set par(justify: false, first-line-indent: ${ZERO}); ` +
      `align(center, text(size: ${pt(titre_.corps)}, weight: ${titre_.graisse}, corps))})`,
    `#let amend-sous-titre(corps) = block(width: ${PLEINE_LARGEUR}, {` +
      `set par(justify: false, first-line-indent: ${ZERO}); ` +
      `align(center, text(size: ${pt(sousTitre_.corps)}, style: ${sousTitre_.italique ? '"italic"' : '"normal"'}, corps))})`,
    // Le premier paragraphe d'un chapitre, sans alinéa.
    `#let amend-sans-alinea(corps) = par(first-line-indent: ${ZERO}, corps)`,
    `#show heading: it => block(above: ${pt(avant)}, below: ${pt(apres)}, sticky: true, {` +
      `set par(justify: false, first-line-indent: ${ZERO}); ` +
      `text(size: ${pt(g.corps)}, style: ${it.italique ? '"italic"' : '"normal"'}, weight: "regular", it.body)})`,
    c.debut === 'continuer'
      ? // Le chapitre continue sur la page : son titre garde ses blancs d'ouverture
        // (lignes avant et après), dans le flux.
        `#show heading.where(level: 1): it => block(above: ${pt(lignesDeBlanc(c.ligneTitre - 1))}, ` +
          `below: ${pt(lignesDeBlanc(c.ligneTexte - c.ligneTitre - 1))}, width: ${PLEINE_LARGEUR}, sticky: true, {` +
          `set text(size: ${pt(c.corps)}, weight: ${c.graisse}); ` +
          `set par(justify: false, first-line-indent: ${ZERO}, leading: ${pt(c.interligne)} - ${em(1)}); ` +
          `align(center, it.body)})`
      : `#show heading.where(level: 1): it => {` +
          `[#metadata(none) <amend-fin>]; ` +
          (c.debut === 'belle-page' ? `pagebreak(to: "odd", weak: true); ` : `pagebreak(weak: true); `) +
          `[#metadata(none) <amend-debut>]; ` +
          `block(height: ${pt(hauteurOuverture)}, width: ${PLEINE_LARGEUR}, above: ${ZERO}, below: ${ZERO}, sticky: true, {` +
          `v(${pt(descenteTitre)}); ` +
          `set text(size: ${pt(c.corps)}, weight: ${c.graisse}); ` +
          `set par(justify: false, first-line-indent: ${ZERO}, leading: ${pt(c.interligne)} - ${em(1)}); ` +
          `align(center, it.body)})}`,
  )
  // Le premier numéro de page (v1, `startAt`).
  // Un numéro de départ qui n'est pas un entier positif est ignoré (1).
  if (Number.isInteger(f.depart) && f.depart > 1) lignes.push(`#counter(page).update(${f.depart})`)
  return lignes.join('\n') + '\n'
}

/** Le début d'un chapitre : `continuer`, `page` ou `belle-page` (l'ancien
 * booléen `bellePage` est encore lu). */
export const debutChapitre = (c) => c?.debut ?? (c?.bellePage === false ? 'page' : 'belle-page')

/** Les séparateurs de scène (v1, `SEPARATEURS`) et leur ligne de Typst. */
export const SEPARATEURS = Object.freeze(['blanc', 'asterisme', 'etoiles', 'trait'])
function separateurTypst(choix, pas) {
  const signe = { asterisme: '⁂', etoiles: '* * *', trait: '—' }[choix]
  if (!signe) return `v(${pt(pas)})`
  return `align(center, par(first-line-indent: ${ZERO}, justify: false, ${chaineTypst(signe)}))`
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
  if (r.type === 'choix') return r.options.includes(v)
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

/**
 * Les écarts qui font d'un modèle de base un modèle donné, sur une liste de
 * réglages : la reprise d'un modèle qui quitte le code (12/11/2026).
 * @param {object} base  modèle complet de départ
 * @param {object} valeurs  le modèle visé (mêmes clés que `base`)
 * @param {Array<{ cle: string }>} reglables
 * @returns {Record<string, any>}
 */
export function ecartsVers(base, valeurs, reglables) {
  const ecarts = {}
  for (const { cle } of reglables) {
    const v = lire(valeurs, cle)
    if (v !== undefined && v !== lire(base, cle)) ecarts[cle] = v
  }
  return ecarts
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
export function modeleRetenu({ choisi, defautEquipe, defautInstance, permis }) {
  for (const id of [choisi, defautEquipe, defautInstance]) if (id && permis.includes(id)) return id
  return permis[0]
}

/**
 * Le modèle complet d'un modèle enregistré (12/11/2026, `docs/v2-modeles-pdf-plan.md`) :
 * un modèle de l'instance s'appuie sur un modèle du code ; un modèle d'équipe,
 * sur un modèle du code ou de l'instance. Les écarts de chaque étage sont
 * contrôlés par ses règles (`instance` : tout le modèle ; `equipe` : la liste fermée).
 * @param {{ base: string, ecarts: object, equipe?: string | null }} entree
 * @param {{ code: (id: string) => object | null, instance: (id: string) => { base: string, ecarts: object } | null,
 *   regles: { instance: object, equipe: object } }} sources
 * @returns {{ ok: true, modele: object } | { ok: false, code: string, reglage?: string, raison?: string }}
 */
export function resoudreModele(entree, { code, instance, regles }) {
  const depuisLeCode = code(entree.base)
  if (depuisLeCode)
    return appliquerEcarts(depuisLeCode, entree.ecarts ?? {}, entree.equipe ? regles.equipe : regles.instance)
  const parent = entree.equipe ? instance(entree.base) : null
  const baseParent = parent && code(parent.base)
  if (!baseParent) return refus('modele-introuvable')
  const r = appliquerEcarts(baseParent, parent.ecarts ?? {}, regles.instance)
  if (!r.ok) return r
  return appliquerEcarts(r.modele, entree.ecarts ?? {}, regles.equipe)
}

/** Choisir le modèle d'un document (l'enregistrer avec lui) : qui l'écrit. */
export const peutChoisirModele = (capsDocument) => capsDocument.includes('ecrire')
