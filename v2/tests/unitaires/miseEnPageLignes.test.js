// La grille stricte, comptée en lignes (27/11/2026, docs/v2-grille-plan.md) : la règle et son gabarit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lignesOccupees,
  demiLigneAjoutee,
  blancsDuBloc,
  grilleEnLignes,
  gabaritEnLignes,
  gabaritTypst,
  grille,
  estEnLignes,
} from '../../domaine/index.js'
import { MODELE_EN_LIGNES } from '../donnees/modele-en-lignes.js'
import { REPRISE_MODELES } from '../../design/livre.js'

const avec = (changements) => {
  const m = structuredClone(MODELE_EN_LIGNES)
  for (const [cle, v] of Object.entries(changements)) {
    const k = cle.split('.')
    k.slice(0, -1).reduce((o, p) => o[p], m)[k.at(-1)] = v
  }
  return m
}

test('un titre occupe le nombre entier de lignes que sa taille demande', () => {
  // Pas de 14 pt, 1,15 fois le corps par ligne de titre.
  assert.equal(lignesOccupees(11, 14, 1.15), 1) // 12,65 pt
  assert.equal(lignesOccupees(12, 14, 1.15), 1) // 13,8 pt
  assert.equal(lignesOccupees(13, 14, 1.15), 2) // 14,95 pt : le seuil
  assert.equal(lignesOccupees(24, 14, 1.15), 2) // 27,6 pt
  assert.equal(lignesOccupees(25, 14, 1.15), 3)
  // Sur deux lignes, le titre entier est arrondi, non chaque ligne : 29,9 pt font 3 lignes, pas 4.
  assert.equal(lignesOccupees(13, 14, 1.15, 2), 3)
  assert.equal(lignesOccupees(11, 14, 1.15, 2), 2)
  // Une hauteur qui tombe juste ne monte pas d'une ligne.
  assert.equal(lignesOccupees(14, 14, 1), 1)
  assert.equal(lignesOccupees(4, 14, 1.15), 1, 'jamais moins d’une ligne')
})

test('une demi-ligne est ajoutée quand les deux blancs ne font pas un nombre entier', () => {
  assert.equal(demiLigneAjoutee(1.5, 0.5), false)
  assert.equal(demiLigneAjoutee(1, 0), false)
  assert.equal(demiLigneAjoutee(0.5, 0), true)
  assert.equal(demiLigneAjoutee(1, 0.5), true)
  assert.equal(demiLigneAjoutee(0, 0), false)
  // Une valeur hors pas est ramenée à la demi-ligne ; une valeur absurde vaut zéro.
  assert.equal(demiLigneAjoutee(0.4, 0), true)
  assert.equal(demiLigneAjoutee(NaN, -3), false)
})

test('les blancs d’un bloc : l’entier dehors, la demi-ligne dedans', () => {
  assert.deepEqual(blancsDuBloc(1.5, 0.5), { dehors: 1, dedans: 0.5, apres: 0.5 })
  assert.deepEqual(blancsDuBloc(1, 0), { dehors: 1, dedans: 0, apres: 0 })
  // La demi-ligne ajoutée s'ajoute au blanc avant : 0,5 + 0,5 fait une ligne entière, dehors.
  assert.deepEqual(blancsDuBloc(0.5, 0), { dehors: 1, dedans: 0, apres: 0 })
  assert.deepEqual(blancsDuBloc(1, 0.5), { dehors: 1, dedans: 0.5, apres: 0.5 })
  // Un titre qui ouvre une page garde tout son blanc : Typst retirerait un blanc placé hors du bloc.
  assert.deepEqual(blancsDuBloc(13, 0, true), { dehors: 0, dedans: 13, apres: 0 })
  for (const [a, b] of [
    [0, 0],
    [0.5, 0],
    [1.5, 2],
    [3, 0.5],
    [2.5, 2.5],
  ]) {
    const r = blancsDuBloc(a, b)
    assert.ok(Number.isInteger(r.dehors + r.dedans + r.apres), `${a} et ${b} : un nombre entier de lignes`)
  }
})

