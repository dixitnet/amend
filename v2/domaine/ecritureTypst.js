// L'écriture de Typst (couche 4), en JavaScript pur : les longueurs, les chaînes
// et les couleurs que nos gabarits écrivent. Séparé le 27/11/2026 de
// `miseEnPage.js`, pour servir aussi au gabarit en lignes (`miseEnPageLignes.js`).

export const PT_PAR_MM = 72 / 25.4

const nombre = (x) => String(Math.round(x * 1000) / 1000)
// Les longueurs d'un gabarit viennent toutes du modèle (design, règle 21) ou de
// la mécanique de Typst (zéro, une boîte de ligne de 1 em, pleine largeur) :
// elles s'écrivent par ces fonctions, jamais en dur (règle 17).
export const pt = (x) => `${nombre(x)}pt`
export const mm = (x) => `${nombre(x)}mm`
export const em = (x) => `${nombre(x)}em`
export const pourcent = (x) => `${nombre(x)}%`
export const ZERO = pt(0)
export const PLEINE_LARGEUR = pourcent(100)
/** Le noir du texte : 100 % de noir, sans les trois autres encres (« Typst
 * seul » pour l'imprimeur, docs/v2-etape-7-plan.md). */
export const NOIR = `cmyk(${[0, 0, 0, 100].map(pourcent).join(', ')})`

/** Une chaîne Typst entre guillemets, échappée. */
export function chaineTypst(texte) {
  const echappes = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t' }
  return `"${String(texte ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\\"\n\t]/g, (c) => echappes[c])}"`
}

/** La fonction de couleur de Typst (son nom est aussi celui d'une fonction CSS : gardé à part des gabarits,
 * où le lint prend toute couleur écrite pour une valeur de design ; celle-ci vient du design). */
const COULEUR_DE_TYPST = 'rgb'
/** L'argument de remplissage d'un surligneur de Typst, pour une couleur `#rrvvbb` ; rien pour toute autre valeur. */
export const couleurTypst = (hexa) =>
  /^#[0-9a-f]{6}$/i.test(String(hexa ?? '')) ? `fill: ${COULEUR_DE_TYPST}("${hexa}"), ` : ''

/** Les signes des séparateurs de scène ; « blanc » n'en a pas. « points » : trois puces espacées (Sylvain, 22/11/2026). */
export const SIGNES_DE_SEPARATEUR = Object.freeze({ asterisme: '⁂', etoiles: '* * *', points: '• • •', trait: '—' })
