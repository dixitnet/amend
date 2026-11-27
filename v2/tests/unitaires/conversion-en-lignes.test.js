// La conversion d'un modèle en points vers un modèle compté en lignes (27/11/2026, docs/v2-grille-plan.md, § 5).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { versModeleEnLignes, valeursEnLignes, verifierModele, grille, estEnLignes } from '../../domaine/index.js'
import { REGLES_MODELES } from '../../design/livre.js'
import { MODELES_EN_POINTS, REPRISE_EN_POINTS } from '../donnees/modeles-en-points.js'

const a4 = () => structuredClone(MODELES_EN_POINTS[0])
const tat = () => structuredClone(REPRISE_EN_POINTS.find((r) => r.id === 'tat-140x220').valeurs)

test('« A4 simple » en points devient un modèle en lignes valide : mêmes lignes par page, même première ligne de base', () => {
  const avant = a4()
  const m = versModeleEnLignes(avant, 1.15)
  assert.equal(estEnLignes(m), true)
  assert.equal(verifierModele(m, REGLES_MODELES).ok, true)
  assert.equal(m.grille.lignes, grille(avant).lignes)
  // Hier : la marge de tête plus 0,8 corps ; aujourd'hui : la marge de tête plus un pas.
  const mm = (pt) => pt / (72 / 25.4)
  assert.ok(Math.abs(m.marges.haut + mm(14) - (avant.marges.haut + mm(0.8 * 11))) < 0.06)
  // Un blanc en points : ce qu'il ajoutait à l'espace ordinaire (3 pt), en demi-lignes de 14 pt.
  assert.deepEqual([m.styles.titre3.blancAvant, m.styles.titre3.blancApres], [1, 0], '17 pt et 3 pt')
  assert.deepEqual([m.styles.titre.blancAvant, m.styles.titre.blancApres], [0.5, 1], '9,8 pt et 15,2 pt')
  // Ce que la grille stricte ne règle plus n'est pas repris.
  assert.equal(m.marges.bas, undefined)
  assert.equal(m.folio.bas, undefined)
  assert.equal(m.enTete.police, undefined)
  assert.equal(m.styles.citation.retrait, undefined)
  assert.equal(m.chapitre.ligneTitre, undefined)
})

test('un titre à lignes d’ouverture garde sa ligne et celle où le texte reprend', () => {
  const m = versModeleEnLignes(tat(), 1.15)
  // Partie : 14 pt (deux lignes de grille), titre ligne 14, texte ligne 18.
  assert.deepEqual([m.styles.titre1.blancAvant, m.styles.titre1.blancApres], [12, 3])
  // Chapitre (titre 2, qui ouvre une page) : 11 pt, titre ligne 6, texte ligne 11.
  assert.deepEqual([m.styles.titre2.blancAvant, m.styles.titre2.blancApres], [5, 4])
  // Un titre plus gros que la place avant sa ligne : pas de blanc négatif.
  const gros = tat()
  gros.styles.titre1.corps = 96
  gros.chapitre.ligneTitre = 2
  assert.equal(versModeleEnLignes(gros, 1.15).styles.titre1.blancAvant, 0)
})

test('un modèle incomplet se convertit sans erreur (audit partiel du 27/11/2026)', () => {
  const sansChapitre = a4()
  delete sansChapitre.chapitre
  delete sansChapitre.ouverture2
  delete sansChapitre.folio
  delete sansChapitre.enTete
  const m = versModeleEnLignes(sansChapitre, 1.15)
  assert.equal(m.chapitre.debut, 'belle-page')
  assert.equal(m.ouverture2.debut, 'continuer')
  assert.deepEqual(m.folio, { position: 'bas-centre', depart: 1, ouverture: true, ouverture2: true })
  assert.doesNotMatch(JSON.stringify(m), /null|NaN/)
  // Des lignes d'ouverture illisibles : le titre garde les blancs de son style.
  const illisible = a4()
  illisible.chapitre.ligneTitre = 'x'
  assert.equal(Number.isFinite(versModeleEnLignes(illisible, 1.15).styles.titre1.blancAvant), true)
  // Un blanc qui n'est pas un nombre vaut l'espace ordinaire : aucune ligne.
  const sansBlanc = a4()
  sansBlanc.styles.titre3.espaceAvant = undefined
  assert.equal(versModeleEnLignes(sansBlanc, 1.15).styles.titre3.blancAvant, 0)
})

test('un style en briques ne dépasse pas le pas ; hors du texte, un style est à gauche ou centré', () => {
  const avant = a4()
  avant.styles.citation.corps = 18
  avant.styles.titre3.alignement = 'justifie'
  const m = versModeleEnLignes(avant, 1.15)
  assert.equal(m.styles.citation.corps, 14)
  assert.equal(m.styles.titre3.alignement, 'gauche')
  assert.equal(m.styles.titre.alignement, 'centre')
  assert.equal(verifierModele(m, REGLES_MODELES).ok, true)
})

test('valeursEnLignes : un modèle déjà en lignes est rendu tel quel ; des valeurs partielles sont complétées puis converties', () => {
  const enLignes = versModeleEnLignes(a4(), 1.15)
  assert.equal(valeursEnLignes(enLignes, 1.15), enLignes)
  // Un modèle enregistré qui ne porte que son format : le reste vient de « A4 simple » en points.
  const partiel = valeursEnLignes({ page: { largeur: 150, hauteur: 220 } }, 1.15)
  assert.deepEqual([partiel.regle, partiel.page.largeur, partiel.styles.texte.police], ['lignes', 150, 'EB Garamond'])
  assert.equal(valeursEnLignes(undefined, 1.15).regle, 'lignes')
})