test('la grille d’un modèle en lignes : la marge de pied vient du nombre de lignes', () => {
  const g = grilleEnLignes(MODELE_EN_LIGNES)
  assert.equal(g.pas, 14)
  assert.equal(g.lignes, 33)
  assert.equal(g.hauteurTexte, 462)
  assert.ok(Math.abs(g.margeBas - (220 - 25 - 462 / (72 / 25.4))) < 1e-9)
  assert.ok(Math.abs(g.margeBas - 32.01) < 0.01, 'environ 32 mm')
  // `grille` et `gabaritTypst` reconnaissent le modèle à sa règle.
  assert.equal(estEnLignes(MODELE_EN_LIGNES), true)
  assert.equal(estEnLignes(REPRISE_MODELES[0].valeurs), false)
  assert.deepEqual(grille(MODELE_EN_LIGNES), g)
  assert.equal(gabaritTypst(MODELE_EN_LIGNES, { titre: 'T' }), gabaritEnLignes(MODELE_EN_LIGNES, { titre: 'T' }))
})

test('un modèle en lignes impossible est refusé avec sa raison', () => {
  const raison = (m) => {
    try {
      grilleEnLignes(m)
      return null
    } catch (e) {
      assert.equal(e.code, 'modele-impossible')
      return e.raison
    }
  }
  assert.equal(raison(avec({ 'grille.lignes': NaN })), 'valeur')
  assert.equal(raison(avec({ 'grille.hauteurTitre': undefined })), 'valeur')
  // La largeur et les marges de côté aussi : elles s'écrivent dans le gabarit (audit partiel du 27/11/2026).
  for (const cle of ['page.largeur', 'marges.interieure', 'marges.exterieure'])
    assert.equal(raison(avec({ [cle]: 'x' })), 'valeur', cle)
  assert.equal(raison(avec({ 'grille.interligne': 10 })), 'interligne', 'un interligne sous le corps')
  assert.equal(raison(avec({ 'styles.citation.corps': 15 })), 'interligne', 'une citation plus haute que la brique')
  assert.equal(raison(avec({ 'grille.lignes': 33.5 })), 'lignes')
  assert.equal(raison(avec({ 'grille.lignes': 0 })), 'lignes')
  assert.equal(raison(avec({ 'grille.lignes': 60 })), 'lignes', 'plus de lignes que la page n’en contient')
  // 38 lignes laissent 7,3 mm de pied : moins que les deux pas qu'il faut au numéro de page.
  assert.equal(raison(avec({ 'grille.lignes': 38 })), 'folio')
  assert.equal(raison(avec({ 'grille.lignes': 38, 'folio.position': 'aucun' })), null)
  // Une marge de tête de 9 mm (25,5 pt) ne loge pas l'en-tête à deux pas (28 pt) du texte ; sans en-tête, si.
  assert.equal(raison(avec({ 'marges.haut': 9, 'grille.lignes': 30 })), 'enTete')
  assert.equal(
    raison(
      avec({
        'marges.haut': 9,
        'grille.lignes': 30,
        'folio.position': 'haut-exterieur',
        'enTete.gauche': 'rien',
        'enTete.droite': 'rien',
      }),
    ),
    'enTete',
  )
  assert.equal(
    raison(avec({ 'marges.haut': 9, 'grille.lignes': 30, 'enTete.gauche': 'rien', 'enTete.droite': 'rien' })),
    null,
  )
  // Un titre plus gros que le pas n'est pas un obstacle : il est mesuré.
  assert.equal(raison(avec({ 'styles.titre1.corps': 40 })), null)
})

