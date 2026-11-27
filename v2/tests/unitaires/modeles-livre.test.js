// Les modèles du design, comptés en lignes depuis le 27/11/2026 (docs/v2-grille-plan.md) : chaque modèle se
// valide avec les règles, sa grille tient, et il est la conversion au plus proche du modèle en points d'alors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  grille,
  verifierModele,
  appliquerReglages,
  gabaritTypst,
  estEnLignes,
  valeursEnLignes,
  NOMS_STYLES,
} from '../../domaine/index.js'
import { MODELES_LIVRE, REGLES_MODELES, REPRISE_MODELES, HAUTEUR_TITRE_DU_LIVRE } from '../../design/livre.js'
import { MODELES_EN_POINTS, REPRISE_EN_POINTS } from '../donnees/modeles-en-points.js'

const a4 = MODELES_LIVRE[0]
const TOUS = [a4, ...REPRISE_MODELES.map((r) => r.valeurs)]
const repris = (id) => REPRISE_MODELES.find((r) => r.id === id).valeurs

test('un seul modèle dans le code, l’A4 simple, compté en lignes, et sa grille tient', () => {
  assert.deepEqual(
    MODELES_LIVRE.map((m) => m.id),
    ['a4'],
  )
  assert.equal(estEnLignes(a4), true)
  assert.equal(grille(a4).lignes, 50)
  assert.match(gabaritTypst(a4), /width: 210mm, height: 297mm/)
  assert.match(gabaritTypst(a4), /top-edge: amend-pas/)
})

test('les réglages ouverts : sans doublon, chacun dans une rubrique, la même fiche pour les dix styles', () => {
  const cles = REGLES_MODELES.reglables.map((r) => r.cle)
  assert.equal(new Set(cles).size, cles.length, 'pas de doublon')
  for (const r of REGLES_MODELES.reglables) assert.ok(['page', 'texte', 'styles', 'pages'].includes(r.groupe), r.cle)
  const fiche = ['corps', 'gras', 'italique', 'capitales', 'petitesCapitales', 'alignement', 'blancAvant', 'blancApres']
  for (const style of NOMS_STYLES.filter((n) => n !== 'texte'))
    assert.deepEqual(
      cles.filter((c) => c.startsWith(`styles.${style}.`)).map((c) => c.split('.')[2]),
      fiche,
      style,
    )
  // Le texte courant : sa police, son alignement, son alinéa ; son corps est celui de la grille.
  assert.deepEqual(
    cles.filter((c) => c.startsWith('styles.texte.')),
    ['styles.texte.police', 'styles.texte.alignement', 'styles.texte.alinea'],
  )
  // Ce que la grille stricte ne règle plus (plan, § 7).
  for (const cle of [
    'marges.bas',
    'folio.bas',
    'chapitre.ligneTitre',
    'enTete.police',
    'enTete.corps',
    'styles.titre1.police',
  ])
    assert.ok(!cles.includes(cle), cle)
  assert.equal(cles.length, 106)
})

test('les modèles du code et les modèles repris (TàT - Poche, A5, livre de poche, TàT 140 × 220) respectent les règles', () => {
  assert.deepEqual(
    REPRISE_MODELES.map((r) => r.id),
    ['tat-poche', 'a5', 'livre-de-poche', 'tat-140x220'],
  )
  for (const modele of TOUS) {
    assert.equal(estEnLignes(modele), true)
    const r = verifierModele(modele, REGLES_MODELES)
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.doesNotThrow(() => grille(modele))
    assert.equal(modele.grille.hauteurTitre, HAUTEUR_TITRE_DU_LIVRE)
    assert.doesNotMatch(gabaritTypst(modele, { titre: 'T' }), /NaN|undefined/)
  }
})

test('chaque modèle livré est la conversion au plus proche du modèle en points d’alors', () => {
  const avant = [MODELES_EN_POINTS[0], ...REPRISE_EN_POINTS.map((r) => r.valeurs)]
  const sansId = (m) => Object.fromEntries(Object.entries(m).filter(([cle]) => cle !== 'id'))
  TOUS.forEach((modele, i) => {
    assert.deepEqual(sansId(modele), valeursEnLignes(sansId(avant[i]), HAUTEUR_TITRE_DU_LIVRE), `modèle n° ${i}`)
  })
})

