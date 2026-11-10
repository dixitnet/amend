// Le modèle de mise en page d'un livre (domaine/miseEnPage.js) et le nom des
// fichiers exportés (domaine/document.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grille, gabaritTypst, chaineTypst, nomDeFichier, titreDocument } from '../../domaine/index.js'

const MODELE = {
  page: { largeur: 120, hauteur: 180 },
  marges: { haut: 18, interieure: 13, exterieure: 13 },
  grille: { corps: 10.5, interligne: 12.4, lignes: 31 },
  police: 'EB Garamond',
  alinea: 4.5,
  folio: { bas: 18 },
  chapitre: { bellePage: true, ligneTitre: 7, ligneTexte: 12, corps: 13, interligne: 14, graisse: 600 },
  intertitres: { italique: true, lignesAvant: 1, lignesApres: 0 },
  citation: { retrait: 5 },
}
const proche = (a, b) => Math.abs(a - b) < 1e-6

test('la grille : 31 lignes de 12,4 pt, la marge de pied et la descente du folio en découlent', () => {
  const { pas, hauteurTexte, margeBas, descenteFolio } = grille(MODELE)
  assert.equal(pas, 12.4)
  // 30 pas, une boîte de ligne de 10,5 pt et la moitié du blanc entre deux lignes.
  assert.ok(proche(hauteurTexte, 30 * 12.4 + 10.5 + 0.95))
  assert.ok(proche(margeBas, 180 - 18 - (hauteurTexte * 25.4) / 72))
  assert.ok(proche(descenteFolio, margeBas - 18))
})

test('un modèle impossible est refusé avec un code', () => {
  const avec = (champ, valeur) => ({ ...MODELE, [champ]: { ...MODELE[champ], ...valeur } })
  for (const [modele, raison] of [
    [avec('grille', { interligne: 9 }), 'interligne'],
    [avec('grille', { lignes: 45 }), 'lignes'],
    [avec('folio', { bas: 40 }), 'folio'],
  ])
    assert.throws(() => grille(modele), { code: 'modele-impossible', raison })
})

test('le gabarit : page, texte sur la grille, titres comptés en lignes', () => {
  const g = gabaritTypst(MODELE, { titre: 'Un « titre »', langue: 'fr' })
  assert.match(g, /^#set document\(title: "Un « titre »"\)\n/)
  assert.match(g, /width: 120mm, height: 180mm/)
  assert.match(g, /margin: \(top: 18mm, bottom: 26\.727mm, inside: 13mm, outside: 13mm\)/)
  assert.match(g, /footer-descent: 8\.727mm/)
  // Boîte de ligne de 1 em : le pas vaut exactement l'interligne.
  assert.match(g, /top-edge: 0\.8em, bottom-edge: -0\.2em, fill: cmyk\(0%, 0%, 0%, 100%\)/)
  assert.match(g, /leading: 12\.4pt - 1em, spacing: 12\.4pt - 1em, first-line-indent: \(amount: 4\.5mm, all: true\)/)
  assert.match(g, /lang: "fr"/)
  // Intertitre : une ligne blanche avant (2 pas moins une boîte), aucune après.
  assert.match(g, /block\(above: 14\.3pt, below: 1\.9pt/)
  // Chapitre : belle page, bloc de 11 lignes, première ligne du titre à la 7e.
  assert.match(g, /pagebreak\(to: "odd", weak: true\)/)
  assert.match(g, /block\(height: 136\.4pt/)
  assert.match(g, /v\(72\.4pt\)/)
  assert.match(g, /weight: 600/)
})

test('sans belle page ni langue', () => {
  const g = gabaritTypst({ ...MODELE, chapitre: { ...MODELE.chapitre, bellePage: false } })
  assert.doesNotMatch(g, /#set document/)
  assert.doesNotMatch(g, /lang:/)
  assert.doesNotMatch(g, /to: "odd"/)
  assert.match(g, /pagebreak\(weak: true\)/)
})

test('les chaînes Typst sont échappées', () => {
  assert.equal(chaineTypst('a "b" \\ c\nd\te\r\nf'), '"a \\"b\\" \\\\ c\\nd\\te\\nf"')
  assert.equal(chaineTypst(undefined), '""')
})

test('le nom du fichier exporté', () => {
  assert.equal(nomDeFichier('Petit conte : « immoral » ?', 'pdf'), 'Petit conte « immoral ».pdf')
  assert.equal(nomDeFichier('a/b\\c\u0007d', 'md'), 'a b c d.md')
  assert.equal(nomDeFichier('  ', 'md'), 'document.md')
  assert.equal(nomDeFichier(null, 'pdf'), 'document.pdf')
  assert.equal(nomDeFichier('été', 'md'), 'été.md')
})

test('nom de fichier : 120 signes comptés en points de code, jamais un emoji coupé en deux (audit du 10/11/2026)', () => {
  const nom = nomDeFichier('😀'.repeat(130), 'pdf')
  assert.equal([...nom.replace(/\.pdf$/, '')].length, 120)
  assert.ok(
    !/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/.test(nom.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')),
    'aucune demi-paire',
  )
})

test('titre : les espaces insécables restent, les blancs ordinaires sont resserrés (audit du 10/11/2026)', () => {
  assert.equal(titreDocument('  Le\u00A0titre\u202F:   une\t\nsuite ').titre, 'Le\u00A0titre\u202F: une suite')
  assert.equal(titreDocument('   ').titre, null)
})