test('le gabarit en lignes : la brique, les blancs en lignes, les titres mesurés', () => {
  const g = gabaritEnLignes(MODELE_EN_LIGNES, { titre: 'Essai', langue: 'fr', auteur: 'Ada', surlignage: '#d8f5a2' })
  assert.match(g, /^#set document\(title: "Essai", author: "Ada"\)\n#let amend-pas = 14pt\n/)
  // La brique : chaque ligne fait un pas, rien entre les lignes ni entre les blocs.
  assert.match(g, /#set text\(font: \("EB Garamond",\), size: 11pt, .*top-edge: amend-pas, bottom-edge: "baseline"/)
  assert.match(
    g,
    /#set par\(justify: true, leading: 0pt, spacing: 0pt, first-line-indent: \(amount: 5mm, all: true\)\)/,
  )
  assert.match(g, /#set block\(spacing: 0pt\)/)
  // La marge de pied vient des 33 lignes ; l'en-tête et le numéro de page sont à un pas du texte.
  assert.match(g, /margin: \(top: 25mm, bottom: 32\.017mm - 0\.1pt, inside: 21mm, outside: 18mm\)/)
  assert.match(g, /footer-descent: amend-pas \+ 0\.1pt, header-ascent: amend-pas/)
  // Titre 3 : 1 ligne ½ avant, ½ après → une ligne hors du bloc, une demie dedans, une demie après ; 13 pt × 1,15.
  assert.match(
    g,
    /#show heading\.where\(level: 3\): it => amend-mesure\(14pt, 7pt, 7pt, \{ set text\(size: 13pt, weight: "bold", style: "normal", top-edge: 14\.95pt, hyphenate: false\)/,
  )
  // Titre 5 : ½ avant, rien après → la demi-ligne ajoutée fait une ligne entière avant.
  assert.match(g, /#show heading: it => amend-mesure\(14pt, 0pt, 0pt, /)
  // Titre 1, en belle page : tout son blanc (13 lignes) est gardé dans le bloc, après le saut de page.
  assert.match(
    g,
    /#show heading\.where\(level: 1\): it => \{\[#metadata\(none\) <amend-fin>\]; pagebreak\(to: "odd", weak: true\); \[#metadata\(none\) <amend-debut>\]; amend-mesure\(0pt, 182pt, 0pt, .*smallcaps\(it\.body\)/,
  )
  // La citation : en briques, au retrait de l'alinéa ; la bibliographie : en retrait suspendu.
  assert.match(
    g,
    /#show quote\.where\(block: true\): it => amend-brique\(0pt, 7pt, 7pt, \{ set text\(size: 10pt, .*pad\(left: 5mm, /,
  )
  assert.match(
    g,
    /#let amend-bibliographie\(corps\) = amend-brique\(0pt, 0pt, 0pt, .*hanging-indent: 5mm\); align\(left, par\(corps\)\)/,
  )
  // Images et tableaux : un nombre entier de lignes.
  assert.match(g, /#show image: it => amend-entier\(it\)\n#show table: it => amend-entier\(it\)/)
  assert.match(g, /#let amend-surligne\(corps\) = highlight\(fill: rgb\("#d8f5a2"\), corps\)/)
  // Toutes les fonctions que le corps du document appelle existent.
  for (const nom of [
    'blanc',
    'separateur',
    'titre',
    'sous-titre',
    'legende',
    'bibliographie',
    'surligne',
    'sans-alinea',
    'sans-alinea-2',
  ])
    assert.match(g, new RegExp(`#let amend-${nom}[ (]`), nom)
  assert.doesNotMatch(g, /NaN|undefined|Infinity/)
})

test('le gabarit en lignes : débuts, numéros de page, en-têtes, séparateur', () => {
  const suite = gabaritEnLignes(avec({ 'chapitre.debut': 'continuer', 'ouverture2.debut': 'continuer' }))
  assert.match(suite, /#show heading\.where\(level: 1\): it => amend-mesure\(182pt, 0pt, 0pt, /)
  assert.doesNotMatch(suite, /pagebreak/)
  assert.doesNotMatch(suite, /ouverture2/)
  const page = gabaritEnLignes(avec({ 'chapitre.debut': 'page' }))
  assert.match(page, /level: 1\): it => \{\[#metadata\(none\) <amend-fin>\]; pagebreak\(weak: true\); /)
  // Sans en-tête ni numéro : ni l'un ni l'autre.
  const nu = gabaritEnLignes(avec({ 'folio.position': 'aucun', 'enTete.gauche': 'rien', 'enTete.droite': 'rien' }))
  assert.match(nu, /footer: none, header: none\)/)
  const enHaut = gabaritEnLignes(avec({ 'folio.position': 'haut-exterieur' }))
  assert.match(enHaut, /footer: none, header: context/)
  assert.match(enHaut, /place\(if calc\.odd\(p\) \{ right \} else \{ left \} \+ bottom, counter\(page\)\.display\(\)\)/)
  // Le texte libre d'un en-tête est échappé.
  const libre = gabaritEnLignes(avec({ 'enTete.gauche': 'texte', 'enTete.texteGauche': 'Un "titre"' }))
  assert.match(libre, /\[#"Un \\"titre\\""\]/)
  assert.match(
    gabaritEnLignes(avec({ separateur: 'points' })),
    /#let amend-separateur = block\(width: 100%, align\(center, "• • •"\)\)/,
  )
  assert.match(
    gabaritEnLignes(MODELE_EN_LIGNES),
    /#let amend-separateur = block\(width: 100%, height: amend-pas, breakable: false\)/,
  )
  assert.match(gabaritEnLignes(avec({ 'folio.depart': 7 })), /#counter\(page\)\.update\(7\)\n$/)
  assert.match(gabaritEnLignes(avec({ cesure: false })), /hyphenate: false, top-edge: amend-pas/)
})