test('un blanc se règle par demi-ligne : une autre valeur est refusée', () => {
  const regler = (reglages) => appliquerReglages(a4, reglages, REGLES_MODELES)
  assert.equal(regler({ 'styles.titre3.blancAvant': 1.5 }).ok, true)
  assert.equal(regler({ 'styles.titre3.blancAvant': 0 }).ok, true)
  assert.deepEqual(regler({ 'styles.titre3.blancAvant': 1.2 }), {
    ok: false,
    code: 'reglage-hors-bornes',
    reglage: 'styles.titre3.blancAvant',
  })
  assert.equal(regler({ 'styles.titre3.blancApres': -0.5 }).ok, false)
  assert.equal(regler({ 'grille.lignes': 50.5 }).ok, false, 'un nombre entier de lignes par page')
  // Plus de lignes que la page n'en contient : modèle impossible.
  assert.deepEqual(regler({ 'grille.lignes': 80 }), { ok: false, code: 'modele-impossible', raison: 'lignes' })
  assert.equal(regler({ 'marges.bas': 20 }).code, 'reglage-inconnu', 'la marge basse ne se règle plus')
})

test('formats de base (Sylvain, 15/11/2026) : A5 et livre de poche, au format et à la grille standards', () => {
  const [a5, poche] = [repris('a5'), repris('livre-de-poche')]
  assert.deepEqual([a5.page.largeur, a5.page.hauteur], [148, 210])
  assert.deepEqual([poche.page.largeur, poche.page.hauteur], [108, 178])
  for (const m of [a5, poche]) {
    assert.ok(m.marges.interieure > m.marges.exterieure, 'une marge intérieure plus large (la reliure)')
    assert.equal(m.chapitre.debut, 'belle-page')
  }
  assert.deepEqual([grille(a5).lignes, grille(poche).lignes], [34, 35])
  // Le corps baisse avec le format.
  assert.ok(poche.grille.corps < a5.grille.corps && a5.grille.corps <= a4.grille.corps)
})

test('« TàT 140 × 220 » : 33 lignes, parties en titre 1 et chapitres en titre 2, en belle page, aux mêmes lignes', () => {
  const m = repris('tat-140x220')
  assert.deepEqual([m.page.largeur, m.page.hauteur], [140, 220])
  assert.equal(grille(m).lignes, 33)
  assert.deepEqual([m.chapitre.debut, m.ouverture2.debut], ['belle-page', 'belle-page'])
  // Le titre de partie (14 pt : deux lignes de grille) garde sa ligne de base sur la ligne 14, le texte reprend
  // à la ligne 18 ; le titre de chapitre est à la ligne 6, son texte à la ligne 11.
  assert.deepEqual([m.styles.titre1.blancAvant, m.styles.titre1.blancApres], [12, 3])
  assert.deepEqual([m.styles.titre2.blancAvant, m.styles.titre2.blancApres], [5, 4])
  // 21 pt avant et 7 pt après, sur une grille de 14 pt : une ligne et demie, une demie.
  assert.deepEqual([m.styles.titre3.blancAvant, m.styles.titre3.blancApres], [1.5, 0.5])
  assert.deepEqual(
    [m.styles.citation.corps, m.styles.citation.blancAvant, m.styles.citation.blancApres],
    [10, 0.5, 0.5],
  )
  assert.deepEqual([m.folio.ouverture, m.folio.ouverture2], [false, true])
  assert.deepEqual(
    [m.enTete.gauche, m.enTete.droite, m.enTete.petitesCapitales, m.enTete.italique],
    ['titreDocument', 'chapitre', true, false],
  )
  assert.equal(m.styles.titre1.petitesCapitales, true)
  assert.equal(m.chapitre.premierSansAlinea, false, 'le premier paragraphe d’un chapitre garde son alinéa')
  // La première ligne de base ne bouge pas : 25 mm + 0,8 × 11 pt hier, la marge de tête + un pas aujourd'hui.
  const base = (mm, pt) => mm + pt / (72 / 25.4)
  assert.ok(Math.abs(base(m.marges.haut, 14) - base(25, 8.8)) < 0.06)
})

test('les autres modèles : titre 2 dans le texte, en-têtes en italique, blancs en demi-lignes', () => {
  for (const m of TOUS.filter((x) => x !== repris('tat-140x220'))) {
    assert.equal(m.ouverture2.debut, 'continuer')
    assert.deepEqual([m.enTete.italique, m.enTete.petitesCapitales], [true, false])
    for (const [nom, st] of Object.entries(m.styles)) {
      assert.ok(!st.petitesCapitales && !st.capitales)
      // Les blancs convertis sont des demi-lignes.
      if (nom !== 'texte') assert.ok(Number.isInteger(st.blancAvant * 2) && Number.isInteger(st.blancApres * 2), nom)
    }
  }
})

test('séparateur de scène « trois points » (Sylvain, 22/11/2026) : un réglage permis, trois puces centrées dans le gabarit', () => {
  const m = { ...a4, separateur: 'points' }
  assert.equal(verifierModele(m, REGLES_MODELES).ok, true)
  assert.match(gabaritTypst(m), /#let amend-separateur = block\(width: 100%, align\(center, "• • •"\)\)/)
  assert.equal(
    verifierModele({ ...a4, separateur: 'pointilles' }, REGLES_MODELES).ok,
    false,
    'un signe inconnu est refusé',
  )
})
